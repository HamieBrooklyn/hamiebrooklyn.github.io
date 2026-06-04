/* Resolve POKEPON_API_BASE: ?api= override, localStorage, host default, then <meta>. */
(function () {
  "use strict";

  var KEY = "pokepon-api-base";
  var STAGING_HOSTS = ["staging.pokepon.org"];
  var STAGING_API = "https://api-staging.pokepon.org";

  function isValidBase(value) {
    if (!value || !/^https?:\/\//i.test(value)) return false;
    try {
      var u = new URL(value);
      return /^https?:$/.test(u.protocol) && !!u.hostname && !/[<>{}\s]/.test(u.hostname);
    } catch (_) {
      return false;
    }
  }

  function defaultApiForHost() {
    var host = (window.location.hostname || "").toLowerCase();
    if (STAGING_HOSTS.indexOf(host) !== -1) return STAGING_API;
    return "";
  }

  var params = new URLSearchParams(window.location.search);
  var override = params.get("api");
  if (override === "clear" || override === "reset") {
    try {
      localStorage.removeItem(KEY);
    } catch (_) {}
    override = "";
  }
  if (override) {
    if (isValidBase(override)) {
      try {
        localStorage.setItem(KEY, override.replace(/\/+$/, ""));
      } catch (_) {}
    } else {
      console.warn("[pokepon] ignoring ?api= override — not a valid URL:", override);
    }
  }

  var stored = "";
  try {
    stored = localStorage.getItem(KEY) || "";
  } catch (_) {}
  if (stored && !isValidBase(stored)) {
    try {
      localStorage.removeItem(KEY);
    } catch (_) {}
    stored = "";
  }

  var meta = document.querySelector('meta[name="pokepon-api-base"]');
  var fromMeta = meta && meta.getAttribute("content") ? meta.getAttribute("content").trim() : "";
  if (fromMeta && !isValidBase(fromMeta)) fromMeta = "";

  var fallback = defaultApiForHost() || fromMeta || "";
  window.POKEPON_API_BASE =
    stored && isValidBase(stored) ? stored.replace(/\/+$/, "") : fallback.replace(/\/+$/, "");
})();
