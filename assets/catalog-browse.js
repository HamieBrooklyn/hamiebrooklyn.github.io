/**
 * Shared catalog / Pokédex browse.
 * Mount once per page: search, set, dex #, type/rarity chips, sort, pager, tile grid.
 * Pages pass onSelect(card) for their own modal.
 */
(function () {
  "use strict";

  var SESSION_KEY = "pokepon-session";
  var FACETS_TTL_MS = 5 * 60 * 1000;
  var CATALOG_TTL_MS = 30 * 1000;
  var CATALOG_CACHE_MAX = 12;
  var SEARCH_DEBOUNCE_MS = 280;
  var DEX_DEBOUNCE_MS = 400;

  var facetsCache = { data: null, at: 0, inflight: null };
  var catalogCache = [];

  function apiBase() {
    return (window.POKEPON_API_BASE || "").replace(/\/+$/, "");
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function rarityClassFor(displayName) {
    var n = (displayName || "").toLowerCase();
    if (n.indexOf("secret") !== -1 || n.indexOf("hyper") !== -1) return "rarity-secret";
    if (n.indexOf("ultra") !== -1 || n.indexOf("illustration") !== -1 || n.indexOf("special") !== -1)
      return "rarity-ultra";
    if (n.indexOf("rare") !== -1) return "rarity-rare";
    if (n.indexOf("uncommon") !== -1) return "rarity-uncommon";
    if (n.indexOf("common") !== -1) return "rarity-common";
    return "rarity-unknown";
  }

  function readSessionToken() {
    try {
      return localStorage.getItem(SESSION_KEY) || "";
    } catch (_) {
      return "";
    }
  }

  function captureSessionFromFragment() {
    if (!window.location.hash) return;
    var params = new URLSearchParams(window.location.hash.slice(1));
    var token = params.get("session");
    if (!token) return;
    try {
      localStorage.setItem(SESSION_KEY, token);
    } catch (_) {}
    params.delete("session");
    var nextHash = params.toString();
    var cleanUrl =
      window.location.pathname +
      window.location.search +
      (nextHash ? "#" + nextHash : "");
    window.history.replaceState(null, "", cleanUrl);
  }

  function apiFetch(path, options) {
    if (window.PokePonApp && typeof window.PokePonApp.apiFetch === "function") {
      return window.PokePonApp.apiFetch(path, options);
    }
    options = options || {};
    options.credentials = "include";
    var headers = Object.assign({ "ngrok-skip-browser-warning": "1" }, options.headers || {});
    var token = readSessionToken();
    if (token) headers.Authorization = "Bearer " + token;
    options.headers = headers;
    return fetch(apiBase() + path, options);
  }

  function loginUrl() {
    var returnTo = window.location.href.split("#")[0];
    return apiBase() + "/auth/discord/login?return_to=" + encodeURIComponent(returnTo);
  }

  function catalogCacheGet(key) {
    for (var i = 0; i < catalogCache.length; i++) {
      if (catalogCache[i].key === key) {
        if (Date.now() - catalogCache[i].at > CATALOG_TTL_MS) {
          catalogCache.splice(i, 1);
          return null;
        }
        return catalogCache[i].data;
      }
    }
    return null;
  }

  function catalogCacheSet(key, data) {
    catalogCache = catalogCache.filter(function (row) {
      return row.key !== key;
    });
    catalogCache.unshift({ key: key, data: data, at: Date.now() });
    if (catalogCache.length > CATALOG_CACHE_MAX) catalogCache.length = CATALOG_CACHE_MAX;
  }

  function loadFacets() {
    if (facetsCache.data && Date.now() - facetsCache.at < FACETS_TTL_MS) {
      return Promise.resolve(facetsCache.data);
    }
    if (facetsCache.inflight) return facetsCache.inflight;
    facetsCache.inflight = apiFetch("/api/catalog/facets")
      .then(function (r) {
        if (!r.ok) throw new Error("facets " + r.status);
        return r.json();
      })
      .then(function (data) {
        facetsCache.data = data;
        facetsCache.at = Date.now();
        facetsCache.inflight = null;
        return data;
      })
      .catch(function (err) {
        facetsCache.inflight = null;
        throw err;
      });
    return facetsCache.inflight;
  }

  function toolbarHtml(prefix, opts) {
    return (
      '<section class="toolbar pokedex-toolbar" aria-label="' +
      escapeHtml(opts.toolbarLabel || "Catalog filters") +
      '">' +
      '<div class="toolbar-search">' +
      '<span class="search-icon" aria-hidden="true">⌕</span>' +
      '<input type="search" id="' +
      prefix +
      '-search" class="toolbar-search-input" placeholder="' +
      escapeHtml(opts.placeholder || "Search by card name…") +
      '" autocomplete="off" spellcheck="false" />' +
      '<button class="search-clear" type="button" id="' +
      prefix +
      '-search-clear" hidden aria-label="Clear search">×</button>' +
      "</div>" +
      '<div class="pokedex-filter-row">' +
      '<label class="pokedex-filter-label" for="' +
      prefix +
      '-set">Set</label>' +
      '<select id="' +
      prefix +
      '-set" class="pokedex-select"><option value="">All sets</option></select>' +
      '<label class="pokedex-filter-label" for="' +
      prefix +
      '-pokedex">Pokédex #</label>' +
      '<input type="number" id="' +
      prefix +
      '-pokedex" class="pokedex-number-input" min="1" max="1025" placeholder="e.g. 25" inputmode="numeric" />' +
      "</div>" +
      '<div class="toolbar-sort pokedex-type-chips" id="' +
      prefix +
      '-supertype-chips" role="group" aria-label="Card type">' +
      '<button class="chip is-active" type="button" data-supertype="" aria-pressed="true">All types</button>' +
      "</div>" +
      '<div class="toolbar-sort pokedex-rarity-chips" id="' +
      prefix +
      '-rarity-chips" role="group" aria-label="Rarity tier" hidden>' +
      '<button class="chip is-active" type="button" data-rarity-tier="" aria-pressed="true">All rarities</button>' +
      "</div>" +
      '<div class="toolbar-sort" id="' +
      prefix +
      '-sort-chips" role="group" aria-label="Sort cards">' +
      '<button class="chip is-active" type="button" data-sort="name" aria-pressed="true">A–Z</button>' +
      '<button class="chip" type="button" data-sort="rarity" aria-pressed="false">Rarest</button>' +
      '<button class="chip" type="button" data-sort="set" aria-pressed="false">Set</button>' +
      '<button class="chip" type="button" data-sort="number" aria-pressed="false">Number</button>' +
      "</div>" +
      "</section>" +
      '<section class="collection-status" id="' +
      prefix +
      '-status"></section>' +
      '<section class="card-grid" id="' +
      prefix +
      '-grid" aria-live="polite"></section>' +
      '<nav class="pager" id="' +
      prefix +
      '-pager" hidden aria-label="Pagination">' +
      '<button class="btn btn-ghost" type="button" id="' +
      prefix +
      '-pager-prev">← Prev</button>' +
      '<span class="pager-info" id="' +
      prefix +
      '-pager-info">Page 1</span>' +
      '<button class="btn btn-ghost" type="button" id="' +
      prefix +
      '-pager-next">Next →</button>' +
      "</nav>"
    );
  }

  function bindSidebarAuth(opts) {
    opts = opts || {};
    captureSessionFromFragment();

    var sidebarUser = document.getElementById("sidebar-user");
    var btnLogin = document.getElementById("btn-login");
    var btnLogout = document.getElementById("btn-logout");
    var userName = document.getElementById("user-name");
    var userAvatar = document.getElementById("user-avatar");

    function showSignedOut() {
      if (!sidebarUser) return;
      sidebarUser.dataset.state = "signed-out";
      var loading = sidebarUser.querySelector(".sidebar-user-loading");
      var out = sidebarUser.querySelector(".sidebar-user-signedout");
      var inn = sidebarUser.querySelector(".sidebar-user-signedin");
      if (loading) loading.hidden = true;
      if (out) out.hidden = false;
      if (inn) inn.hidden = true;
    }

    function showSignedIn(user) {
      if (!sidebarUser) return;
      sidebarUser.dataset.state = "signed-in";
      var loading = sidebarUser.querySelector(".sidebar-user-loading");
      var out = sidebarUser.querySelector(".sidebar-user-signedout");
      var inn = sidebarUser.querySelector(".sidebar-user-signedin");
      if (loading) loading.hidden = true;
      if (out) out.hidden = true;
      if (inn) inn.hidden = false;
      if (userName) userName.textContent = user.global_name || user.username || "Player";
      if (userAvatar) {
        userAvatar.src = user.avatar_url || "";
        userAvatar.hidden = !user.avatar_url;
      }
    }

    if (btnLogin) {
      btnLogin.addEventListener("click", function () {
        window.location.href = loginUrl();
      });
    }
    if (btnLogout) {
      btnLogout.addEventListener("click", function () {
        apiFetch("/auth/logout", { method: "POST" }).finally(function () {
          try {
            localStorage.removeItem(SESSION_KEY);
          } catch (_) {}
          window.location.reload();
        });
      });
    }

    return apiFetch("/api/me")
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        var ok = !!(data && data.authenticated && data.user);
        if (ok) showSignedIn(data.user);
        else showSignedOut();
        if (opts.onAuthenticated) opts.onAuthenticated(ok, data);
        return ok;
      })
      .catch(function () {
        showSignedOut();
        if (opts.onAuthenticated) opts.onAuthenticated(false);
        return false;
      });
  }

  function applyHashFilters(state) {
    if (!window.location.hash) return Promise.resolve(state);
    var params = new URLSearchParams(window.location.hash.slice(1));
    var setCode = params.get("set_code");
    if (setCode) state.set_code = setCode;
    var newsId = params.get("news_id");
    if (newsId) {
      state.news_id = newsId;
      return apiFetch("/api/news/" + encodeURIComponent(newsId))
        .then(function (r) {
          if (!r.ok) throw new Error("news " + r.status);
          return r.json();
        })
        .then(function (data) {
          if (data.catalog_set_code) state.set_code = data.catalog_set_code;
          else if (data.set_code && String(data.set_code).indexOf("dev-seed") !== 0) {
            state.set_code = data.set_code;
          }
          if (Array.isArray(data.card_ids) && data.card_ids.length) {
            state.card_ids = data.card_ids.map(String);
            state.page = 1;
          }
          state.news_title = data.title || data.set_name || "Catalog news";
          return state;
        })
        .catch(function (err) {
          console.warn("news filter", err);
          return state;
        });
    }
    var cardIds = params.get("card_ids");
    if (cardIds) {
      state.card_ids = cardIds
        .split(",")
        .map(function (s) {
          return s.trim();
        })
        .filter(Boolean);
    }
    return Promise.resolve(state);
  }

  function mount(options) {
    options = options || {};
    var root = options.root;
    if (!root) throw new Error("PokePonCatalogBrowse.mount needs root");

    var prefix = options.prefix || "dex";
    var showOwned = options.showOwnedBadge !== false;
    var listeners = [];

    var state = {
      q: "",
      set_code: "",
      card_ids: [],
      news_id: "",
      news_title: "",
      supertype: "",
      rarity_tier: "",
      pokedex: "",
      sort: "name",
      page: 1,
      page_size: options.pageSize || 60,
      total: 0,
      total_pages: 1,
      items: [],
      facets: null,
      loading: false,
      authenticated: false,
      searchTimer: null,
      pokedexTimer: null,
      catalogAbort: null,
      reqId: 0,
    };

    if (options.initialFilters) {
      Object.keys(options.initialFilters).forEach(function (k) {
        state[k] = options.initialFilters[k];
      });
    }

    root.innerHTML = toolbarHtml(prefix, options);

    var els = {
      search: root.querySelector("#" + prefix + "-search"),
      searchClear: root.querySelector("#" + prefix + "-search-clear"),
      setSelect: root.querySelector("#" + prefix + "-set"),
      pokedexInput: root.querySelector("#" + prefix + "-pokedex"),
      supertypeChips: root.querySelector("#" + prefix + "-supertype-chips"),
      rarityChips: root.querySelector("#" + prefix + "-rarity-chips"),
      sortChips: root.querySelector("#" + prefix + "-sort-chips"),
      status: root.querySelector("#" + prefix + "-status"),
      grid: root.querySelector("#" + prefix + "-grid"),
      pager: root.querySelector("#" + prefix + "-pager"),
      pagerPrev: root.querySelector("#" + prefix + "-pager-prev"),
      pagerNext: root.querySelector("#" + prefix + "-pager-next"),
      pagerInfo: root.querySelector("#" + prefix + "-pager-info"),
    };

    function on(el, ev, fn) {
      if (!el) return;
      el.addEventListener(ev, fn);
      listeners.push({ el: el, ev: ev, fn: fn });
    }

    function setStatus(kind, message) {
      if (!els.status) return;
      els.status.className = "collection-status";
      if (!message) {
        els.status.innerHTML = "";
        return;
      }
      if (kind === "error") els.status.classList.add("state-error");
      if (kind === "empty") els.status.classList.add("state-empty");
      els.status.innerHTML = "<p>" + escapeHtml(message) + "</p>";
    }

    function catalogQueryParams() {
      var params = new URLSearchParams();
      if (state.q) params.set("q", state.q);
      if (state.set_code) params.set("set_code", state.set_code);
      if (state.card_ids && state.card_ids.length) {
        params.set("card_ids", state.card_ids.join(","));
      }
      if (state.supertype) params.set("supertype", state.supertype);
      if (state.rarity_tier) params.set("rarity_tier", state.rarity_tier);
      if (state.pokedex) params.set("pokedex", state.pokedex);
      params.set("sort", state.sort);
      params.set("page", String(state.page));
      if (state.card_ids && state.card_ids.length) {
        params.set("page_size", String(Math.max(state.page_size, state.card_ids.length)));
      } else {
        params.set("page_size", String(state.page_size));
      }
      return params.toString();
    }

    function renderFacetControls() {
      var facets = state.facets;
      if (!facets) return;

      if (els.setSelect) {
        var sets = facets.sets || [];
        var html = '<option value="">All sets</option>';
        sets.forEach(function (s) {
          var code = s.set_code || "";
          var label = (s.set_name || code) + " (" + (s.card_count || 0) + ")";
          html +=
            '<option value="' +
            escapeHtml(code) +
            '"' +
            (state.set_code === code ? " selected" : "") +
            ">" +
            escapeHtml(label) +
            "</option>";
        });
        els.setSelect.innerHTML = html;
      }

      if (els.supertypeChips) {
        var supers = facets.supertypes || [];
        var chips =
          '<button class="chip' +
          (state.supertype === "" ? " is-active" : "") +
          '" type="button" data-supertype="" aria-pressed="' +
          (state.supertype === "" ? "true" : "false") +
          '">All types</button>';
        supers.forEach(function (row) {
          var st = row.supertype || "";
          chips +=
            '<button class="chip' +
            (state.supertype === st ? " is-active" : "") +
            '" type="button" data-supertype="' +
            escapeHtml(st) +
            '" aria-pressed="' +
            (state.supertype === st ? "true" : "false") +
            '">' +
            escapeHtml(st) +
            " (" +
            escapeHtml(row.card_count) +
            ")</button>";
        });
        els.supertypeChips.innerHTML = chips;
      }

      if (els.rarityChips) {
        var rarities = facets.rarities || [];
        if (!rarities.length) {
          els.rarityChips.hidden = true;
        } else {
          els.rarityChips.hidden = false;
          var rhtml =
            '<button class="chip' +
            (state.rarity_tier === "" ? " is-active" : "") +
            '" type="button" data-rarity-tier="" aria-pressed="' +
            (state.rarity_tier === "" ? "true" : "false") +
            '">All rarities</button>';
          rarities.forEach(function (row) {
            var code = row.code || "";
            rhtml +=
              '<button class="chip' +
              (state.rarity_tier === code ? " is-active" : "") +
              '" type="button" data-rarity-tier="' +
              escapeHtml(code) +
              '" aria-pressed="' +
              (state.rarity_tier === code ? "true" : "false") +
              '">' +
              escapeHtml(row.display_name || code) +
              "</button>";
          });
          els.rarityChips.innerHTML = rhtml;
        }
      }
    }

    function renderGrid() {
      if (!els.grid) return;
      var items = state.items;
      if (!items.length) {
        els.grid.innerHTML = "";
        setStatus("empty", options.emptyMessage || "No cards match these filters.");
        return;
      }
      setStatus("", "");
      var frag = document.createDocumentFragment();
      items.forEach(function (card, idx) {
        var wrap = document.createElement("div");
        wrap.className = "card-tile-wrap";

        var rarity = card.rarity || {};
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "card-tile " + rarityClassFor(rarity.display_name);
        btn.dataset.idx = String(idx);

        var img = document.createElement("img");
        img.alt = "";
        img.loading = "lazy";
        img.decoding = "async";
        img.className = "card-tile-img";
        img.src = card.image_small_url || card.image_large_url || "";

        var meta = document.createElement("div");
        meta.className = "card-tile-meta";
        meta.innerHTML =
          '<span class="card-tile-name">' +
          escapeHtml(card.name) +
          '</span><span class="card-tile-sub">' +
          escapeHtml((card.set_name || card.set_code || "") + " · #" + (card.collector_number || "?")) +
          "</span>";

        var statsRow = document.createElement("div");
        statsRow.className = "card-tile-stats";
        var stats = [];
        if (card.hp) stats.push('<span title="HP">❤ ' + escapeHtml(card.hp) + "</span>");
        if (card.max_damage)
          stats.push('<span title="Max damage">⚡ ' + escapeHtml(card.max_damage) + "</span>");
        if (rarity.display_name)
          stats.push(
            '<span class="card-tile-rarity" title="Rarity">' +
              escapeHtml(rarity.display_name) +
              "</span>"
          );
        statsRow.innerHTML = stats.join("");

        btn.appendChild(img);
        btn.appendChild(meta);
        btn.appendChild(statsRow);
        wrap.appendChild(btn);

        var owned = card.owned_count || 0;
        if (showOwned && owned > 0) {
          var badge = document.createElement("span");
          badge.className = "card-tile-owned";
          badge.textContent = owned === 1 ? "Owned" : "Owned ×" + owned;
          badge.title = "You have " + owned + " cop" + (owned === 1 ? "y" : "ies");
          wrap.appendChild(badge);
        }

        btn.addEventListener("click", function () {
          if (typeof options.onSelect === "function") options.onSelect(card, state);
        });

        frag.appendChild(wrap);
      });
      els.grid.innerHTML = "";
      els.grid.appendChild(frag);
    }

    function renderPager() {
      if (!els.pager) return;
      var show = state.total_pages > 1;
      els.pager.hidden = !show;
      if (!show) return;
      if (els.pagerInfo) {
        els.pagerInfo.textContent =
          "Page " + state.page + " of " + state.total_pages + " · " + state.total + " cards";
      }
      if (els.pagerPrev) els.pagerPrev.disabled = state.page <= 1;
      if (els.pagerNext) els.pagerNext.disabled = state.page >= state.total_pages;
    }

    function applyCatalogData(data) {
      state.items = data.items || [];
      state.total = data.total || 0;
      state.total_pages = data.total_pages || 1;
      state.page = data.page || state.page;
      if (data.authenticated) {
        state.authenticated = true;
        if (typeof options.onAuthenticated === "function") options.onAuthenticated(true);
      }
      renderGrid();
      renderPager();
      if (state.news_title && state.card_ids && state.card_ids.length) {
        setStatus(
          "info",
          "Showing " + state.total + " new cards from “" + state.news_title + "”."
        );
      }
    }

    function loadCatalog() {
      if (!apiBase()) {
        setStatus(
          "error",
          "API base URL is not configured. Add ?api=https://your-bot-host or set the meta tag."
        );
        return Promise.resolve();
      }

      var qs = catalogQueryParams();
      var cached = catalogCacheGet(qs);
      if (cached) {
        applyCatalogData(cached);
        return Promise.resolve(cached);
      }

      if (state.catalogAbort) {
        try {
          state.catalogAbort.abort();
        } catch (_) {}
      }
      var ac = typeof AbortController !== "undefined" ? new AbortController() : null;
      state.catalogAbort = ac;
      var reqId = ++state.reqId;
      state.loading = true;
      setStatus("info", options.loadingMessage || "Loading cards…");

      return apiFetch("/api/catalog?" + qs, ac ? { signal: ac.signal } : {})
        .then(function (r) {
          if (!r.ok) {
            return r.text().then(function (body) {
              var err = new Error("catalog " + r.status);
              err.status = r.status;
              err.body = body;
              throw err;
            });
          }
          return r.json();
        })
        .then(function (data) {
          if (reqId !== state.reqId) return data;
          catalogCacheSet(qs, data);
          applyCatalogData(data);
          return data;
        })
        .catch(function (err) {
          if (err && (err.name === "AbortError" || reqId !== state.reqId)) return;
          console.error(err);
          var msg = options.errorMessage || "Could not load the catalog.";
          if (err && err.status === 404) {
            msg += " The catalog API is not deployed yet — restart the bot after updating.";
          } else if (err && err.status >= 500) {
            msg += " Server error — deploy the latest bot code and restart, then hard-refresh.";
          } else if (!apiBase()) {
            msg = "API base URL is not configured.";
          } else {
            msg += " Check your connection and try again.";
          }
          setStatus("error", msg);
          if (els.grid) els.grid.innerHTML = "";
        })
        .finally(function () {
          if (reqId === state.reqId) state.loading = false;
        });
    }

    function resetPageAndLoad() {
      state.page = 1;
      return loadCatalog();
    }

    function onRootClick(e) {
      var superBtn = e.target.closest("[data-supertype]");
      if (superBtn && els.supertypeChips && els.supertypeChips.contains(superBtn)) {
        state.supertype = superBtn.getAttribute("data-supertype") || "";
        els.supertypeChips.querySelectorAll(".chip").forEach(function (c) {
          var onChip = c === superBtn;
          c.classList.toggle("is-active", onChip);
          c.setAttribute("aria-pressed", onChip ? "true" : "false");
        });
        resetPageAndLoad();
        return;
      }
      var rarityBtn = e.target.closest("[data-rarity-tier]");
      if (rarityBtn && els.rarityChips && els.rarityChips.contains(rarityBtn)) {
        state.rarity_tier = rarityBtn.getAttribute("data-rarity-tier") || "";
        els.rarityChips.querySelectorAll(".chip").forEach(function (c) {
          var onChip = c === rarityBtn;
          c.classList.toggle("is-active", onChip);
          c.setAttribute("aria-pressed", onChip ? "true" : "false");
        });
        resetPageAndLoad();
        return;
      }
      var sortBtn = e.target.closest("[data-sort]");
      if (sortBtn && els.sortChips && els.sortChips.contains(sortBtn)) {
        state.sort = sortBtn.getAttribute("data-sort") || "name";
        els.sortChips.querySelectorAll(".chip").forEach(function (c) {
          var onChip = c === sortBtn;
          c.classList.toggle("is-active", onChip);
          c.setAttribute("aria-pressed", onChip ? "true" : "false");
        });
        resetPageAndLoad();
      }
    }

    on(els.search, "input", function () {
      state.q = (els.search.value || "").trim();
      if (els.searchClear) els.searchClear.hidden = !state.q;
      clearTimeout(state.searchTimer);
      state.searchTimer = setTimeout(resetPageAndLoad, SEARCH_DEBOUNCE_MS);
    });
    on(els.searchClear, "click", function () {
      els.search.value = "";
      state.q = "";
      els.searchClear.hidden = true;
      resetPageAndLoad();
      els.search.focus();
    });
    on(els.setSelect, "change", function () {
      state.set_code = els.setSelect.value || "";
      resetPageAndLoad();
    });
    on(els.pokedexInput, "input", function () {
      clearTimeout(state.pokedexTimer);
      state.pokedexTimer = setTimeout(function () {
        var raw = (els.pokedexInput.value || "").trim();
        state.pokedex = raw && parseInt(raw, 10) > 0 ? String(parseInt(raw, 10)) : "";
        resetPageAndLoad();
      }, DEX_DEBOUNCE_MS);
    });
    on(root, "click", onRootClick);
    on(els.pagerPrev, "click", function () {
      if (state.page > 1) {
        state.page -= 1;
        loadCatalog();
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    });
    on(els.pagerNext, "click", function () {
      if (state.page < state.total_pages) {
        state.page += 1;
        loadCatalog();
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    });

    var ready = (options.hashFilters ? applyHashFilters(state) : Promise.resolve(state))
      .then(function () {
        return loadFacets();
      })
      .then(function (facets) {
        state.facets = facets;
        renderFacetControls();
      })
      .catch(function (err) {
        console.warn("facets", err);
      })
      .then(function () {
        return loadCatalog();
      });

    return {
      ready: ready,
      reload: loadCatalog,
      resetAndReload: resetPageAndLoad,
      getState: function () {
        return state;
      },
      setAuthenticated: function (ok) {
        state.authenticated = !!ok;
      },
      destroy: function () {
        clearTimeout(state.searchTimer);
        clearTimeout(state.pokedexTimer);
        if (state.catalogAbort) {
          try {
            state.catalogAbort.abort();
          } catch (_) {}
        }
        listeners.forEach(function (row) {
          row.el.removeEventListener(row.ev, row.fn);
        });
        listeners.length = 0;
        root.innerHTML = "";
      },
    };
  }

  window.PokePonCatalogBrowse = {
    mount: mount,
    apiFetch: apiFetch,
    loginUrl: loginUrl,
    captureSessionFromFragment: captureSessionFromFragment,
    bindSidebarAuth: bindSidebarAuth,
    escapeHtml: escapeHtml,
    rarityClassFor: rarityClassFor,
  };
})();
