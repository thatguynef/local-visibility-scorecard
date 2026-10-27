/* Small accessibility helpers that do not change content. */
(() => {
  const markExternal = () => {
    document.querySelectorAll("a[href^='http']").forEach((link) => {
      if (link.hostname && link.hostname !== window.location.hostname) {
        link.setAttribute("rel", "noopener noreferrer");
      }
    });
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", markExternal);
  } else {
    markExternal();
  }
})();
