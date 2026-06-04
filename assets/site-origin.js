/* Keep internal navigation on the current site host (staging vs production). */
(function () {
  "use strict";

  var host = (window.location.hostname || "").toLowerCase();
  var origin = window.location.origin || "";
  var isStagingSite = host === "staging.pokepon.org";

  window.POKEPON_SITE_ORIGIN = origin;
  window.POKEPON_IS_STAGING_SITE = isStagingSite;

  if (!isStagingSite) return;

  var prodOrigin = "https://pokepon.org";

  function rewriteProdUrl(url) {
    if (!url || url.indexOf(prodOrigin) !== 0) return url;
    try {
      var u = new URL(url);
      return origin + u.pathname + u.search + u.hash;
    } catch (_) {
      return url;
    }
  }

  document.querySelectorAll('link[rel="canonical"]').forEach(function (link) {
    var href = link.getAttribute("href");
    var next = rewriteProdUrl(href);
    if (next && next !== href) link.setAttribute("href", next);
  });

  document.querySelectorAll('a[href^="https://pokepon.org"]').forEach(function (a) {
    if (a.classList.contains("pokepon-staging-banner__exit")) return;
    var href = a.getAttribute("href");
    var next = rewriteProdUrl(href);
    if (next && next !== href) a.setAttribute("href", next);
  });
})();
