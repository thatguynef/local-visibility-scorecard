---
description: "How the Local Visibility Scorecard builds and reads a configurable geo-grid across Google Maps, the Local Pack, and Local Finder."
---

# Geo-grid methodology

A single Maps rank is a single point. A local business can be the obvious choice at its own address and invisible two miles away. The geo-grid measures that difference.

## Configuration

The grid is configured before collection. It records:

| Field | Meaning |
|---|---|
| `center` | Market center latitude/longitude |
| `radius_km` | Distance from the center to the grid edge |
| `size` | 3, 5, 7, or a documented custom size |
| `points` | `size × size` |
| `generation_method` | `square_grid_v1` in V1 |
| `version` | Grid methodology version |
| `hash` | Hash of the geometry and parameters |
| `coordinate_digits` | Precision of the stored points |

The delivered-audit default is **7 × 7 / 49 points**. A 3 × 3 or 5 × 5 grid is acceptable for a small market or a cost-constrained run. A custom grid must be documented.

## Generation

The V1 grid is a square lattice centered on the market:

```text
lat_step = (radius / 111.32) / ((size - 1) / 2)
lng_step = (radius / (111.32 × cos(center_lat))) / ((size - 1) / 2)
```

Each point gets an ID (`G01` … `G49`) and six-decimal coordinates. The hash covers the geometry and parameters. The collector records it in `maps.grid.hash`; the report and verifier can use it to reproduce the grid.

## Surfaces

The collector records three separate surfaces:

- **Local Pack** — the local-business block in ordinary Google results.
- **Google Maps** — Maps results at the coordinate.
- **Local Finder** — Local Finder results where configured.

They are not merged. Different surfaces can order the same businesses differently, and a business can be strong on one and weak on another.

## What is measured

For each core grid intent and point:

- target rank, if found;
- target match method and confidence;
- business competitors in the result;
- directory and publisher occupiers;
- paid items, as diagnostic only.

A grid point is covered for an intent when the target appears in the **top 10** for that intent. Geo-grid consistency is the demand-weighted average of per-intent point coverage.

The full report shows:

- Top-3, Top-10, and Top-20 coverage per surface;
- average visible position;
- geo-grid coverage;
- the weakest quadrant;
- quadrant coverage.

## Quadrants

The grid is split into NE, NW, SE, and SW around the center. The weakest quadrant is the clearest evidence of a geographic gap.

A weak quadrant is not automatically a defect. The business may not serve that area. The report should ask the owner before recommending expansion.

## Cost and safety

A 7 × 7 grid with eight grid queries and two surfaces is 784 Maps/Local Pack observations per run. That is a real cost. The collector:

- shows the task count before a live run;
- enforces a SERP task ceiling;
- enforces an optional cost ceiling when local pricing is supplied;
- caches raw responses locally;
- never sends a paid request in `--dry-run`.

## Privacy

Tracked examples use synthetic coordinates only. Real client grid coordinates, query sets, and competitor cohorts stay in the local ignored audit directory.

Do not publish:

- a real client's center coordinate;
- a real client's point coordinates;
- a real competitor set tied to a client;
- a real report or screenshot.

## Reproducibility

A historical grid can be reproduced from:

- the center, radius, size, and generation method;
- the point list or the grid hash;
- the grid version.

The verifier checks that the audit's grid hash is present and that the observations are consistent with the configured grid. If the grid changed after collection, the run is not comparable.

---

## Scorecard family boundary

This page covers discovery. The [GBP Scorecard](https://thatguynef.github.io/gbp-scorecard/) diagnoses profile trust and action; the [Website Scorecard](https://thatguynef.github.io/website-scorecard/) diagnoses website conversion. Read [The Scorecard Family](scorecard-family.md) for the ownership matrix and the no-duplicate-scoring rule.
