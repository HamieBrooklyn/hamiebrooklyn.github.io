/* Packs — browse series first, then card pool + odds per pack */
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

  function fmtPd(n) {
    var x = Number(n);
    if (!isFinite(x)) return "—";
    return "₽ " + x.toLocaleString();
  }

  var els = {
    browse: document.getElementById("packs-browse"),
    detail: document.getElementById("packs-detail"),
    status: document.getElementById("packs-status"),
    packSearch: document.getElementById("pack-search"),
    packSearchClear: document.getElementById("pack-search-clear"),
    packSortChips: Array.prototype.slice.call(
      document.querySelectorAll("[data-pack-sort]")
    ),
    catalogGrid: document.getElementById("pack-catalog-grid"),
    catalogPager: document.getElementById("pack-catalog-pager"),
    catalogPrev: document.getElementById("pack-catalog-prev"),
    catalogNext: document.getElementById("pack-catalog-next"),
    catalogPagerInfo: document.getElementById("pack-catalog-pager-info"),
    packBack: document.getElementById("pack-back"),
    detailMain: document.getElementById("pack-detail-main"),
    detailLoading: document.getElementById("pack-detail-loading"),
    cardsMeta: document.getElementById("pack-cards-meta"),
    cardFilter: document.getElementById("pack-card-filter"),
    cardFilterClear: document.getElementById("pack-card-filter-clear"),
    cardSortChips: Array.prototype.slice.call(
      document.querySelectorAll("[data-card-sort]")
    ),
    cardsList: document.getElementById("pack-cards-list"),
    modal: document.getElementById("pack-card-modal"),
    modalImg: document.getElementById("pack-modal-img"),
    modalTitle: document.getElementById("pack-modal-title"),
    modalSet: document.getElementById("pack-modal-set"),
    modalRarity: document.getElementById("pack-modal-rarity"),
    modalHp: document.getElementById("pack-modal-hp"),
    modalDamage: document.getElementById("pack-modal-damage"),
    modalTypes: document.getElementById("pack-modal-types"),
    modalSell: document.getElementById("pack-modal-sell"),
    modalAttacksSection: document.getElementById("pack-modal-attacks-section"),
    modalAttacks: document.getElementById("pack-modal-attacks"),
    modalOdds: document.getElementById("pack-modal-odds"),
    sidebarUser: document.getElementById("sidebar-user"),
    btnLogin: document.getElementById("btn-login"),
    btnLogout: document.getElementById("btn-logout"),
    userName: document.getElementById("user-name"),
    userAvatar: document.getElementById("user-avatar"),
    sidebarToggle: document.getElementById("sidebar-toggle"),
    sidebar: document.getElementById("sidebar"),
  };

  var state = {
    view: "browse",
    packQuery: "",
    packSort: "name",
    catalogPage: 1,
    catalogPageSize: 40,
    catalogTotal: 0,
    catalog: [],
    selectedCode: null,
    detail: null,
    cardQuery: "",
    cardSort: "top",
    catalogDebounce: 0,
    cardFilterDebounce: 0,
    catalogInflight: null,
    detailInflight: null,
  };

  function packFromUrl() {
    return (new URLSearchParams(window.location.search).get("pack") || "").trim();
  }

  function syncUrl(code) {
    var params = new URLSearchParams(window.location.search);
    if (code) params.set("pack", code);
    else params.delete("pack");
    var qs = params.toString();
    window.history.replaceState(null, "", window.location.pathname + (qs ? "?" + qs : ""));
  }

  function setStatus(kind, html) {
    if (!els.status) return;
    if (!html) {
      els.status.hidden = true;
      els.status.innerHTML = "";
      return;
    }
    els.status.hidden = false;
    els.status.className = "packs-status collection-status state-" + (kind || "empty");
    els.status.innerHTML = html;
  }

  function showBrowse() {
    state.view = "browse";
    state.selectedCode = null;
    if (els.browse) els.browse.hidden = false;
    if (els.detail) els.detail.hidden = true;
    syncUrl("");
  }

  function showDetail(code) {
    state.view = "detail";
    state.selectedCode = code;
    if (els.browse) els.browse.hidden = true;
    if (els.detail) els.detail.hidden = false;
    syncUrl(code);
    loadPackDetail(code);
  }

  function sortCatalogClient(packs) {
    var rows = packs.slice();
    if (state.packSort === "price_high") {
      rows.sort(function (a, b) {
        return (b.crystal_price || 0) - (a.crystal_price || 0);
      });
    } else if (state.packSort === "price_low") {
      rows.sort(function (a, b) {
        return (a.crystal_price || 0) - (b.crystal_price || 0);
      });
    } else {
      rows.sort(function (a, b) {
        return String(a.display_name || a.code || "")
          .toLowerCase()
          .localeCompare(String(b.display_name || b.code || "").toLowerCase());
      });
    }
    return rows;
  }

  function loadCatalog() {
    if (state.catalogInflight) state.catalogInflight.abort();
    var ctrl = new AbortController();
    state.catalogInflight = ctrl;
    setStatus("empty", "Loading packs…");
    if (els.catalogGrid) els.catalogGrid.innerHTML = "";

    var qs = new URLSearchParams();
    qs.set("page", "1");
    qs.set("page_size", "80");
    if (state.packQuery) qs.set("q", state.packQuery);

    apiFetch("/api/packs/catalog?" + qs.toString(), { signal: ctrl.signal })
      .then(function (r) {
        if (!r.ok) throw new Error("catalog_" + r.status);
        return r.json();
      })
      .then(function (body) {
        var packs = sortCatalogClient(body.items || []);
        state.catalogTotal = packs.length;
        state.catalog = packs;
        state.catalogPage = 1;
        renderCatalog();
        var urlCode = packFromUrl();
        if (urlCode) showDetail(urlCode);
      })
      .catch(function (err) {
        if (err && err.name === "AbortError") return;
        setStatus(
          "error",
          "Could not load packs. Restart or redeploy the bot API with <code>packs_api.py</code>, then refresh."
        );
        if (els.catalogGrid) els.catalogGrid.innerHTML = "";
        if (els.catalogPager) els.catalogPager.hidden = true;
      });
  }

  function renderCatalog() {
    var packs = state.catalog;
    var pages = Math.max(1, Math.ceil(packs.length / state.catalogPageSize));
    var page = Math.min(Math.max(1, state.catalogPage), pages);
    var start = (page - 1) * state.catalogPageSize;
    var slice = packs.slice(start, start + state.catalogPageSize);

    if (!packs.length) {
      setStatus(
        "empty",
        state.packQuery ? "No packs match your search." : "No active packs in the catalog."
      );
      if (els.catalogGrid) els.catalogGrid.innerHTML = "";
      if (els.catalogPager) els.catalogPager.hidden = true;
      return;
    }

    setStatus(
      "empty",
      "<strong>" +
        packs.length +
        "</strong> pack" +
        (packs.length === 1 ? "" : "s") +
        (state.packQuery
          ? ' matching "<strong>' + escapeHtml(state.packQuery) + "</strong>\""
          : "") +
        " · click a pack to view its card pool"
    );

    if (!els.catalogGrid) return;
    els.catalogGrid.innerHTML = slice
      .map(function (p) {
        var art = p.pack_art_url
          ? '<img class="packs-pack-art" src="' +
            escapeHtml(p.pack_art_url) +
            '" alt="" loading="lazy" />'
          : '<span class="packs-pack-art packs-pack-art--empty" aria-hidden="true">▥</span>';
        return (
          '<button type="button" class="packs-pack-tile" data-code="' +
          escapeHtml(p.code) +
          '">' +
          art +
          '<span class="packs-pack-name">' +
          escapeHtml(p.display_name || p.code) +
          "</span>" +
          '<span class="packs-pack-sub">' +
          escapeHtml(
            (p.cards_per_pack || 0) +
              " cards" +
              (p.code_cards_per_pack ? " + " + p.code_cards_per_pack + " code" : "")
          ) +
          "</span>" +
          (p.crystal_price != null
            ? '<span class="packs-pack-price">' + escapeHtml(String(p.crystal_price)) + " ◆</span>"
            : "") +
          "</button>"
        );
      })
      .join("");

    if (els.catalogPager) {
      els.catalogPager.hidden = pages <= 1;
      if (els.catalogPagerInfo) {
        els.catalogPagerInfo.textContent = "Page " + page + " / " + pages;
      }
      if (els.catalogPrev) els.catalogPrev.disabled = page <= 1;
      if (els.catalogNext) els.catalogNext.disabled = page >= pages;
    }
    state.catalogPage = page;
  }

  function tierTable(title, rows) {
    if (!rows || !rows.length) {
      return (
        "<section class=\"packs-tier-block\"><h3>" +
        escapeHtml(title) +
        "</h3><p class=\"muted\">No eligible cards.</p></section>"
      );
    }
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
      "<section class=\"packs-tier-block\"><h3>" +
      escapeHtml(title) +
      "</h3><div class=\"packs-tier-table-wrap\"><table class=\"packs-tier-table\"><thead><tr><th>Rarity</th><th>Cards</th><th>Per slot</th></tr></thead><tbody>" +
      body +
      "</tbody></table></div></section>"
    );
  }

  function loadPackDetail(code) {
    if (!code) return;
    if (state.detailInflight) state.detailInflight.abort();
    var ctrl = new AbortController();
    state.detailInflight = ctrl;
    if (els.detailLoading) els.detailLoading.hidden = false;
    if (els.detailMain) {
      els.detailMain.innerHTML =
        '<p class="muted packs-detail-loading" id="pack-detail-loading">Loading pack…</p>';
      els.detailLoading = document.getElementById("pack-detail-loading");
    }
    if (els.cardsList) els.cardsList.innerHTML = "";

    apiFetch(
      "/api/packs/catalog/" + encodeURIComponent(code) + "?card_page=1&card_page_size=200",
      { signal: ctrl.signal }
    )
      .then(function (r) {
        if (r.status === 404) throw new Error("not_found");
        if (!r.ok) throw new Error("detail_" + r.status);
        return r.json();
      })
      .then(function (body) {
        state.detail = body;
        state.cardQuery = "";
        if (els.cardFilter) els.cardFilter.value = "";
        if (els.cardFilterClear) els.cardFilterClear.hidden = true;
        renderPackDetail();
        renderCardList();
      })
      .catch(function (err) {
        if (err && err.name === "AbortError") return;
        if (els.detailMain) {
          els.detailMain.innerHTML =
            '<p class="packs-detail-error">Could not load this pack.</p>';
        }
        showBrowse();
      });
  }

  function renderPackDetail() {
    var d = state.detail;
    if (!d || !els.detailMain) return;
    var series = d.series || {};
    var tiers = d.tiers || {};
    var notes = d.notes || [];

    var art = series.pack_art_url
      ? '<img class="packs-detail-art" src="' + escapeHtml(series.pack_art_url) + '" alt="" />'
      : "";
    var notesHtml = notes.length
      ? '<ul class="packs-notes">' +
        notes.map(function (n) {
          return "<li>" + escapeHtml(n) + "</li>";
        }).join("") +
        "</ul>"
      : "";

    els.detailMain.innerHTML =
      '<header class="packs-detail-head">' +
      art +
      '<div class="packs-detail-head-text">' +
      "<h2>" +
      escapeHtml(series.display_name || series.code) +
      "</h2>" +
      (series.description
        ? '<p class="packs-detail-desc">' + escapeHtml(series.description) + "</p>"
        : "") +
      (series.set_codes && series.set_codes.length
        ? '<p class="muted packs-detail-sets">Sets: ' + escapeHtml(series.set_codes.join(", ")) + "</p>"
        : "") +
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
      tierTable("Main slots — rarity mix", tiers.regular) +
      tierTable("Code slot — rarity mix", tiers.code) +
      "</div>";
  }

  function filteredSortedCards() {
    var cards = (state.detail && state.detail.cards) || [];
    var q = (state.cardQuery || "").trim().toLowerCase();
    if (q) {
      cards = cards.filter(function (c) {
        return (
          (c.name || "").toLowerCase().indexOf(q) !== -1 ||
          (c.set_code || "").toLowerCase().indexOf(q) !== -1 ||
          (c.set_name || "").toLowerCase().indexOf(q) !== -1
        );
      });
    }
    cards = cards.slice();
    if (state.cardSort === "rarity") {
      cards.sort(function (a, b) {
        var ra = ((a.rarity || {}).sort_order) || 0;
        var rb = ((b.rarity || {}).sort_order) || 0;
        return rb - ra || String(a.name || "").localeCompare(b.name || "");
      });
    } else if (state.cardSort === "cost_high") {
      cards.sort(function (a, b) {
        return (
          (b.shop_sell_pokedollars || 0) - (a.shop_sell_pokedollars || 0) ||
          String(a.name || "").localeCompare(b.name || "")
        );
      });
    } else if (state.cardSort === "cost_low") {
      cards.sort(function (a, b) {
        return (
          (a.shop_sell_pokedollars || 0) - (b.shop_sell_pokedollars || 0) ||
          String(a.name || "").localeCompare(b.name || "")
        );
      });
    } else {
      cards.sort(function (a, b) {
        return (
          (b.combined_per_pack_chance_percent || 0) -
            (a.combined_per_pack_chance_percent || 0) ||
          String(a.name || "").localeCompare(b.name || "")
        );
      });
    }
    return cards;
  }

  function renderCardList() {
    var cards = filteredSortedCards();
    if (els.cardsMeta) {
      els.cardsMeta.textContent =
        cards.length + " card" + (cards.length === 1 ? "" : "s") + " in pool";
    }
    if (!els.cardsList) return;
    if (!cards.length) {
      els.cardsList.innerHTML = '<li class="muted">No cards match this filter.</li>';
      return;
    }
    els.cardsList.innerHTML = cards
      .map(function (c, idx) {
        var img = c.image_small_url || c.image_large_url;
        var thumb = img
          ? '<img class="packs-card-thumb" src="' + escapeHtml(img) + '" alt="" loading="lazy" />'
          : '<span class="packs-card-thumb packs-card-thumb--empty"></span>';
        return (
          '<li><button type="button" class="packs-card-row" data-idx="' +
          idx +
          '">' +
          thumb +
          '<span class="packs-card-text"><span class="packs-card-name">' +
          escapeHtml(c.name) +
          '</span><span class="packs-card-sub">' +
          escapeHtml((c.rarity && c.rarity.display_name) || "") +
          " · " +
          escapeHtml(c.set_code || "") +
          '</span></span><span class="packs-card-odds">' +
          escapeHtml(formatPct(c.combined_per_pack_chance_percent)) +
          "</span></button></li>"
        );
      })
      .join("");
  }

  function openModal(card) {
    if (!els.modal || !card) return;
    var rarity = card.rarity || {};
    var reg = card.regular || {};
    var codeSlot = card.code_slot || {};

    els.modal.hidden = false;
    els.modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");

    els.modalImg.src = card.image_large_url || card.image_small_url || "";
    els.modalImg.alt = card.name || "Card";
    els.modalTitle.textContent = card.name || "Card";
    els.modalSet.textContent =
      (card.set_name || card.set_code || "") + " · #" + (card.collector_number || "?");
    els.modalRarity.textContent = rarity.display_name || card.tcg_rarity || "Unknown";
    els.modalRarity.className =
      "modal-rarity " + rarityClassFor(rarity.display_name || rarity.code);
    els.modalHp.textContent = card.hp ? String(card.hp) : "—";
    els.modalDamage.textContent = card.max_damage ? String(card.max_damage) : "—";
    els.modalTypes.textContent =
      Array.isArray(card.types) && card.types.length ? card.types.join(" · ") : "—";
    els.modalSell.textContent =
      card.shop_sell_pokedollars != null
        ? fmtPd(card.shop_sell_pokedollars) + " (shop quote)"
        : "—";

    if (els.modalOdds) {
      els.modalOdds.innerHTML =
        "<div><dt>Per pack (any slot)</dt><dd>" +
        escapeHtml(formatPct(card.combined_per_pack_chance_percent)) +
        "</dd></div><div><dt>Main slots</dt><dd>" +
        escapeHtml(formatPct(reg.per_pack_chance_percent)) +
        ' <span class="muted">(' +
        escapeHtml(formatPct(reg.per_card_chance_percent)) +
        " per slot)</span></dd></div><div><dt>Code slot</dt><dd>" +
        escapeHtml(formatPct(codeSlot.per_pack_chance_percent)) +
        ' <span class="muted">(' +
        escapeHtml(formatPct(codeSlot.per_card_chance_percent)) +
        " per slot)</span></dd></div>";
    }

    var attacks = Array.isArray(card.attacks) ? card.attacks : [];
    if (!attacks.length) {
      els.modalAttacksSection.hidden = true;
      els.modalAttacks.innerHTML = "";
    } else {
      els.modalAttacksSection.hidden = false;
      els.modalAttacks.innerHTML = attacks
        .map(function (atk) {
          var name = escapeHtml(atk.name || "Attack");
          var dmg = atk.damage
            ? '<span class="atk-dmg">' + escapeHtml(atk.damage) + "</span>"
            : "";
          var cost =
            Array.isArray(atk.cost) && atk.cost.length
              ? '<span class="atk-cost">' + atk.cost.map(escapeHtml).join(" · ") + "</span>"
              : "";
          var text = atk.text ? '<p class="atk-text">' + escapeHtml(atk.text) + "</p>" : "";
          return (
            "<li><div class=\"atk-row\"><span class=\"atk-name\">" +
            name +
            "</span>" +
            cost +
            dmg +
            "</div>" +
            text +
            "</li>"
          );
        })
        .join("");
    }
  }

  function closeModal() {
    if (!els.modal) return;
    els.modal.hidden = true;
    els.modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
    if (els.cardsList) {
      els.cardsList.querySelectorAll(".packs-card-row.is-active").forEach(function (n) {
        n.classList.remove("is-active");
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
      .catch(showSignedOut);
  }

  if (els.catalogGrid) {
    els.catalogGrid.addEventListener("click", function (e) {
      var btn = e.target.closest(".packs-pack-tile");
      if (!btn) return;
      var code = btn.getAttribute("data-code");
      if (code) showDetail(code);
    });
  }

  if (els.packSearch) {
    els.packSearch.addEventListener("input", function (e) {
      var v = (e.target.value || "").trim();
      if (els.packSearchClear) els.packSearchClear.hidden = !v;
      clearTimeout(state.catalogDebounce);
      state.catalogDebounce = setTimeout(function () {
        state.packQuery = v;
        state.catalogPage = 1;
        loadCatalog();
      }, 200);
    });
  }

  if (els.packSearchClear) {
    els.packSearchClear.addEventListener("click", function () {
      if (els.packSearch) els.packSearch.value = "";
      els.packSearchClear.hidden = true;
      state.packQuery = "";
      loadCatalog();
    });
  }

  els.packSortChips.forEach(function (chip) {
    chip.addEventListener("click", function () {
      var sort = chip.getAttribute("data-pack-sort");
      if (!sort || sort === state.packSort) return;
      state.packSort = sort;
      els.packSortChips.forEach(function (c) {
        var on = c.getAttribute("data-pack-sort") === sort;
        c.classList.toggle("is-active", on);
        c.setAttribute("aria-pressed", on ? "true" : "false");
      });
      state.catalog = sortCatalogClient(state.catalog);
      state.catalogPage = 1;
      renderCatalog();
    });
  });

  if (els.catalogPrev) {
    els.catalogPrev.addEventListener("click", function () {
      if (state.catalogPage <= 1) return;
      state.catalogPage -= 1;
      renderCatalog();
    });
  }
  if (els.catalogNext) {
    els.catalogNext.addEventListener("click", function () {
      var pages = Math.max(1, Math.ceil(state.catalog.length / state.catalogPageSize));
      if (state.catalogPage >= pages) return;
      state.catalogPage += 1;
      renderCatalog();
    });
  }

  if (els.packBack) {
    els.packBack.addEventListener("click", function () {
      closeModal();
      showBrowse();
      loadCatalog();
    });
  }

  if (els.cardFilter) {
    els.cardFilter.addEventListener("input", function (e) {
      var v = (e.target.value || "").trim();
      if (els.cardFilterClear) els.cardFilterClear.hidden = !v;
      clearTimeout(state.cardFilterDebounce);
      state.cardFilterDebounce = setTimeout(function () {
        state.cardQuery = v;
        renderCardList();
      }, 180);
    });
  }

  if (els.cardFilterClear) {
    els.cardFilterClear.addEventListener("click", function () {
      if (els.cardFilter) els.cardFilter.value = "";
      els.cardFilterClear.hidden = true;
      state.cardQuery = "";
      renderCardList();
    });
  }

  els.cardSortChips.forEach(function (chip) {
    chip.addEventListener("click", function () {
      var sort = chip.getAttribute("data-card-sort");
      if (!sort || sort === state.cardSort) return;
      state.cardSort = sort;
      els.cardSortChips.forEach(function (c) {
        var on = c.getAttribute("data-card-sort") === sort;
        c.classList.toggle("is-active", on);
        c.setAttribute("aria-pressed", on ? "true" : "false");
      });
      renderCardList();
    });
  });

  if (els.cardsList) {
    els.cardsList.addEventListener("click", function (e) {
      var btn = e.target.closest(".packs-card-row");
      if (!btn) return;
      var idx = parseInt(btn.getAttribute("data-idx"), 10);
      var cards = filteredSortedCards();
      var card = cards[idx];
      if (!card) return;
      els.cardsList.querySelectorAll(".packs-card-row").forEach(function (n) {
        n.classList.remove("is-active");
      });
      btn.classList.add("is-active");
      openModal(card);
    });
  }

  if (els.modal) {
    els.modal.querySelectorAll("[data-close]").forEach(function (node) {
      node.addEventListener("click", closeModal);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && els.modal && !els.modal.hidden) closeModal();
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

  bootAuth();
  loadCatalog();
})();
