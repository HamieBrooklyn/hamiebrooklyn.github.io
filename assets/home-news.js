/* Home page — new catalog sets from /api/news */
(function () {
  "use strict";

  var API_BASE = (window.POKEPON_API_BASE || "").replace(/\/+$/, "");
  var panel = document.getElementById("home-news");
  var listEl = document.getElementById("home-news-list");

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatDate(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  function apiFetch(path) {
    return fetch(API_BASE + path, {
      credentials: "include",
      headers: { "ngrok-skip-browser-warning": "1" },
    });
  }

  function renderItem(item) {
    var samples = Array.isArray(item.sample_cards) ? item.sample_cards : [];
    var thumb = "";
    for (var i = 0; i < samples.length; i++) {
      if (samples[i] && samples[i].image_small_url) {
        thumb =
          '<img class="home-news-thumb" src="' +
          escapeHtml(samples[i].image_small_url) +
          '" alt="" loading="lazy" />';
        break;
      }
    }
    var count = Number(item.new_card_count) || 0;
    var pokedex = item.pokedex_url || "/pokedex/";
    var packs = item.packs_url || "/packs/";
    return (
      '<article class="home-news-card">' +
      (thumb || '<span class="home-news-thumb home-news-thumb--empty" aria-hidden="true">▣</span>') +
      '<div class="home-news-body">' +
      '<p class="home-news-meta">' +
      escapeHtml(formatDate(item.published_at)) +
      (count ? " · " + count + " cards" : "") +
      "</p>" +
      "<h3 class=\"home-news-title\">" +
      escapeHtml(item.title || item.set_name || "New cards") +
      "</h3>" +
      (item.body
        ? '<p class="home-news-desc">' + escapeHtml(item.body).replace(/\*\*/g, "") + "</p>"
        : "") +
      '<p class="home-news-links">' +
      '<a href="' +
      escapeHtml(pokedex) +
      '">Pokédex</a> · <a href="' +
      escapeHtml(packs) +
      '">Packs</a>' +
      "</p></div></article>"
    );
  }

  function loadNews() {
    if (!panel || !listEl || !API_BASE) return;
    apiFetch("/api/news?limit=6")
      .then(function (r) {
        if (!r.ok) throw new Error("news_" + r.status);
        return r.json();
      })
      .then(function (data) {
        var items = (data && data.items) || [];
        if (!items.length) {
          panel.hidden = true;
          return;
        }
        panel.hidden = false;
        listEl.innerHTML = items.map(renderItem).join("");
      })
      .catch(function () {
        if (panel) panel.hidden = true;
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadNews);
  } else {
    loadNews();
  }
})();
