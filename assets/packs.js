/* Pack catalog + per-card pull odds (public API). */
(function () {
  "use strict";

  var API_BASE = (window.POKEPON_API_BASE || "").replace(/\/+$/, "");
  var SESSION_KEY = "pokepon-session";

  function api(path) {
    return API_BASE + path;
  }

  function readSessionToken() {
    try {
      return localStorage.getItem(SESSION_KEY) || "";
    } catch (_) {
      return "";
    }
  }

  function apiHeaders() {
    var headers = { "ngrok-skip-browser-warning": "1" };
    var token = readSessionToken();
    if (token) headers.Authorization = "Bearer " + token;
    return headers;
  }

  function apiFetch(path, options) {
    options = options || {};
    options.credentials = "include";
    options.headers = Object.assign({}, apiHeaders(), options.headers || {});
    return fetch(api(path), options);
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function rarityClassFor(displayName) {
    var v = String(displayName || "").toLowerCase();
    if (!v) return "rarity-unknown";
    if (v.indexOf("common") !== -1) return "rarity-common";
    if (v.indexOf("uncommon") !== -1) return "rarity-uncommon";
    if (v.indexOf("ultra") !== -1) return "rarity-ultra";
    if (v.indexOf("hyper") !== -1) return "rarity-hyper";
    if (v.indexOf("secret") !== -1) return "rarity-secret";
    if (v.indexOf("special") !== -1) return "rarity-special";
    if (v.indexOf("rare") !== -1) return "rarity-rare";
    return "rarity-unknown";
  }

  function formatPct(n) {
    var x = Number(n);
    if (!isFinite(x) || x <= 0) return "—";
    if (x >= 10) return x.toFixed(2) + "%";
    if (x >= 1) return x.toFixed(3) + "%";
    if (x >= 0.01) return x.toFixed(4) + "%";
    return x.toFixed(6) + "%";
  }

  var els = {
    status: document.getElementById("packs-status"),
    packSearch: document.getElementById("pack-search"),
    packSearchClear: document.getElementById("pack-search-clear"),
    catalogMeta: document.getElementById("pack-catalog-meta"),
    catalogList: document.getElementById("pack-catalog-list"),
    detailPlaceholder: document.getElementById("pack-detail-placeholder"),
    detailBody: document.getElementById("pack-detail-body"),
    sidebarUser: document.getElementById("sidebar-user"),
    btnLogin: document.getElementById("btn-login"),
    btnLogout: document.getElementById("btn-logout"),
    userName: document.getElementById("user-name"),
    userAvatar: document.getElementById("user-avatar"),
    sidebarToggle: document.getElementById("sidebar-toggle"),
    sidebar: document.getElementById("sidebar"),
  };

  var state = {
    catalog: [],
    catalogQuery: "",
    selectedCode: null,
    cardQuery: "",
    cardPage: 1,
    cardPageSize: 60,
    detail: null,
    catalogDebounce: 0,
    cardDebounce: 0,
    catalogInflight: null,
    detailInflight: null,
  };

  function setStatus(kind, html) {
    if (!els.status) return;
    if (!html) {
      els.status.hidden = true;
      els.status.innerHTML = "";
      return;
    }
    els.status.hidden = false;
    els.status.className = "packs-status state-" + kind;
    els.status.innerHTML = html;
  }

  function packFromUrl() {
    var params = new URLSearchParams(window.location.search);
    return (params.get("pack") || "").trim();
  }

  function syncUrl(code) {
    var params = new URLSearchParams(window.location.search);
    if (code) params.set("pack", code);
    else params.delete("pack");
    var qs = params.toString();
    var next = window.location.pathname + (qs ? "?" + qs : "");
    window.history.replaceState(null, "", next);
  }

  function loadCatalog() {
    if (state.catalogInflight) state.catalogInflight.abort();
    var ctrl = new AbortController();
    state.catalogInflight = ctrl;
    var qs = new URLSearchParams();
    qs.set("page", "1");
    qs.set("page_size", "80");
    if (state.catalogQuery) qs.set("q", state.catalogQuery);
    if (els.catalogMeta) els.catalogMeta.textContent = "Loading packs…";
    apiFetch("/api/packs/catalog?" + qs.toString(), { signal: ctrl.signal })
      .then(function (r) {
        if (!r.ok) throw new Error("catalog_" + r.status);
        return r.json();
      })
      .then(function (body) {
        state.catalog = body.items || [];
        renderCatalog();
        var urlCode = packFromUrl();
        if (urlCode && !state.selectedCode) selectPack(urlCode, false);
        else if (state.selectedCode) highlightCatalog(state.selectedCode);
      })
      .catch(function (err) {
        if (err && err.name === "AbortError") return;
        if (els.catalogMeta) els.catalogMeta.textContent = "Could not load packs.";
        setStatus(
          "error",
          "Pack catalog failed to load. Check that the API is running and CORS allows this site."
        );
      });
  }

  function renderCatalog() {
    if (!els.catalogList) return;
    var items = state.catalog;
    if (els.catalogMeta) {
      els.catalogMeta.textContent =
        items.length === 0
          ? state.catalogQuery
            ? "No packs match your search."
            : "No active packs in the catalog."
          : items.length + " pack" + (items.length === 1 ? "" : "s");
    }
    if (!items.length) {
      els.catalogList.innerHTML = "";
      return;
    }
    els.catalogList.innerHTML = items
      .map(function (p) {
        var code = escapeHtml(p.code);
        var name = escapeHtml(p.display_name || p.code);
        var price =
          p.crystal_price != null
            ? '<span class="packs-catalog-price">' +
              escapeHtml(String(p.crystal_price)) +
              " ◆</span>"
            : "";
        var slots =
          (p.cards_per_pack || 0) +
          " cards" +
          (p.code_cards_per_pack
            ? " + " + p.code_cards_per_pack + " code"
            : "");
        var active =
          state.selectedCode && state.selectedCode === p.code
            ? ' is-active" aria-current="true"'
            : '"';
        var art = p.pack_art_url
          ? '<img class="packs-catalog-art" src="' +
            escapeHtml(p.pack_art_url) +
            '" alt="" loading="lazy" />'
          : '<span class="packs-catalog-art packs-catalog-art--empty" aria-hidden="true">📦</span>';
        return (
          '<li><button type="button" class="packs-catalog-item' +
          active +
          ' data-code="' +
          code +
          '">' +
          art +
          '<span class="packs-catalog-text">' +
          '<span class="packs-catalog-name">' +
          name +
          "</span>" +
          '<span class="packs-catalog-sub muted">' +
          escapeHtml(slots) +
          "</span>" +
          price +
          "</span></button></li>"
        );
      })
      .join("");
  }

  function highlightCatalog(code) {
    if (!els.catalogList) return;
    var buttons = els.catalogList.querySelectorAll(".packs-catalog-item");
    buttons.forEach(function (btn) {
      var on = btn.getAttribute("data-code") === code;
      btn.classList.toggle("is-active", on);
      if (on) btn.setAttribute("aria-current", "true");
      else btn.removeAttribute("aria-current");
    });
  }

  function selectPack(code, pushUrl) {
    if (!code) return;
    state.selectedCode = code;
    state.cardPage = 1;
    highlightCatalog(code);
    if (pushUrl !== false) syncUrl(code);
    if (els.detailPlaceholder) els.detailPlaceholder.hidden = true;
    if (els.detailBody) {
      els.detailBody.hidden = false;
      els.detailBody.innerHTML =
        '<p class="muted packs-detail-loading">Loading odds for ' +
        escapeHtml(code) +
        "…</p>";
    }
    loadDetail(code);
  }

  function loadDetail(code) {
    if (state.detailInflight) state.detailInflight.abort();
    var ctrl = new AbortController();
    state.detailInflight = ctrl;
    var qs = new URLSearchParams();
    qs.set("card_page", String(state.cardPage));
    qs.set("card_page_size", String(state.cardPageSize));
    if (state.cardQuery) qs.set("card_q", state.cardQuery);
    apiFetch(
      "/api/packs/catalog/" + encodeURIComponent(code) + "?" + qs.toString(),
      { signal: ctrl.signal }
    )
      .then(function (r) {
        if (r.status === 404) throw new Error("not_found");
        if (!r.ok) throw new Error("detail_" + r.status);
        return r.json();
      })
      .then(function (body) {
        state.detail = body;
        renderDetail();
      })
      .catch(function (err) {
        if (err && err.name === "AbortError") return;
        if (els.detailBody) {
          els.detailBody.innerHTML =
            '<p class="packs-detail-error">Could not load this pack. It may be inactive or missing from the catalog.</p>';
        }
      });
  }

  function tierTable(title, rows) {
    if (!rows || !rows.length) {
      return (
        '<section class="packs-tier-block"><h3>' +
        escapeHtml(title) +
        '</h3><p class="muted">No eligible cards in pool.</p></section>'
      );
    }
    var head =
      "<thead><tr><th>Rarity</th><th>Cards</th><th>Per slot</th></tr></thead>";
    var body = rows
      .map(function (t) {
        return (
          "<tr><td>" +
          escapeHtml(t.display_name || t.code) +
          "</td><td>" +
          escapeHtml(String(t.card_count)) +
          "</td><td>" +
          formatPct(t.tier_chance_percent) +
          "</td></tr>"
        );
      })
      .join("");
    return (
      '<section class="packs-tier-block"><h3>' +
      escapeHtml(title) +
      '</h3><div class="packs-tier-table-wrap"><table class="packs-tier-table">' +
      head +
      "<tbody>" +
      body +
      "</tbody></table></div></section>"
    );
  }

  function renderDetail() {
    var d = state.detail;
    if (!d || !els.detailBody) return;
    var series = d.series || {};
    var tiers = d.tiers || {};
    var cards = d.cards || [];
    var notes = d.notes || [];
    var total = d.cards_total != null ? d.cards_total : cards.length;
    var page = d.cards_page || state.cardPage;
    var pageSize = d.cards_page_size || state.cardPageSize;
    var maxPage = Math.max(1, Math.ceil(total / pageSize));

    var art = series.pack_art_url
      ? '<img class="packs-detail-art" src="' +
        escapeHtml(series.pack_art_url) +
        '" alt="" />'
      : "";
    var sets =
      series.set_codes && series.set_codes.length
        ? '<p class="packs-detail-sets muted">Sets: ' +
          escapeHtml(series.set_codes.join(", ")) +
          "</p>"
        : "";

    var notesHtml = notes.length
      ? '<ul class="packs-notes">' +
        notes
          .map(function (n) {
            return "<li>" + escapeHtml(n) + "</li>";
          })
          .join("") +
        "</ul>"
      : "";

    var cardsHtml = cards.length
      ? '<div class="card-grid packs-card-grid">' +
        cards
          .map(function (c) {
            var r = c.rarity || {};
            var rc = rarityClassFor(r.display_name || r.code);
            var img = c.image_small_url || c.image_large_url || "";
            var reg = c.regular || {};
            var code = c.code_slot || {};
            var combined = c.combined_per_pack_chance_percent;
            return (
              '<article class="card-tile packs-odds-tile ' +
              rc +
              '">' +
              (img
                ? '<img class="card-tile-img" src="' +
                  escapeHtml(img) +
                  '" alt="" loading="lazy" />'
                : '<div class="card-tile-img card-tile-img--empty"></div>') +
              '<div class="card-tile-meta">' +
              '<div class="card-tile-name">' +
              escapeHtml(c.name) +
              "</div>" +
              '<div class="card-tile-sub">' +
              escapeHtml(c.set_code || "") +
              (c.collector_number
                ? " · #" + escapeHtml(c.collector_number)
                : "") +
              "</div>" +
              '<div class="card-tile-rarity">' +
              escapeHtml(r.display_name || r.code || "") +
              "</div>" +
              '<dl class="packs-odds-stats">' +
              '<div><dt>Per pack (any slot)</dt><dd class="packs-odds-highlight">' +
              formatPct(combined) +
              "</dd></div>" +
              '<div><dt>Main slots</dt><dd>' +
              formatPct(reg.per_pack_chance_percent) +
              " <span class="muted">(" +
              formatPct(reg.per_card_chance_percent) +
              " per slot)</span></dd></div>" +
              (series.code_cards_per_pack
                ? '<div><dt>Code slot</dt><dd>' +
                  formatPct(code.per_pack_chance_percent) +
                  " <span class="muted">(" +
                  formatPct(code.per_card_chance_percent) +
                  " per slot)</span></dd></div>"
                : "") +
              "</dl>" +
              "</div></article>"
            );
          })
          .join("") +
        "</div>"
      : '<p class="muted">No cards match this filter.</p>';

    var pager =
      maxPage > 1
        ? '<div class="packs-card-pager">' +
          '<button type="button" class="btn btn-ghost" id="pack-cards-prev"' +
          (page <= 1 ? " disabled" : "") +
          ">Previous</button>" +
          '<span class="muted">Page ' +
          page +
          " / " +
          maxPage +
          " · " +
          total +
          " cards</span>" +
          '<button type="button" class="btn btn-ghost" id="pack-cards-next"' +
          (page >= maxPage ? " disabled" : "") +
          ">Next</button></div>"
        : '<p class="packs-card-count muted">' + total + " cards in pool</p>";

    els.detailBody.innerHTML =
      '<header class="packs-detail-head">' +
      art +
      '<div class="packs-detail-head-text">' +
      "<h2>" +
      escapeHtml(series.display_name || series.code) +
      "</h2>" +
      (series.description
        ? '<p class="packs-detail-desc">' + escapeHtml(series.description) + "</p>"
        : "") +
      sets +
      '<p class="packs-detail-meta">' +
      escapeHtml(String(series.cards_per_pack || 0)) +
      " main slots" +
      (series.code_cards_per_pack
        ? ", " + escapeHtml(String(series.code_cards_per_pack)) + " code slot"
        : "") +
      (series.crystal_price != null
        ? " · " + escapeHtml(String(series.crystal_price)) + " ◆ in shop"
        : "") +
      "</p></div></header>" +
      notesHtml +
      '<div class="packs-tiers">' +
      tierTable("Main card slots — rarity mix", tiers.regular) +
      tierTable("Code card slot — rarity mix", tiers.code) +
      "</div>" +
      '<div class="packs-cards-section">' +
      '<div class="toolbar toolbar-search packs-card-toolbar">' +
      '<span class="search-icon" aria-hidden="true">⌕</span>' +
      '<input type="search" id="pack-card-search" placeholder="Filter cards in this pack…" autocomplete="off" spellcheck="false" value="' +
      escapeHtml(state.cardQuery) +
      '" />' +
      '<button class="search-clear" type="button" id="pack-card-search-clear"' +
      (state.cardQuery ? "" : " hidden") +
      ' aria-label="Clear card filter">×</button>' +
      "</div>" +
      cardsHtml +
      pager +
      "</div>";

    var cardSearch = document.getElementById("pack-card-search");
    var cardClear = document.getElementById("pack-card-search-clear");
    if (cardSearch) {
      cardSearch.addEventListener("input", function (e) {
        var v = (e.target.value || "").trim();
        if (cardClear) cardClear.hidden = !v;
        clearTimeout(state.cardDebounce);
        state.cardDebounce = setTimeout(function () {
          state.cardQuery = v;
          state.cardPage = 1;
          loadDetail(state.selectedCode);
        }, 220);
      });
    }
    if (cardClear) {
      cardClear.addEventListener("click", function () {
        state.cardQuery = "";
        state.cardPage = 1;
        loadDetail(state.selectedCode);
      });
    }
    var prev = document.getElementById("pack-cards-prev");
    var next = document.getElementById("pack-cards-next");
    if (prev) {
      prev.addEventListener("click", function () {
        if (state.cardPage <= 1) return;
        state.cardPage -= 1;
        loadDetail(state.selectedCode);
      });
    }
    if (next) {
      next.addEventListener("click", function () {
        if (state.cardPage >= maxPage) return;
        state.cardPage += 1;
        loadDetail(state.selectedCode);
      });
    }
  }

  function showSignedOut() {
    if (!els.sidebarUser) return;
    els.sidebarUser.dataset.state = "signed-out";
    els.sidebarUser.querySelector(".sidebar-user-loading").hidden = true;
    els.sidebarUser.querySelector(".sidebar-user-signedout").hidden = false;
    els.sidebarUser.querySelector(".sidebar-user-signedin").hidden = true;
  }

  function showSignedIn(user) {
    if (!els.sidebarUser) return;
    els.sidebarUser.dataset.state = "signed-in";
    els.sidebarUser.querySelector(".sidebar-user-loading").hidden = true;
    els.sidebarUser.querySelector(".sidebar-user-signedout").hidden = true;
    els.sidebarUser.querySelector(".sidebar-user-signedin").hidden = false;
    var label = user.global_name || user.username || "Trainer";
    if (els.userName) els.userName.textContent = label;
    if (els.userAvatar && user.avatar_url) {
      els.userAvatar.src = user.avatar_url;
      els.userAvatar.alt = label;
    }
  }

  function bootAuth() {
    apiFetch("/api/me")
      .then(function (r) {
        return r.json();
      })
      .then(function (body) {
        if (body && body.authenticated && body.user) showSignedIn(body.user);
        else showSignedOut();
      })
      .catch(function () {
        showSignedOut();
      });
  }

  if (els.catalogList) {
    els.catalogList.addEventListener("click", function (e) {
      var btn = e.target.closest(".packs-catalog-item");
      if (!btn) return;
      var code = btn.getAttribute("data-code");
      if (code) selectPack(code);
    });
  }

  if (els.packSearch) {
    els.packSearch.addEventListener("input", function (e) {
      var v = (e.target.value || "").trim();
      if (els.packSearchClear) els.packSearchClear.hidden = !v;
      clearTimeout(state.catalogDebounce);
      state.catalogDebounce = setTimeout(function () {
        state.catalogQuery = v;
        loadCatalog();
      }, 200);
    });
  }
  if (els.packSearchClear) {
    els.packSearchClear.addEventListener("click", function () {
      if (els.packSearch) els.packSearch.value = "";
      els.packSearchClear.hidden = true;
      state.catalogQuery = "";
      loadCatalog();
    });
  }

  if (els.btnLogin) {
    els.btnLogin.addEventListener("click", function () {
      window.location.href =
        api("/auth/discord/login?return_to=" + encodeURIComponent(window.location.href));
    });
  }
  if (els.btnLogout) {
    els.btnLogout.addEventListener("click", function () {
      apiFetch("/auth/logout", { method: "POST" }).finally(function () {
        window.location.reload();
      });
    });
  }
  if (els.sidebarToggle && els.sidebar) {
    els.sidebarToggle.addEventListener("click", function () {
      var open = els.sidebar.classList.toggle("is-open");
      els.sidebarToggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
  }

  bootAuth();
  loadCatalog();
})();
