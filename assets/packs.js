/* Global pack pool search — collection-style grid + card modal */
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

  function sortLabel(sort) {
    switch (sort) {
      case "rarity":
        return "rarest";
      case "cost_high":
        return "high shop sell";
      case "cost_low":
        return "low shop sell";
      default:
        return "top picks";
    }
  }

  var els = {
    status: document.getElementById("packs-status"),
    search: document.getElementById("pack-search"),
    searchClear: document.getElementById("pack-search-clear"),
    chips: Array.prototype.slice.call(document.querySelectorAll(".chip[data-sort]")),
    grid: document.getElementById("pack-card-grid"),
    pager: document.getElementById("pack-pager"),
    pagerPrev: document.getElementById("pack-pager-prev"),
    pagerNext: document.getElementById("pack-pager-next"),
    pagerInfo: document.getElementById("pack-pager-info"),
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
    modalPackName: document.getElementById("pack-modal-pack-name"),
    modalPackMeta: document.getElementById("pack-modal-pack-meta"),
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
    query: "",
    sort: "top",
    packFilter: "",
    page: 1,
    pageSize: 60,
    total: 0,
    items: [],
    searchDebounce: 0,
    inflight: null,
    modalRow: null,
  };

  function packFromUrl() {
    return (new URLSearchParams(window.location.search).get("pack") || "").trim();
  }

  function setStatus(kind, html) {
    if (!els.status) return;
    if (!html) {
      els.status.hidden = true;
      els.status.innerHTML = "";
      els.status.className = "packs-status collection-status";
      return;
    }
    els.status.hidden = false;
    els.status.className =
      "packs-status collection-status state-" + (kind || "empty");
    els.status.innerHTML = html;
  }

  function searchUrl() {
    var qs = new URLSearchParams();
    qs.set("page", String(state.page));
    qs.set("page_size", String(state.pageSize));
    qs.set("sort", state.sort);
    if (state.query) qs.set("q", state.query);
    if (state.packFilter) qs.set("pack", state.packFilter);
    return "/api/packs/search?" + qs.toString();
  }

  function matchesQuery(row) {
    var q = (state.query || "").trim().toLowerCase();
    if (!q) return true;
    var pack = row.pack || {};
    var card = row.card || {};
    var hay = [
      pack.display_name,
      pack.code,
      card.name,
      card.set_code,
      card.set_name,
    ]
      .join(" ")
      .toLowerCase();
    return hay.indexOf(q) !== -1;
  }

  function sortRows(rows) {
    var key = state.sort || "top";
    function top(r) {
      return Number((r.card || {}).combined_per_pack_chance_percent) || 0;
    }
    function rarity(r) {
      return Number(((r.card || {}).rarity || {}).sort_order) || 0;
    }
    function sell(r) {
      return Number((r.card || {}).shop_sell_pokedollars) || 0;
    }
    function packCost(r) {
      return Number((r.pack || {}).crystal_price) || 0;
    }
    if (key === "rarity") {
      return rows.slice().sort(function (a, b) {
        return rarity(b) - rarity(a) || String((a.card || {}).name || "").localeCompare((b.card || {}).name || "");
      });
    }
    if (key === "cost_high") {
      return rows.slice().sort(function (a, b) {
        return sell(b) - sell(a) || packCost(b) - packCost(a);
      });
    }
    if (key === "cost_low") {
      return rows.slice().sort(function (a, b) {
        return sell(a) - sell(b) || packCost(a) - packCost(b);
      });
    }
    return rows.slice().sort(function (a, b) {
      return top(b) - top(a);
    });
  }

  function paginateRows(rows) {
    var total = rows.length;
    var pages = Math.max(1, Math.ceil(total / state.pageSize));
    var page = Math.min(Math.max(1, state.page), pages);
    var start = (page - 1) * state.pageSize;
    return {
      total: total,
      page: page,
      items: rows.slice(start, start + state.pageSize),
    };
  }

  function applyClientResult(rows, viaFallback) {
    var filtered = rows.filter(matchesQuery);
    if (state.packFilter) {
      var want = state.packFilter.toLowerCase();
      filtered = filtered.filter(function (r) {
        return ((r.pack || {}).code || "").toLowerCase() === want;
      });
    }
    var sorted = sortRows(filtered);
    var page = paginateRows(sorted);
    state.items = page.items;
    state.total = page.total;
    state.page = page.page;
    if (viaFallback) {
      state.viaFallback = true;
    }
    renderResults();
  }

  function loadSearchFallback(signal) {
    setStatus("empty", "Loading pack pools (compat mode)…");
    return apiFetch("/api/packs/catalog?page=1&page_size=80", { signal: signal })
      .then(function (r) {
        if (!r.ok) throw new Error("catalog_" + r.status);
        return r.json();
      })
      .then(function (cat) {
        var packs = cat.items || [];
        if (state.packFilter) {
          var want = state.packFilter.toLowerCase();
          packs = packs.filter(function (p) {
            return (p.code || "").toLowerCase() === want;
          });
        }
        if (!packs.length) return [];
        return Promise.all(
          packs.map(function (p) {
            return apiFetch(
              "/api/packs/catalog/" +
                encodeURIComponent(p.code) +
                "?card_page=1&card_page_size=200",
              { signal: signal }
            )
              .then(function (r) {
                if (!r.ok) throw new Error("detail_" + r.status);
                return r.json();
              })
              .then(function (detail) {
                var series = detail.series || {};
                var packMeta = {
                  code: series.code || p.code,
                  display_name: series.display_name || p.display_name,
                  crystal_price: series.crystal_price != null ? series.crystal_price : p.crystal_price,
                  pack_art_url: series.pack_art_url || p.pack_art_url,
                };
                return (detail.cards || []).map(function (card) {
                  return { pack: packMeta, card: card };
                });
              });
          })
        ).then(function (chunks) {
          var out = [];
          chunks.forEach(function (chunk) {
            out = out.concat(chunk);
          });
          return out;
        });
      })
      .then(function (rows) {
        applyClientResult(rows, true);
      });
  }

  function loadSearch() {
    if (state.inflight) state.inflight.abort();
    var ctrl = new AbortController();
    state.inflight = ctrl;
    state.viaFallback = false;
    setStatus("empty", "Loading pack pools…");
    if (els.grid) els.grid.innerHTML = "";

    apiFetch(searchUrl(), { signal: ctrl.signal })
      .then(function (r) {
        if (r.status === 404 || r.status === 501) {
          return loadSearchFallback(ctrl.signal);
        }
        if (!r.ok) throw new Error("search_" + r.status);
        return r.json().then(function (body) {
          state.items = body.items || [];
          state.total = body.total != null ? body.total : state.items.length;
          state.page = body.page || state.page;
          renderResults();
        });
      })
      .catch(function (err) {
        if (err && err.name === "AbortError") return;
        loadSearchFallback(ctrl.signal).catch(function (err2) {
          if (err2 && err2.name === "AbortError") return;
          state.items = [];
          state.total = 0;
          if (els.grid) els.grid.innerHTML = "";
          setStatus(
            "error",
            "Pack data is not available on the API yet. Restart or redeploy the <strong>Poke-Cards</strong> bot " +
              "(the build must include <code>poke_pon_bot/web/packs_api.py</code> and register it in " +
              "<code>server.py</code>), then hard-refresh this page."
          );
          if (els.pager) els.pager.hidden = true;
        });
      });
  }

  function renderResults() {
    var items = state.items;
    var pages = Math.max(1, Math.ceil(state.total / state.pageSize));

    if (!items.length) {
      setStatus(
        "empty",
        state.query || state.packFilter
          ? "No cards match your search."
          : "No cards in active pack pools."
      );
      if (els.grid) els.grid.innerHTML = "";
      if (els.pager) els.pager.hidden = true;
      return;
    }

    var summary =
      "<strong>" +
      state.total.toLocaleString() +
      "</strong> printing" +
      (state.total === 1 ? "" : "s") +
      (state.query ? ' matching "<strong>' + escapeHtml(state.query) + "</strong>\"" : "") +
      (state.packFilter
        ? ' in pack <strong>' + escapeHtml(state.packFilter) + "</strong>"
        : " across all packs") +
      " · sorted by <strong>" +
      sortLabel(state.sort) +
      "</strong>" +
      (state.viaFallback ? ' <span class="muted">(compat mode)</span>' : "");

    setStatus("empty", summary);

    if (!els.grid) return;
    els.grid.innerHTML = "";
    items.forEach(function (row, idx) {
      els.grid.appendChild(buildTile(row, idx));
    });

    if (els.pager) {
      els.pager.hidden = pages <= 1;
      if (els.pagerInfo) {
        els.pagerInfo.textContent = "Page " + state.page + " / " + pages;
      }
      if (els.pagerPrev) els.pagerPrev.disabled = state.page <= 1;
      if (els.pagerNext) els.pagerNext.disabled = state.page >= pages;
    }
  }

  function buildTile(row, idx) {
    var card = row.card || {};
    var pack = row.pack || {};
    var rarity = card.rarity || {};
    var wrap = document.createElement("div");
    wrap.className = "card-tile-wrap";

    var btn = document.createElement("button");
    btn.type = "button";
    btn.className =
      "card-tile " + rarityClassFor(rarity.display_name || rarity.code);
    btn.dataset.idx = String(idx);

    var img = document.createElement("img");
    img.loading = "lazy";
    img.decoding = "async";
    img.alt = card.name || "Card";
    img.className = "card-tile-img";
    img.src = card.image_small_url || card.image_large_url || "";

    var meta = document.createElement("div");
    meta.className = "card-tile-meta";
    meta.innerHTML =
      '<span class="card-tile-name">' +
      escapeHtml(card.name) +
      "</span>" +
      '<span class="card-tile-sub">' +
      escapeHtml(pack.display_name || pack.code || "Pack") +
      " · " +
      escapeHtml((card.set_name || card.set_code || "") + " #" + (card.collector_number || "?")) +
      "</span>";

    var statsRow = document.createElement("div");
    statsRow.className = "card-tile-stats";
    var stats = [];
    if (card.hp) stats.push('<span title="HP">❤ ' + escapeHtml(card.hp) + "</span>");
    if (card.max_damage) {
      stats.push('<span title="Max damage">⚡ ' + escapeHtml(String(card.max_damage)) + "</span>");
    }
    stats.push(
      '<span class="card-tile-rarity" title="Pull rate">' +
        escapeHtml(formatPct(card.combined_per_pack_chance_percent)) +
        "</span>"
    );
    if (card.shop_sell_pokedollars != null) {
      stats.push(
        '<span title="Shop sell value">' +
          escapeHtml(fmtPd(card.shop_sell_pokedollars)) +
          "</span>"
      );
    }
    statsRow.innerHTML = stats.join("");

    btn.appendChild(img);
    btn.appendChild(meta);
    btn.appendChild(statsRow);
    btn.addEventListener("click", function () {
      openModal(row);
    });

    wrap.appendChild(btn);
    return wrap;
  }

  function openModal(row) {
    if (!els.modal || !row) return;
    state.modalRow = row;
    var card = row.card || {};
    var pack = row.pack || {};
    var rarity = card.rarity || {};
    var reg = card.regular || {};
    var code = card.code_slot || {};

    els.modal.hidden = false;
    els.modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");

    els.modalImg.src = card.image_large_url || card.image_small_url || "";
    els.modalImg.alt = card.name || "Card";
    els.modalTitle.textContent = card.name || "Card";
    els.modalSet.textContent =
      (card.set_name || card.set_code || "") + " · #" + (card.collector_number || "?");
    els.modalRarity.textContent = rarity.display_name || card.tcg_rarity || "Unknown rarity";
    els.modalRarity.className =
      "modal-rarity " + rarityClassFor(rarity.display_name || rarity.code);
    els.modalHp.textContent = card.hp ? String(card.hp) : "—";
    els.modalDamage.textContent = card.max_damage ? String(card.max_damage) : "—";
    var types =
      Array.isArray(card.types) && card.types.length ? card.types.join(" · ") : "—";
    els.modalTypes.textContent = types;
    els.modalSell.textContent =
      card.shop_sell_pokedollars != null
        ? fmtPd(card.shop_sell_pokedollars) + " (if sold to shop)"
        : "—";

    els.modalPackName.textContent = pack.display_name || pack.code || "—";
    els.modalPackMeta.textContent =
      (pack.crystal_price != null ? pack.crystal_price + " ◆ · " : "") +
      "Series " +
      (pack.code || "—");

    if (els.modalOdds) {
      els.modalOdds.innerHTML =
        "<div><dt>Per pack (any slot)</dt><dd>" +
        escapeHtml(formatPct(card.combined_per_pack_chance_percent)) +
        "</dd></div>" +
        "<div><dt>Main slots</dt><dd>" +
        escapeHtml(formatPct(reg.per_pack_chance_percent)) +
        ' <span class="muted">(' +
        escapeHtml(formatPct(reg.per_card_chance_percent)) +
        " per slot)</span></dd></div>" +
        "<div><dt>Code slot</dt><dd>" +
        escapeHtml(formatPct(code.per_pack_chance_percent)) +
        ' <span class="muted">(' +
        escapeHtml(formatPct(code.per_card_chance_percent)) +
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
          var text = atk.text
            ? '<p class="atk-text">' + escapeHtml(atk.text) + "</p>"
            : "";
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
    state.modalRow = null;
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

  if (els.search) {
    els.search.addEventListener("input", function (e) {
      var v = (e.target.value || "").trim();
      if (els.searchClear) els.searchClear.hidden = !v;
      clearTimeout(state.searchDebounce);
      state.searchDebounce = setTimeout(function () {
        state.query = v;
        state.page = 1;
        loadSearch();
      }, 220);
    });
  }

  if (els.searchClear) {
    els.searchClear.addEventListener("click", function () {
      if (els.search) els.search.value = "";
      els.searchClear.hidden = true;
      state.query = "";
      state.page = 1;
      loadSearch();
    });
  }

  els.chips.forEach(function (chip) {
    chip.addEventListener("click", function () {
      var sort = chip.dataset.sort;
      if (!sort || sort === state.sort) return;
      state.sort = sort;
      state.page = 1;
      els.chips.forEach(function (c) {
        var on = c.dataset.sort === sort;
        c.classList.toggle("is-active", on);
        c.setAttribute("aria-pressed", on ? "true" : "false");
      });
      loadSearch();
    });
  });

  if (els.pagerPrev) {
    els.pagerPrev.addEventListener("click", function () {
      if (state.page <= 1) return;
      state.page -= 1;
      loadSearch();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }
  if (els.pagerNext) {
    els.pagerNext.addEventListener("click", function () {
      var pages = Math.max(1, Math.ceil(state.total / state.pageSize));
      if (state.page >= pages) return;
      state.page += 1;
      loadSearch();
      window.scrollTo({ top: 0, behavior: "smooth" });
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
  if (els.sidebarToggle && els.sidebar) {
    els.sidebarToggle.addEventListener("click", function () {
      var open = els.sidebar.classList.toggle("is-open");
      els.sidebarToggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
  }

  state.packFilter = packFromUrl();
  if (state.packFilter && els.search) {
    els.search.placeholder =
      "Search in " + state.packFilter + " (cards, sets)…";
  }

  bootAuth();
  loadSearch();
})();
