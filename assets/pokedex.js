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
    var n = (displayName || "").toLowerCase();
    if (n.indexOf("secret") !== -1 || n.indexOf("hyper") !== -1) return "rarity-secret";
    if (n.indexOf("ultra") !== -1 || n.indexOf("illustration") !== -1 || n.indexOf("special") !== -1)
      return "rarity-ultra";
    if (n.indexOf("rare") !== -1) return "rarity-rare";
    if (n.indexOf("uncommon") !== -1) return "rarity-uncommon";
    if (n.indexOf("common") !== -1) return "rarity-common";
    return "rarity-unknown";
  }

  var state = {
    authenticated: false,
    q: "",
    set_code: "",
    supertype: "",
    rarity_tier: "",
    pokedex: "",
    sort: "name",
    page: 1,
    page_size: 60,
    total: 0,
    total_pages: 1,
    items: [],
    facets: null,
    loading: false,
    searchTimer: null,
    pokedexTimer: null,
  };

  var els = {
    sidebarUser: document.getElementById("sidebar-user"),
    btnLogin: document.getElementById("btn-login"),
    btnLogout: document.getElementById("btn-logout"),
    userName: document.getElementById("user-name"),
    userAvatar: document.getElementById("user-avatar"),
    search: document.getElementById("dex-search"),
    searchClear: document.getElementById("dex-search-clear"),
    setSelect: document.getElementById("dex-set"),
    pokedexInput: document.getElementById("dex-pokedex"),
    supertypeChips: document.getElementById("dex-supertype-chips"),
    rarityChips: document.getElementById("dex-rarity-chips"),
    sortChips: document.querySelectorAll(".pokedex-toolbar .toolbar-sort:last-of-type .chip[data-sort]"),
    status: document.getElementById("dex-status"),
    grid: document.getElementById("dex-grid"),
    pager: document.getElementById("dex-pager"),
    pagerPrev: document.getElementById("dex-pager-prev"),
    pagerNext: document.getElementById("dex-pager-next"),
    pagerInfo: document.getElementById("dex-pager-info"),
    modal: document.getElementById("dex-modal"),
    modalImg: document.getElementById("dex-modal-img"),
    modalTitle: document.getElementById("dex-modal-title"),
    modalSet: document.getElementById("dex-modal-set"),
    modalRarity: document.getElementById("dex-modal-rarity"),
    modalHp: document.getElementById("dex-modal-hp"),
    modalDamage: document.getElementById("dex-modal-damage"),
    modalTypes: document.getElementById("dex-modal-types"),
    modalSupertype: document.getElementById("dex-modal-supertype"),
    modalDex: document.getElementById("dex-modal-dex"),
    modalTcgId: document.getElementById("dex-modal-tcg-id"),
    modalAttacksSection: document.getElementById("dex-modal-attacks-section"),
    modalAttacks: document.getElementById("dex-modal-attacks"),
    modalOwned: document.getElementById("dex-modal-owned"),
    modalOwnedHeading: document.getElementById("dex-modal-owned-heading"),
    modalOwnedHint: document.getElementById("dex-modal-owned-hint"),
    modalOwnedList: document.getElementById("dex-modal-owned-list"),
  };

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

  function loginUrl() {
    var returnTo = window.location.href.split("#")[0];
    return api("/auth/discord/login?return_to=" + encodeURIComponent(returnTo));
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
    var signedIn = els.sidebarUser.querySelector(".sidebar-user-signedin");
    signedIn.hidden = false;
    if (els.userName) els.userName.textContent = user.global_name || user.username || "Player";
    if (els.userAvatar) {
      els.userAvatar.src = user.avatar_url || "";
      els.userAvatar.hidden = !user.avatar_url;
    }
  }

  function loadMe() {
    return apiFetch("/api/me")
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        if (data && data.authenticated && data.user) {
          state.authenticated = true;
          showSignedIn(data.user);
        } else {
          state.authenticated = false;
          showSignedOut();
        }
      })
      .catch(function () {
        state.authenticated = false;
        showSignedOut();
      });
  }

  function catalogQueryParams() {
    var params = new URLSearchParams();
    if (state.q) params.set("q", state.q);
    if (state.set_code) params.set("set_code", state.set_code);
    if (state.supertype) params.set("supertype", state.supertype);
    if (state.rarity_tier) params.set("rarity_tier", state.rarity_tier);
    if (state.pokedex) params.set("pokedex", state.pokedex);
    params.set("sort", state.sort);
    params.set("page", String(state.page));
    params.set("page_size", String(state.page_size));
    return params.toString();
  }

  function loadCatalog() {
    if (!API_BASE) {
      setStatus("error", "API base URL is not configured. Add ?api=https://your-bot-host or set the meta tag.");
      return Promise.resolve();
    }
    state.loading = true;
    setStatus("info", "Loading cards…");
    return apiFetch("/api/catalog?" + catalogQueryParams())
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
        state.items = data.items || [];
        state.total = data.total || 0;
        state.total_pages = data.total_pages || 1;
        state.page = data.page || state.page;
        if (data.authenticated) state.authenticated = true;
        renderGrid();
        renderPager();
      })
      .catch(function (err) {
        console.error(err);
        var msg = "Could not load the Pokédex.";
        if (err && err.status === 404) {
          msg += " The catalog API is not deployed yet — restart the bot after updating.";
        } else if (err && err.status >= 500) {
          msg += " Server error — deploy the latest bot code and restart, then hard-refresh.";
        } else if (!API_BASE) {
          msg = "API base URL is not configured.";
        } else {
          msg += " Check your connection and try again.";
        }
        setStatus("error", msg);
        if (els.grid) els.grid.innerHTML = "";
      })
      .finally(function () {
        state.loading = false;
      });
  }

  function loadFacets() {
    if (!API_BASE) return Promise.resolve();
    return apiFetch("/api/catalog/facets")
      .then(function (r) {
        if (!r.ok) throw new Error("facets " + r.status);
        return r.json();
      })
      .then(function (data) {
        state.facets = data;
        renderFacetControls();
      })
      .catch(function (err) {
        console.warn("facets", err);
      });
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
      setStatus("empty", "No cards match these filters.");
      return;
    }
    setStatus("", "");
    els.grid.innerHTML = "";
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
          '<span class="card-tile-rarity" title="Rarity">' + escapeHtml(rarity.display_name) + "</span>"
        );
      statsRow.innerHTML = stats.join("");

      btn.appendChild(img);
      btn.appendChild(meta);
      btn.appendChild(statsRow);
      wrap.appendChild(btn);

      var owned = card.owned_count || 0;
      if (owned > 0) {
        var badge = document.createElement("span");
        badge.className = "card-tile-owned";
        badge.textContent = owned === 1 ? "Owned" : "Owned ×" + owned;
        badge.title = "You have " + owned + " cop" + (owned === 1 ? "y" : "ies");
        wrap.appendChild(badge);
      }

      btn.addEventListener("click", function () {
        openModalForCard(card);
      });

      els.grid.appendChild(wrap);
    });
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

  function openModalForCard(card) {
    if (!els.modal || !card) return;
    fetchCardDetail(card.id)
      .then(function (detail) {
        fillModal(detail || card);
      })
      .catch(function () {
        fillModal(card);
      });
  }

  function fetchCardDetail(cardId) {
    return apiFetch("/api/catalog/cards/" + encodeURIComponent(String(cardId))).then(function (r) {
      if (!r.ok) throw new Error("detail " + r.status);
      return r.json();
    });
  }

  function fillModal(card) {
    var rarity = card.rarity || {};
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
    els.modalSupertype.textContent = card.supertype || "—";
    var dexNums = card.dex_numbers || [];
    els.modalDex.textContent = dexNums.length ? dexNums.join(", ") : "—";
    els.modalTcgId.textContent = card.tcg_card_id || "—";

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
            '<li><div class="atk-row"><span class="atk-name">' +
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

    renderOwnedPanel(card);
  }

  function renderOwnedPanel(card) {
    if (!els.modalOwned) return;
    var copies = card.owned_copies || [];
    var count = card.owned_count != null ? card.owned_count : copies.length;

    if (!state.authenticated) {
      els.modalOwned.hidden = false;
      els.modalOwnedHeading.textContent = "Your collection";
      els.modalOwnedHint.hidden = false;
      els.modalOwnedHint.textContent =
        "Sign in with Discord to see whether you own this printing.";
      els.modalOwnedList.innerHTML =
        '<li class="muted"><button type="button" class="btn btn-primary btn-small" id="dex-modal-login">Sign in</button></li>';
      var loginBtn = document.getElementById("dex-modal-login");
      if (loginBtn) {
        loginBtn.addEventListener("click", function () {
          window.location.href = loginUrl();
        });
      }
      return;
    }

    if (count <= 0 && !copies.length) {
      els.modalOwned.hidden = false;
      els.modalOwnedHeading.textContent = "Your collection";
      els.modalOwnedHint.hidden = false;
      els.modalOwnedHint.textContent = "You do not own this printing yet.";
      els.modalOwnedList.innerHTML = "";
      return;
    }

    els.modalOwned.hidden = false;
    els.modalOwnedHeading.textContent =
      count === 1 ? "You own 1 copy" : "You own " + count + " copies";
    els.modalOwnedHint.hidden = true;
    els.modalOwnedList.innerHTML = copies
      .map(function (copy) {
        var pid = copy.public_id || "";
        if (!pid) return "";
        var grade =
          copy.grade != null
            ? ' <span class="pokedex-owned-grade">Grade ' + escapeHtml(copy.grade_label || copy.grade) + "</span>"
            : "";
        var fav = copy.is_favorite ? ' <span class="pokedex-owned-fav" title="Favorited">⭐</span>' : "";
        return (
          '<li class="pokedex-owned-item"><code class="pokedex-owned-id">' +
          escapeHtml(pid) +
          '</code><button type="button" class="btn btn-ghost btn-small pokedex-copy-id" data-copy-id="' +
          escapeHtml(pid) +
          '">Copy</button>' +
          grade +
          fav +
          "</li>"
        );
      })
      .join("");
    els.modalOwnedList.querySelectorAll(".pokedex-copy-id").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var text = btn.getAttribute("data-copy-id") || "";
        if (!text) return;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text);
        }
      });
    });
    if (els.modalOwnedHint) {
      els.modalOwnedHint.hidden = false;
      els.modalOwnedHint.innerHTML =
        'Open <a class="pokedex-owned-link" href="/collection/">Collection</a> and paste the Card ID into search.';
    }
  }

  function closeModal() {
    if (!els.modal) return;
    els.modal.hidden = true;
    els.modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
  }

  function resetPageAndLoad() {
    state.page = 1;
    loadCatalog();
  }

  function bindEvents() {
    if (els.btnLogin) {
      els.btnLogin.addEventListener("click", function () {
        window.location.href = loginUrl();
      });
    }
    if (els.btnLogout) {
      els.btnLogout.addEventListener("click", function () {
        apiFetch("/auth/logout", { method: "POST" })
          .finally(function () {
            clearSessionToken();
            window.location.reload();
          });
      });
    }

    function clearSessionToken() {
      try {
        localStorage.removeItem(SESSION_KEY);
      } catch (_) {}
    }

    if (els.search) {
      els.search.addEventListener("input", function () {
        state.q = (els.search.value || "").trim();
        if (els.searchClear) els.searchClear.hidden = !state.q;
        clearTimeout(state.searchTimer);
        state.searchTimer = setTimeout(resetPageAndLoad, 280);
      });
    }
    if (els.searchClear) {
      els.searchClear.addEventListener("click", function () {
        els.search.value = "";
        state.q = "";
        els.searchClear.hidden = true;
        resetPageAndLoad();
      });
    }

    if (els.setSelect) {
      els.setSelect.addEventListener("change", function () {
        state.set_code = els.setSelect.value || "";
        resetPageAndLoad();
      });
    }

    if (els.pokedexInput) {
      els.pokedexInput.addEventListener("input", function () {
        clearTimeout(state.pokedexTimer);
        state.pokedexTimer = setTimeout(function () {
          var raw = (els.pokedexInput.value || "").trim();
          state.pokedex = raw && parseInt(raw, 10) > 0 ? String(parseInt(raw, 10)) : "";
          resetPageAndLoad();
        }, 400);
      });
    }

    document.addEventListener("click", function (e) {
      var superBtn = e.target.closest("[data-supertype]");
      if (superBtn && els.supertypeChips && els.supertypeChips.contains(superBtn)) {
        state.supertype = superBtn.getAttribute("data-supertype") || "";
        els.supertypeChips.querySelectorAll(".chip").forEach(function (c) {
          var on = c === superBtn;
          c.classList.toggle("is-active", on);
          c.setAttribute("aria-pressed", on ? "true" : "false");
        });
        resetPageAndLoad();
        return;
      }
      var rarityBtn = e.target.closest("[data-rarity-tier]");
      if (rarityBtn && els.rarityChips && els.rarityChips.contains(rarityBtn)) {
        state.rarity_tier = rarityBtn.getAttribute("data-rarity-tier") || "";
        els.rarityChips.querySelectorAll(".chip").forEach(function (c) {
          var on = c === rarityBtn;
          c.classList.toggle("is-active", on);
          c.setAttribute("aria-pressed", on ? "true" : "false");
        });
        resetPageAndLoad();
        return;
      }
      var sortBtn = e.target.closest(".pokedex-toolbar .chip[data-sort]");
      if (sortBtn) {
        state.sort = sortBtn.getAttribute("data-sort") || "name";
        document.querySelectorAll(".pokedex-toolbar .chip[data-sort]").forEach(function (c) {
          var on = c === sortBtn;
          c.classList.toggle("is-active", on);
          c.setAttribute("aria-pressed", on ? "true" : "false");
        });
        resetPageAndLoad();
      }
    });

    if (els.pagerPrev) {
      els.pagerPrev.addEventListener("click", function () {
        if (state.page > 1) {
          state.page -= 1;
          loadCatalog();
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
      });
    }
    if (els.pagerNext) {
      els.pagerNext.addEventListener("click", function () {
        if (state.page < state.total_pages) {
          state.page += 1;
          loadCatalog();
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
      });
    }

    if (els.modal) {
      els.modal.querySelectorAll("[data-close]").forEach(function (node) {
        node.addEventListener("click", closeModal);
      });
    }
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeModal();
    });
  }

  function init() {
    captureSessionFromFragment();
    bindEvents();
    Promise.all([loadMe(), loadFacets()]).then(function () {
      return loadCatalog();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
