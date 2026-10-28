/**
 * Bounded DataForSEO HTTP client.
 *
 * Safety properties:
 * - Basic Auth comes from auth.mjs; the header is a private field.
 * - explicit timeout, bounded response size, bounded retries, bounded concurrency
 * - request deduplication and a local raw-response cache
 * - rate-limit and provider error classification
 * - task and cost tracking, with optional ceilings
 * - raw responses stay in the local cache; only normalized observations are
 *   written to an audit artifact
 *
 * The client never logs request headers or credential material.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { authorizationHeader, credentialsPresent, redactSecrets } from "./auth.mjs";

const DEFAULT_BASE = "https://api.dataforseo.com";
const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_MAX_CONCURRENCY = 4;
const DEFAULT_MAX_RETRIES = 2;
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

export class ProviderError extends Error {
  constructor(message, { kind = "provider", status = null, endpoint = "", retryable = false } = {}) {
    super(message);
    this.name = "ProviderError";
    this.kind = kind;
    this.status = status;
    this.endpoint = endpoint;
    this.retryable = retryable;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function readBounded(response, limit = MAX_RESPONSE_BYTES) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (received + value.byteLength > limit) {
        chunks.push(value.slice(0, limit - received));
        received = limit;
        await reader.cancel();
        break;
      }
      chunks.push(value);
      received += value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }
  const merged = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

function classifyHttp(status) {
  if (status === 401 || status === 403) return { kind: "auth", retryable: false };
  if (status === 402) return { kind: "quota", retryable: false };
  if (status === 429) return { kind: "rate_limit", retryable: true };
  if (status >= 500) return { kind: "server", retryable: true };
  if (status >= 400) return { kind: "bad_request", retryable: false };
  return { kind: "provider", retryable: false };
}

function classifyProviderStatus(statusCode, message) {
  const text = String(message || "").toLowerCase();
  if (statusCode === 20000) return null;
  if (statusCode === 40100 || statusCode === 40101 || statusCode === 40102) return { kind: "auth", retryable: false };
  if (statusCode === 40200 || statusCode === 40201 || statusCode === 40202 || statusCode === 40203) return { kind: "quota", retryable: false };
  if (statusCode === 40501 || statusCode === 40502 || statusCode === 40503) return { kind: "rate_limit", retryable: true };
  if (statusCode >= 50000) return { kind: "server", retryable: true };
  if (text.includes("rate limit")) return { kind: "rate_limit", retryable: true };
  if (text.includes("authorization") || text.includes("credential")) return { kind: "auth", retryable: false };
  return { kind: "provider", retryable: false };
}

function providerMessage(text) {
  const value = String(text || "").slice(0, 240);
  return redactSecrets(value);
}

export class DataForSeoClient {
  #authorization;
  #inFlight = new Map();
  #semaphore = { active: 0, queue: [] };
  #cacheDir;
  #tasks = 0;
  #cost = 0;
  #errors = [];
  #closed = false;
  #budgetExceeded = false;

  constructor(options = {}) {
    const env = options.env || process.env;
    if (!credentialsPresent(env)) {
      throw new ProviderError(
        "DataForSEO credentials are not set. Live mode requires DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD; fixture mode needs none.",
        { kind: "auth" },
      );
    }
    this.#authorization = authorizationHeader(env);
    this.baseUrl = String(options.baseUrl || DEFAULT_BASE).replace(/\/+$/, "");
    this.timeoutMs = Math.max(1000, Number(options.timeoutMs) || DEFAULT_TIMEOUT_MS);
    this.maxConcurrency = Math.max(1, Math.min(32, Number(options.maxConcurrency) || DEFAULT_MAX_CONCURRENCY));
    this.maxRetries = Math.max(0, Math.min(6, Number(options.maxRetries ?? DEFAULT_MAX_RETRIES)));
    this.maxTasks =
      options.maxTasks === null || options.maxTasks === undefined || options.maxTasks === ""
        ? null
        : Number.isFinite(Number(options.maxTasks))
          ? Number(options.maxTasks)
          : null;
    // Number(null) is 0. A missing cost ceiling must remain null, not become
    // an immediate zero-dollar ceiling.
    this.maxCostUsd =
      options.maxCostUsd === null || options.maxCostUsd === undefined || options.maxCostUsd === ""
        ? null
        : Number.isFinite(Number(options.maxCostUsd))
          ? Number(options.maxCostUsd)
          : null;
    this.useCache = options.useCache !== false;
    this.#cacheDir = options.cacheDir ? path.resolve(options.cacheDir) : path.resolve(".cache", "dataforseo");
    this.fetchImpl = options.fetchImpl || globalThis.fetch;
    this.userAgent = options.userAgent || "local-visibility-scorecard/1.0 (+https://github.com/thatguynef/local-visibility-scorecard)";
  }

  get taskCount() {
    return this.#tasks;
  }

  get costUsd() {
    return Number(this.#cost.toFixed(6));
  }

  get errors() {
    return [...this.#errors];
  }

  get budgetExceeded() {
    return this.#budgetExceeded;
  }

  async acquire() {
    if (this.#semaphore.active < this.maxConcurrency) {
      this.#semaphore.active += 1;
      return;
    }
    await new Promise((resolve) => this.#semaphore.queue.push(resolve));
    this.#semaphore.active += 1;
  }

  release() {
    this.#semaphore.active = Math.max(0, this.#semaphore.active - 1);
    const next = this.#semaphore.queue.shift();
    if (next) next();
  }

  cacheKey(endpoint, task) {
    return crypto.createHash("sha256").update(`${endpoint}\n${JSON.stringify(task)}`).digest("hex");
  }

  cachePath(key) {
    return path.join(this.#cacheDir, `${key}.json`);
  }

  readCache(key) {
    if (!this.useCache) return null;
    try {
      const file = this.cachePath(key);
      if (!fs.existsSync(file)) return null;
      return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      return null;
    }
  }

  writeCache(key, value) {
    if (!this.useCache) return;
    try {
      fs.mkdirSync(this.#cacheDir, { recursive: true });
      fs.writeFileSync(this.cachePath(key), JSON.stringify(value), "utf8");
    } catch {
      // A cache write failure must not corrupt or fail a live audit.
    }
  }

  async request(endpoint, tasks, { taskType = "task", cache = true } = {}) {
    if (this.#closed) throw new ProviderError("client is closed", { kind: "closed", endpoint });
    if (!Array.isArray(tasks) || tasks.length !== 1) {
      throw new ProviderError("each live DataForSEO request must contain exactly one task", {
        kind: "bad_request",
        endpoint,
      });
    }
    if (this.#budgetExceeded) {
      throw new ProviderError("the configured cost ceiling has been reached", { kind: "budget", endpoint });
    }
    if (this.maxTasks !== null && this.#tasks >= this.maxTasks) {
      throw new ProviderError(`the configured task ceiling (${this.maxTasks}) has been reached`, {
        kind: "budget",
        endpoint,
      });
    }
    const key = this.cacheKey(endpoint, tasks[0]);
    if (cache && this.useCache) {
      const cached = this.readCache(key);
      if (cached) {
        this.#tasks += 1;
        this.#cost += Number(cached.cost) || 0;
        return { ...cached, cached: true, taskType };
      }
    }
    if (this.#inFlight.has(key)) return this.#inFlight.get(key);
    const promise = this.#requestWithRetry(endpoint, tasks[0], taskType, key, cache);
    this.#inFlight.set(key, promise);
    try {
      return await promise;
    } finally {
      this.#inFlight.delete(key);
    }
  }

  async #requestWithRetry(endpoint, task, taskType, key, cache) {
    let lastError = null;
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      await this.acquire();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const response = await this.fetchImpl(`${this.baseUrl}${endpoint}`, {
          method: "POST",
          headers: {
            Authorization: this.#authorization,
            "Content-Type": "application/json",
            "User-Agent": this.userAgent,
          },
          body: JSON.stringify([task]),
          signal: controller.signal,
        });
        const text = await readBounded(response);
        if (!response.ok) {
          const classification = classifyHttp(response.status);
          const error = new ProviderError(
            `DataForSEO request failed (HTTP ${response.status}) for ${endpoint}`,
            { kind: classification.kind, status: response.status, endpoint, retryable: classification.retryable },
          );
          if (classification.retryable && attempt < this.maxRetries) {
            lastError = error;
            await sleep(400 * 3 ** attempt);
            continue;
          }
          throw error;
        }
        let payload;
        try {
          payload = JSON.parse(text);
        } catch {
          throw new ProviderError("DataForSEO returned a non-JSON or oversized response", {
            kind: "invalid_response",
            endpoint,
          });
        }
        const taskEntry = Array.isArray(payload.tasks) ? payload.tasks[0] : null;
        const providerIssue = classifyProviderStatus(Number(payload.status_code), payload.status_message);
        if (providerIssue) {
          const error = new ProviderError(
            `DataForSEO provider error ${payload.status_code}: ${providerMessage(payload.status_message)}`,
            { kind: providerIssue.kind, status: payload.status_code, endpoint, retryable: providerIssue.retryable },
          );
          if (providerIssue.retryable && attempt < this.maxRetries) {
            lastError = error;
            await sleep(400 * 3 ** attempt);
            continue;
          }
          throw error;
        }
        // DataForSEO can return a top-level 20000 with a failing task. Treat the
        // task status as authoritative so a provider-side task failure becomes a
        // not-collected observation, never a "rank not found" result.
        const taskStatus = Number(taskEntry?.status_code ?? 0);
        if (taskEntry && Number.isFinite(taskStatus) && taskStatus !== 0 && taskStatus !== 20000) {
          const taskIssue = classifyProviderStatus(taskStatus, taskEntry.status_message) || {
            kind: "provider",
            retryable: false,
          };
          const error = new ProviderError(
            `DataForSEO task error ${taskStatus}: ${providerMessage(taskEntry.status_message)}`,
            { kind: taskIssue.kind, status: taskStatus, endpoint, retryable: taskIssue.retryable },
          );
          if (taskIssue.retryable && attempt < this.maxRetries) {
            lastError = error;
            await sleep(400 * 3 ** attempt);
            continue;
          }
          throw error;
        }
        if (!taskEntry && Number(payload.tasks_error) > 0) {
          throw new ProviderError(
            `DataForSEO reported ${Number(payload.tasks_error)} task error(s) without a task record`,
            { kind: "provider", status: Number(payload.status_code) || null, endpoint, retryable: false },
          );
        }
        const cost = Number(payload.cost ?? taskEntry?.cost ?? 0) || 0;
        const result = {
          endpoint,
          task_type: taskType,
          task_id: taskEntry?.id || null,
          status_code: Number(taskEntry?.status_code ?? payload.status_code ?? 0),
          status_message: String(taskEntry?.status_message ?? payload.status_message ?? ""),
          cost,
          result: Array.isArray(taskEntry?.result) ? taskEntry.result : [],
          task,
          cached: false,
        };
        this.#tasks += 1;
        this.#cost += cost;
        if (this.maxCostUsd !== null && this.#cost > this.maxCostUsd) {
          this.#budgetExceeded = true;
          throw new ProviderError(
            `provider-reported cost $${this.#cost.toFixed(4)} exceeded the configured ceiling $${this.maxCostUsd.toFixed(2)}`,
            { kind: "budget", endpoint },
          );
        }
        if (cache) this.writeCache(key, result);
        return { ...result, taskType };
      } catch (error) {
        if (error?.name === "AbortError") {
          lastError = new ProviderError(`DataForSEO request timed out after ${this.timeoutMs}ms`, {
            kind: "timeout",
            endpoint,
            retryable: true,
          });
        } else if (error instanceof ProviderError) {
          lastError = error;
        } else {
          lastError = new ProviderError(`DataForSEO network failure: ${redactSecrets(error?.message || error)}`, {
            kind: "network",
            endpoint,
            retryable: true,
          });
        }
        if (!lastError.retryable || attempt >= this.maxRetries) break;
        await sleep(400 * 3 ** attempt);
      } finally {
        clearTimeout(timer);
        this.release();
      }
    }
    this.#errors.push({ endpoint, kind: lastError?.kind || "provider", status: lastError?.status ?? null });
    throw lastError;
  }

  close() {
    this.#closed = true;
  }
}

export { MAX_RESPONSE_BYTES };
