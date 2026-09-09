/* Table invites may select only PokePon APIs, or the current local QA server. */
(function () {
  "use strict";
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
  const fallback = local ? location.origin : location.hostname === "staging.pokepon.org"
    ? "https://api-staging.pokepon.org" : "https://api.pokepon.org";
  const allowed = new Set(["https://api.pokepon.org", "https://api-staging.pokepon.org"]);
  if (local) allowed.add(location.origin);
  let api = fallback;
  try {
    const requested = new URL(window.POKEPON_API_BASE);
    if (allowed.has(requested.origin)) api = requested.origin;
  } catch (_) {}
  window.POKEPON_API_BASE = api;
  try { localStorage.setItem("pokepon-api-base", api); } catch (_) {}
})();
