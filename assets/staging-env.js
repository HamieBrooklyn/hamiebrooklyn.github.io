/* Staging environment badge when the site points at api-staging (or local :8081). */
(function () {
  "use strict";

  function apiBase() {
    return (window.POKEPON_API_BASE || "").replace(/\/+$/, "");
  }

  function isStagingHost() {
    var host = (window.location.hostname || "").toLowerCase();
    return host === "staging.pokepon.org";
  }

  function isStagingApi() {
    var base = apiBase();
    if (!base) return false;
    try {
      var u = new URL(base);
      if (u.hostname === "api-staging.pokepon.org") return true;
      if (
        (u.hostname === "127.0.0.1" || u.hostname === "localhost") &&
        u.port === "8081"
      ) {
        return true;
      }
    } catch (_) {}
    return false;
  }

  function mountBanner() {
    if ((!isStagingHost() && !isStagingApi()) || document.getElementById("pokepon-staging-banner")) return;

    document.documentElement.classList.add("pokepon-staging-active");
    if (document.title.indexOf("STAGING") !== 0) {
      document.title = "STAGING · " + document.title;
    }

    var bar = document.createElement("div");
    bar.id = "pokepon-staging-banner";
    bar.setAttribute("role", "status");
    bar.innerHTML =
      '<span class="pokepon-staging-banner__tag">STAGING</span>' +
      '<span class="pokepon-staging-banner__text">Test environment — not production. Data and purchases here do not affect live Poké Pon.</span>' +
      (isStagingHost()
        ? '<a class="pokepon-staging-banner__exit" href="https://pokepon.org/">Open production site</a>'
        : '<a class="pokepon-staging-banner__exit" href="?api=clear">Exit staging</a>');

    if (document.body) {
      document.body.insertBefore(bar, document.body.firstChild);
    }
  }

  function init() {
    mountBanner();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.PokePonStaging = { isStagingApi: isStagingApi, isStagingHost: isStagingHost, refresh: mountBanner };
})();
