/* Collection dashboard for PokePon — talks to the bot's HTTP API.
 *
 * Auth model:
 *   - `GET <api>/api/me` returns either {authenticated:false} or {authenticated:true,user:{…}}.
 *   - If not authenticated, "Sign in with Discord" sends the browser to
 *     `<api>/auth/discord/login?return_to=<this page>`. The bot mints a signed
 *     session cookie on the callback, then redirects back here.
 *   - Subsequent calls send the cookie via `credentials: "include"`.
 */
(function () {
  "use strict";

  /** API base URL set by the inline script in collection.html. */
  var API_BASE = (window.POKEPON_API_BASE || "").replace(/\/+$/, "");
  /** Same-origin requests get '' so fetch keeps using the current host. */
  function api(path) {
    return API_BASE + path;
  }

  var SESSION_KEY = "pokepon-session";

  function readSessionToken() {
    try {
      return localStorage.getItem(SESSION_KEY) || "";
    } catch (_) {
      return "";
    }
  }

  function storeSessionToken(token) {
    try {
      localStorage.setItem(SESSION_KEY, token);
    } catch (_) {}
  }

  function clearSessionToken() {
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch (_) {}
  }

  function captureSessionFromFragment() {
    if (!window.location.hash) return;
    var params = new URLSearchParams(window.location.hash.slice(1));
    var token = params.get("session");
    if (!token) return;
    storeSessionToken(token);
    params.delete("session");
    var nextHash = params.toString();
    var cleanUrl =
      window.location.pathname +
      window.location.search +
      (nextHash ? "#" + nextHash : "");
    window.history.replaceState(null, "", cleanUrl);
  }

  /**
   * Default headers sent with every API call.
   *
   * `ngrok-skip-browser-warning` bypasses ngrok-free's HTML interstitial that
   * otherwise hijacks cross-origin browser requests (it returns an HTML page
   * with no CORS headers, so `fetch` reports "NetworkError"). Any non-empty
   * value works; ngrok only checks for the header's presence. Harmless on
   * non-ngrok hosts since the server just ignores headers it doesn't know.
   */
  function apiHeaders() {
    var headers = { "ngrok-skip-browser-warning": "1" };
    var token = readSessionToken();
    if (token) headers.Authorization = "Bearer " + token;
    return headers;
  }
  function apiFetch(path, options) {
    options = options || {};
    options.credentials = "include";
    var headers = Object.assign({}, apiHeaders(), options.headers || {});
    options.headers = headers;
    return fetch(api(path), options);
  }

  function copyCardId(text, buttonEl) {
    var pid = (text || "").trim();
    if (!pid) return;
    var flash = function (ok) {
      if (!buttonEl || !ok) return;
      var orig = buttonEl.textContent;
      buttonEl.textContent = "Copied!";
      setTimeout(function () {
        buttonEl.textContent = orig;
      }, 1500);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard
        .writeText(pid)
        .then(function () {
          flash(true);
        })
        .catch(function () {
          fallbackCopy();
        });
    } else {
      fallbackCopy();
    }
    function fallbackCopy() {
      try {
        var ta = document.createElement("textarea");
        ta.value = pid;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        flash(true);
      } catch (_) {
        flash(false);
      }
    }
  }

  var STATUS_KIND = {
    INFO: "info",
    EMPTY: "empty",
    ERROR: "error",
    AUTH: "auth",
  };

  var els = {
    sidebarUser: document.getElementById("sidebar-user"),
    btnLogin: document.getElementById("btn-login"),
    btnLogout: document.getElementById("btn-logout"),
    userName: document.getElementById("user-name"),
    userAvatar: document.getElementById("user-avatar"),
    search: document.getElementById("search-input"),
    searchClear: document.getElementById("search-clear"),
    chips: Array.prototype.slice.call(document.querySelectorAll(".chip[data-sort]")),
    filterFavoritedBtn: document.getElementById("filter-favorited"),
    filterEvolvableBtn: document.getElementById("filter-evolvable"),
    filterNonEvolvableBtn: document.getElementById("filter-non-evolvable"),
    filterDuplicatesBtn: document.getElementById("filter-duplicates"),
    btnBulkSell: document.getElementById("btn-bulk-sell"),
    status: document.getElementById("status"),
    grid: document.getElementById("card-grid"),
    evoSections: document.getElementById("evo-sections"),
    pager: document.getElementById("pager"),
    pagerPrev: document.getElementById("pager-prev"),
    pagerNext: document.getElementById("pager-next"),
    pagerInfo: document.getElementById("pager-info"),
    modal: document.getElementById("card-modal"),
    modalImg: document.getElementById("modal-img"),
    modalTitle: document.getElementById("modal-title"),
    modalSet: document.getElementById("modal-set"),
    modalRarity: document.getElementById("modal-rarity"),
    modalHp: document.getElementById("modal-hp"),
    modalDamage: document.getElementById("modal-damage"),
    modalTypes: document.getElementById("modal-types"),
    modalPid: document.getElementById("modal-pid"),
    modalCopyId: document.getElementById("modal-copy-id"),
    modalFavoriteBtn: document.getElementById("modal-favorite-btn"),
    modalAttacksSection: document.getElementById("modal-attacks-section"),
    modalAttacks: document.getElementById("modal-attacks"),
    modalObtained: document.getElementById("modal-obtained"),
    modalSellSection: document.getElementById("modal-sell-section"),
    modalSellQuote: document.getElementById("modal-sell-quote"),
    modalSellBlock: document.getElementById("modal-sell-block"),
    modalSellWarn: document.getElementById("modal-sell-warn"),
    modalSellBtn: document.getElementById("modal-sell-btn"),
    modalSellBack: document.getElementById("modal-sell-back"),
    modalSellMsg: document.getElementById("modal-sell-msg"),
    modalGradeSection: document.getElementById("modal-grade-section"),
    modalGradeSummary: document.getElementById("modal-grade-summary"),
    modalGradeMsg: document.getElementById("modal-grade-msg"),
    modalGradeRollBtn: document.getElementById("modal-grade-roll-btn"),
    modalGradeRemoveBtn: document.getElementById("modal-grade-remove-btn"),
    modalFooter: document.getElementById("modal-footer"),
    modalEvoFooter: document.getElementById("modal-evo-footer"),
    modalEvolveSection: document.getElementById("modal-evolve-section"),
    modalEvoStages: document.getElementById("modal-evo-stages"),
    modalEvoBlock: document.getElementById("modal-evo-block"),
    modalEvoTargets: document.getElementById("modal-evo-targets"),
    modalEvoBtn: document.getElementById("modal-evo-btn"),
    modalEvoMsg: document.getElementById("modal-evo-msg"),
    sidebarToggle: document.getElementById("sidebar-toggle"),
    sidebar: document.getElementById("sidebar"),
    bulkBar: document.getElementById("bulk-sell-bar"),
    bulkCount: document.getElementById("bulk-sell-count"),
    bulkTotal: document.getElementById("bulk-sell-total"),
    bulkHint: document.getElementById("bulk-sell-hint"),
    bulkCancel: document.getElementById("bulk-sell-cancel"),
    bulkNext: document.getElementById("bulk-sell-next"),
    bulkSelectPage: document.getElementById("bulk-select-page"),
    bulkClearSelection: document.getElementById("bulk-clear-selection"),
  };

  var state = {
    authenticated: false,
    page: 1,
    pageSize: 60,
    sort: "newest",
    query: "",
    filterFavorited: false,
    filterEvolvable: false,
    filterNonEvolvable: false,
    filterDuplicates: false,
    craftRole: "",
    total: 0,
    items: [],
    sections: [],
    sectionsInflight: null,
    inflight: null,
    searchDebounce: 0,
    modalItem: null,
    sellUiStep: 0,
    sellInFlight: false,
    evoSelectedTargetId: null,
    evoInFlight: false,
    favoriteInFlight: false,
    gradeInFlight: false,
    modalSlabObjectUrl: null,
    tileSlabUrls: {},
    bulkMode: false,
    bulkSelected: {},
    bulkQuoteInFlight: null,
    bulkQuoteDebounce: 0,
    bulkQuote: null,
  };

  var modalHistory = { card: false, evo: false };

  // ------- helpers -------------------------------------------------------

  function setStatus(kind, html) {
    if (!html) {
      els.status.hidden = true;
      els.status.innerHTML = "";
      return;
    }
    els.status.hidden = false;
    els.status.className = "collection-status state-" + kind;
    els.status.innerHTML = html;
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /** Discord copy uses **bold** — strip for plain web display. */
  function plainDiscordMsg(s) {
    return String(s == null ? "" : s).replace(/\*\*/g, "");
  }

  function fmtPokedollars(n) {
    if (n == null || n === "") return "—";
    return "₽" + Number(n).toLocaleString();
  }

  function rarityClassFor(displayName) {
    var v = (displayName || "").toLowerCase();
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

  // ------- auth ---------------------------------------------------------

  function showLoadingUser() {
    els.sidebarUser.dataset.state = "loading";
    els.sidebarUser.querySelector(".sidebar-user-loading").hidden = false;
    els.sidebarUser.querySelector(".sidebar-user-signedout").hidden = true;
    els.sidebarUser.querySelector(".sidebar-user-signedin").hidden = true;
  }
  function showSignedOut() {
    els.sidebarUser.dataset.state = "signed-out";
    els.sidebarUser.querySelector(".sidebar-user-loading").hidden = true;
    els.sidebarUser.querySelector(".sidebar-user-signedout").hidden = false;
    els.sidebarUser.querySelector(".sidebar-user-signedin").hidden = true;
  }
  function showSignedIn(user) {
    els.sidebarUser.dataset.state = "signed-in";
    els.sidebarUser.querySelector(".sidebar-user-loading").hidden = true;
    els.sidebarUser.querySelector(".sidebar-user-signedout").hidden = true;
    els.sidebarUser.querySelector(".sidebar-user-signedin").hidden = false;
    var label = user.global_name || user.username || "Trainer";
    els.userName.textContent = label;
    if (user.avatar_url) {
      els.userAvatar.src = user.avatar_url;
      els.userAvatar.alt = label;
    } else {
      els.userAvatar.alt = "";
      els.userAvatar.removeAttribute("src");
    }
  }

  function loginUrl() {
    return api("/auth/discord/login?return_to=" + encodeURIComponent(window.location.href));
  }

  function bootAuth() {
    showLoadingUser();
    apiFetch("/api/me")
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (body) {
        if (body && body.authenticated && body.user) {
          state.authenticated = true;
          showSignedIn(body.user);
          loadCollection(true);
        } else {
          state.authenticated = false;
          showSignedOut();
          renderUnauthenticated();
        }
      })
      .catch(function (err) {
        state.authenticated = false;
        showSignedOut();
        setStatus(
          STATUS_KIND.ERROR,
          'Could not reach the PokePon API at <code>' +
            escapeHtml(API_BASE || window.location.origin) +
            "</code>. " +
            "Double-check that the bot's web server is online and the page's " +
            "<code>pokepon-api-base</code> meta tag points at it. " +
            "<br><span class=\"muted\">Details: " +
            escapeHtml(err.message || String(err)) +
            "</span>"
        );
      });
  }

  function renderUnauthenticated() {
    els.grid.innerHTML = "";
    if (els.evoSections) {
      els.evoSections.innerHTML = "";
      els.evoSections.hidden = true;
    }
    els.pager.hidden = true;
    setStatus(
      STATUS_KIND.AUTH,
      'Sign in with Discord to load your bot collection. The button is in the side panel.'
    );
  }

  // ------- collection fetch + render ------------------------------------

  var CRAFT_TRAINER_SUBTYPES = ["Stadium", "Supporter", "Tool"];
  var ITEM_NAME_HINTS = [
    "Potion", "Ball", "Berry", "Mail", "Rod", "Stone", "Pass", "Candy",
    "Module", "Toolkit", "Glove", "Charm", "Case", "Box", "Capsule",
    "Ticket", "Disc", "Energy", "Tin", "Fossil", "Amber", "Incense",
    "Repel", "Vest", "Coat", "Scroll",
  ];

  function nameLooksLikeItem(name) {
    var n = String(name || "").trim();
    if (!n) return false;
    var lower = n.toLowerCase();
    return ITEM_NAME_HINTS.some(function (hint) {
      var h = hint.toLowerCase();
      var re = new RegExp("\\b" + h.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b");
      return re.test(lower);
    });
  }

  function subtypeList(card) {
    var raw = card && card.tcg_subtypes;
    if (raw == null) return [];
    if (Array.isArray(raw)) {
      return raw
        .map(function (s) {
          return String(s).trim();
        })
        .filter(Boolean);
    }
    if (typeof raw === "string") {
      var s = raw.trim();
      if (!s) return [];
      if (s.charAt(0) === "[") {
        try {
          var parsed = JSON.parse(s);
          if (Array.isArray(parsed)) {
            return parsed
              .map(function (x) {
                return String(x).trim();
              })
              .filter(Boolean);
          }
        } catch (_) {
          return [s];
        }
      }
      return [s];
    }
    return [];
  }

  function hasSubtype(subs, label) {
    var want = label.toLowerCase();
    return subs.some(function (s) {
      return s.toLowerCase() === want;
    });
  }

  function effectiveCraftRole(item) {
    var role = item.craft_role;
    var card = item.card || {};
    var st = (card.supertype || "").trim();
    var subs = subtypeList(card);
    if (st === "Energy") return "item";
    if (st !== "Trainer") return role || "other";
    if (hasSubtype(subs, "Item")) return "item";
    if (hasSubtype(subs, "Pokémon Tool")) return "item";
    if (
      CRAFT_TRAINER_SUBTYPES.some(function (label) {
        return hasSubtype(subs, label);
      })
    ) {
      return "craft_trainer";
    }
    if (nameLooksLikeItem(card.name)) return "item";
    if (role === "item") return "item";
    return "other";
  }

  function craftUsesForItem(item) {
    if (item.craft_uses && item.craft_uses.max != null) return item.craft_uses;
    if (effectiveCraftRole(item) === "craft_trainer") {
      return { max: 3, remaining: 3, used: 0 };
    }
    return null;
  }

  function buildCraftUsesMeter(uses) {
    if (!uses || uses.max == null) return null;
    var max = Number(uses.max) || 3;
    var rem = Number(uses.remaining);
    if (isNaN(rem)) rem = max;
    rem = Math.max(0, Math.min(max, rem));

    var root = document.createElement("div");
    root.className = "craft-uses-meter";
    root.setAttribute("aria-label", rem + " of " + max + " craft uses remaining");

    var label = document.createElement("span");
    label.className = "craft-uses-meter-label";
    label.textContent = "Uses";

    var track = document.createElement("span");
    track.className = "craft-uses-meter-track";
    track.setAttribute("aria-hidden", "true");
    var i;
    for (i = 0; i < max; i++) {
      var seg = document.createElement("span");
      seg.className = "craft-uses-meter-seg" + (i < rem ? " is-filled" : "");
      track.appendChild(seg);
    }

    var count = document.createElement("span");
    count.className = "craft-uses-meter-count";
    count.textContent = String(rem) + "/" + String(max);

    root.appendChild(label);
    root.appendChild(track);
    root.appendChild(count);
    return root;
  }

  function buildCollectionPath() {
    var qs = new URLSearchParams();
    qs.set("page", String(state.page));
    qs.set("page_size", String(state.pageSize));
    qs.set("sort", state.sort);
    if (state.query) qs.set("q", state.query);
    if (state.filterFavorited) qs.set("favorited", "1");
    if (state.filterEvolvable) qs.set("evolvable", "1");
    if (state.filterNonEvolvable) qs.set("non_evolvable", "1");
    if (state.filterDuplicates) qs.set("duplicates", "1");
    if (state.craftRole === "craft_trainer") {
      qs.set("supertype", "Trainer");
    } else if (state.craftRole) {
      qs.set("craft_role", state.craftRole);
    }
    return "/api/me/collection?" + qs.toString();
  }

  /** Align grid with craft role (Stadium/Supporter always under Trainers). */
  function filterRowsForCraftChip(rows) {
    var role = state.craftRole;
    if (!role) return rows;
    if (role === "item") {
      return rows.filter(function (it) {
        return effectiveCraftRole(it) === "item";
      });
    }
    if (role === "craft_trainer") {
      return rows.filter(function (it) {
        return effectiveCraftRole(it) === "craft_trainer";
      });
    }
    return rows;
  }

  function buildEvolutionSectionsPath() {
    var qs = new URLSearchParams();
    qs.set("page_size", String(state.pageSize));
    qs.set("sort", state.sort);
    qs.set("q", state.query);
    if (state.filterFavorited) qs.set("favorited", "1");
    if (state.filterDuplicates) qs.set("duplicates", "1");
    return "/api/me/collection/evolution-sections?" + qs.toString();
  }

  function loadEvolutionSections() {
    if (!state.authenticated || !state.query || state.page !== 1) {
      state.sections = [];
      if (els.evoSections) {
        els.evoSections.innerHTML = "";
        els.evoSections.hidden = true;
      }
      return;
    }
    if (state.sectionsInflight) state.sectionsInflight.abort();
    var ctrl = new AbortController();
    state.sectionsInflight = ctrl;
    apiFetch(buildEvolutionSectionsPath(), { signal: ctrl.signal })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (body) {
        state.sectionsInflight = null;
        if ((body.query || "").toLowerCase() !== (state.query || "").toLowerCase() || state.page !== 1) {
          return;
        }
        state.sections = Array.isArray(body.sections) ? body.sections : [];
        renderEvolutionSections();
        if (state.total === 0 && hasEvolutionSections()) {
          els.pager.hidden = true;
          setStatus(STATUS_KIND.INFO, "No exact name match — see evolution lines below.");
        }
      })
      .catch(function (err) {
        if (err.name === "AbortError") return;
        state.sectionsInflight = null;
      });
  }

  function loadCollection(scrollTop) {
    if (!state.authenticated) {
      renderUnauthenticated();
      return;
    }
    if (state.inflight) {
      // Discard old result — newer query supersedes it.
      state.inflight.abort();
    }
    if (state.sectionsInflight) {
      state.sectionsInflight.abort();
      state.sectionsInflight = null;
    }
    var ctrl = new AbortController();
    state.inflight = ctrl;
    setStatus(STATUS_KIND.INFO, "Loading your collection…");
    els.grid.setAttribute("aria-busy", "true");

    apiFetch(buildCollectionPath(), { signal: ctrl.signal })
      .then(function (r) {
        if (r.status === 401) {
          state.authenticated = false;
          showSignedOut();
          renderUnauthenticated();
          throw new Error("unauthenticated");
        }
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (body) {
        state.inflight = null;
        var rows = Array.isArray(body.items) ? body.items : [];
        state.items = filterRowsForCraftChip(rows);
        state.sections = [];
        state.total = state.craftRole ? state.items.length : Number(body.total) || 0;
        state.page = Number(body.page) || 1;
        state.pageSize = Number(body.page_size) || state.pageSize;
        renderCollection();
        loadEvolutionSections();
        if (scrollTop) window.scrollTo({ top: 0, behavior: "smooth" });
      })
      .catch(function (err) {
        if (err.name === "AbortError") return;
        if ((err.message || "") === "unauthenticated") return;
        state.inflight = null;
        setStatus(
          STATUS_KIND.ERROR,
          "Could not load your collection: " + escapeHtml(err.message || String(err))
        );
      })
      .finally(function () {
        els.grid.removeAttribute("aria-busy");
      });
  }

  function primaryDexNumber(item) {
    var dns = item && item.card && item.card.dex_numbers;
    if (!Array.isArray(dns) || !dns.length) return null;
    var n = Number(dns[0]);
    return Number.isFinite(n) ? n : null;
  }

  function groupItemsByDex(items) {
    var map = Object.create(null);
    var order = [];
    items.forEach(function (it) {
      var dex = primaryDexNumber(it);
      var key =
        dex != null ? "d:" + dex : "n:" + ((it.card && it.card.name) || "?");
      if (!map[key]) {
        map[key] = {
          dex: dex,
          label: (it.card && it.card.name) || "Unknown",
          items: [],
        };
        order.push(key);
      }
      map[key].items.push(it);
    });
    return order.map(function (k) {
      return map[k];
    });
  }

  function hasEvolutionSections() {
    return !!(state.query && state.page === 1 && state.sections && state.sections.length);
  }

  function renderEvolutionSections() {
    if (!els.evoSections) return;
    els.evoSections.innerHTML = "";
    if (!hasEvolutionSections()) {
      els.evoSections.hidden = true;
      return;
    }
    els.evoSections.hidden = false;
    state.sections.forEach(function (sec) {
      var items = Array.isArray(sec.items) ? sec.items : [];
      if (!items.length) return;
      var block = document.createElement("section");
      block.className = "collection-evo-section";
      var heading = document.createElement("h2");
      heading.className = "collection-evo-heading";
      heading.textContent = sec.label || "Evolution line";
      var grid = document.createElement("div");
      grid.className = "card-grid collection-evo-grid";
      items.forEach(function (it) {
        grid.appendChild(buildTile(it, -1));
      });
      block.appendChild(heading);
      block.appendChild(grid);
      els.evoSections.appendChild(block);
    });
  }

  function renderCollection() {
    if (state.total === 0 && !hasEvolutionSections()) {
      els.grid.innerHTML = "";
      if (els.evoSections) {
        els.evoSections.innerHTML = "";
        els.evoSections.hidden = true;
      }
      els.pager.hidden = true;
      setStatus(
        STATUS_KIND.EMPTY,
        state.filterDuplicates
          ? state.query
            ? "No duplicate Pokémon match <strong>" + escapeHtml(state.query) + "</strong>."
            : "You have no duplicate Pokémon in your collection yet."
          : state.filterEvolvable
          ? state.query
            ? "No evolvable cards match <strong>" + escapeHtml(state.query) + "</strong>."
            : "You have no evolvable cards in your collection."
          : state.filterNonEvolvable
          ? state.query
            ? "No non-evolvable cards match <strong>" + escapeHtml(state.query) + "</strong>."
            : "You have no non-evolvable cards in your collection."
          : state.filterFavorited
            ? state.query
              ? "No favorited copies match <strong>" + escapeHtml(state.query) + "</strong>."
              : "You have no favorited copies yet. Star a card in your collection or with <code>cv c</code> in Discord."
            : state.query
              ? "No cards in your collection match <strong>" +
                  escapeHtml(state.query) +
                  "</strong>."
              : "Your collection is empty. Run <code>ppcd</code> in Discord to claim your first card."
      );
      return;
    }
    if (state.total === 0 && hasEvolutionSections()) {
      els.grid.innerHTML = "";
      els.pager.hidden = true;
      setStatus(
        STATUS_KIND.INFO,
        'No cards match <strong>"' +
          escapeHtml(state.query) +
          '</strong> directly — see evolution line copies below.'
      );
      renderEvolutionSections();
      return;
    }
    setStatus(
      STATUS_KIND.INFO,
      "<strong>" +
        state.total.toLocaleString() +
        "</strong> card" +
        (state.total === 1 ? "" : "s") +
        (state.filterFavorited ? " (favorites)" : "") +
        (state.filterEvolvable ? " (evolvable)" : "") +
        (state.filterNonEvolvable ? " (non-evolvable)" : "") +
        (state.filterDuplicates ? " (duplicates)" : "") +
        (state.query ? ' matching "' + escapeHtml(state.query) + '"' : "") +
        " · sorted by <strong>" +
        sortLabel(state.sort) +
        "</strong>"
    );

    revokeTileSlabUrls();
    els.grid.innerHTML = "";
    if (state.filterDuplicates) {
      var groups = groupItemsByDex(state.items);
      var wrap = document.createDocumentFragment();
      groups.forEach(function (g) {
        var block = document.createElement("section");
        block.className = "collection-evo-section collection-dup-section";
        var heading = document.createElement("h2");
        heading.className = "collection-evo-heading";
        var dexLabel = g.dex != null ? " · #" + g.dex : "";
        heading.textContent =
          g.label +
          dexLabel +
          " · " +
          g.items.length +
          (g.items.length === 1 ? " copy" : " copies");
        var grid = document.createElement("div");
        grid.className = "card-grid collection-evo-grid";
        g.items.forEach(function (it, idx) {
          grid.appendChild(buildTile(it, idx));
        });
        block.appendChild(heading);
        block.appendChild(grid);
        wrap.appendChild(block);
      });
      els.grid.classList.add("collection-dup-groups");
      els.grid.appendChild(wrap);
    } else {
      els.grid.classList.remove("collection-dup-groups");
      var frag = document.createDocumentFragment();
      state.items.forEach(function (it, idx) {
        frag.appendChild(buildTile(it, idx));
      });
      els.grid.appendChild(frag);
    }

    var pages = Math.max(1, Math.ceil(state.total / state.pageSize));
    els.pagerInfo.textContent = "Page " + state.page + " of " + pages;
    els.pagerPrev.disabled = state.page <= 1;
    els.pagerNext.disabled = state.page >= pages;
    els.pager.hidden = pages <= 1;
    renderEvolutionSections();
  }

  function sortLabel(sort) {
    switch (sort) {
      case "rarity":
        return "rarity";
      case "hp":
        return "HP";
      case "damage":
        return "damage";
      default:
        return "newest";
    }
  }

  function renderFavoriteBtn(item) {
    if (!els.modalFavoriteBtn) return;
    var fav = !!(item && item.is_favorite);
    els.modalFavoriteBtn.hidden = false;
    els.modalFavoriteBtn.disabled = !!state.favoriteInFlight;
    els.modalFavoriteBtn.textContent = fav ? "⭐" : "☆";
    els.modalFavoriteBtn.classList.toggle("is-favorite", fav);
    els.modalFavoriteBtn.setAttribute(
      "aria-label",
      fav ? "Unfavorite this copy" : "Favorite this copy"
    );
    els.modalFavoriteBtn.title = fav
      ? "Favorited — sell, trade, and auction are disabled"
      : "Favorite — locks sell, trade, and auction";
  }

  function toggleFavorite() {
    var item = state.modalItem;
    if (!item || !item.public_id || state.favoriteInFlight) return;
    state.favoriteInFlight = true;
    renderFavoriteBtn(item);
    apiFetch("/api/me/cards/" + encodeURIComponent(item.public_id) + "/favorite", {
      method: "POST",
    })
      .then(function (r) {
        return r.json().then(function (data) {
          return { ok: r.ok, data: data };
        });
      })
      .then(function (res) {
        state.favoriteInFlight = false;
        var d = res.data || {};
        if (res.ok && d.ok && d.card) {
          state.modalItem = d.card;
          applyModalCardFields(d.card);
          renderFavoriteBtn(d.card);
          renderSellUi(d.card);
          renderEvolutionUi(d.card);
          renderGradeUi(d.card);
          if (
            state.bulkMode &&
            d.card.is_favorite &&
            state.bulkSelected &&
            state.bulkSelected[d.card.public_id]
          ) {
            delete state.bulkSelected[d.card.public_id];
            scheduleBulkQuote();
          }
          loadCollection(false);
          return;
        }
        renderFavoriteBtn(state.modalItem);
      })
      .catch(function () {
        state.favoriteInFlight = false;
        renderFavoriteBtn(state.modalItem);
      });
  }


  function buildTile(item, idx) {
    var card = item.card || {};
    var rarity = card.rarity || {};
    var publicId = item.public_id || "";

    var wrap = document.createElement("div");
    wrap.className = "card-tile-wrap";
    if (state.bulkMode && state.bulkSelected && state.bulkSelected[publicId]) {
      wrap.classList.add("is-bulk-selected");
    }
    if (state.bulkMode && !isItemSellable(item)) {
      wrap.classList.add("is-bulk-unsellable");
    }

    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "card-tile " + rarityClassFor(rarity.display_name);
    btn.dataset.idx = String(idx);

    var img = document.createElement("img");
    img.loading = "lazy";
    img.decoding = "async";
    img.alt = card.name || "Card";
    img.className = "card-tile-img";

    var meta = document.createElement("div");
    meta.className = "card-tile-meta";
    meta.innerHTML =
      '<span class="card-tile-name">' +
      escapeHtml(card.name) +
      "</span>" +
      '<span class="card-tile-sub">' +
      escapeHtml((card.set_name || card.set_code || "") + " · #" + (card.collector_number || "?")) +
      "</span>";

    var statsRow = document.createElement("div");
    statsRow.className = "card-tile-stats";
    var stats = [];
    if (card.hp) stats.push('<span title="HP">❤ ' + escapeHtml(card.hp) + "</span>");
    if (card.max_damage) stats.push('<span title="Max damage">⚡ ' + escapeHtml(card.max_damage) + "</span>");
    if (rarity.display_name) {
      stats.push(
        '<span class="card-tile-rarity" title="Rarity">' +
          escapeHtml(rarity.display_name) +
          "</span>"
      );
    }
    statsRow.innerHTML = stats.join("");

    if (!applyAssemblyCompositeTile(btn, item)) {
      setTileCardImage(img, item);
      btn.appendChild(img);
    }
    btn.appendChild(meta);
    var meter = buildCraftUsesMeter(craftUsesForItem(item));
    if (meter) btn.appendChild(meter);
    btn.appendChild(statsRow);
    btn.addEventListener("click", function () {
      if (state.bulkMode) {
        toggleBulkSelected(item);
        return;
      }
      openModal(item);
    });

    if (state.bulkMode) {
      var chk = document.createElement("span");
      chk.className =
        "card-tile-bulk-check" + (state.bulkSelected[publicId] ? " is-on" : "");
      chk.textContent = state.bulkSelected[publicId] ? "✓" : "+";
      wrap.appendChild(chk);
    }

    if (item.is_favorite) {
      var favBadge = document.createElement("span");
      favBadge.className = "card-tile-fav";
      favBadge.textContent = "⭐";
      favBadge.title = "Favorited";
      wrap.appendChild(favBadge);
    }
    if (item.grading && item.grading.grade != null) {
      var gradeBadge = document.createElement("span");
      gradeBadge.className = "card-tile-grade";
      gradeBadge.textContent = String(item.grading.grade);
      gradeBadge.title = item.grading.grade_label || "Graded";
      wrap.appendChild(gradeBadge);
    }

    var copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "card-tile-copy";
    copyBtn.textContent = "Copy ID";
    copyBtn.setAttribute("aria-label", "Copy Card ID");
    copyBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      e.preventDefault();
      copyCardId(publicId, copyBtn);
    });

    wrap.appendChild(btn);
    wrap.appendChild(copyBtn);
    return wrap;
  }

  function syncBulkSellButton() {
    if (!els.btnBulkSell) return;
    var on = !!state.bulkMode;
    els.btnBulkSell.classList.toggle("is-active", on);
    els.btnBulkSell.setAttribute("aria-pressed", on ? "true" : "false");
    els.btnBulkSell.textContent = on ? "Exit bulk sell" : "Bulk sell";
  }

  function forEachVisibleItem(fn) {
    if (!state.items || !state.items.length) return;
    if (state.filterDuplicates) {
      groupItemsByDex(state.items).forEach(function (g) {
        g.items.forEach(fn);
      });
    } else {
      state.items.forEach(fn);
    }
  }

  function isItemSellable(item) {
    if (!item || !item.public_id) return false;
    if (item.is_favorite) return false;
    var sell = item.sell;
    if (!sell) return true;
    return sell.can_sell !== false;
  }

  function setBulkBarOpen(open) {
    if (!els.bulkBar) return;
    var on = !!open;
    els.bulkBar.classList.toggle("is-open", on);
    els.bulkBar.setAttribute("aria-hidden", on ? "false" : "true");
    els.bulkBar.removeAttribute("hidden");
  }

  function sellableCountOnPage() {
    var n = 0;
    forEachVisibleItem(function (it) {
      if (isItemSellable(it)) n += 1;
    });
    return n;
  }

  function setBulkMode(on) {
    state.bulkMode = !!on;
    syncBulkSellButton();
    if (!state.bulkMode) {
      state.bulkSelected = {};
      state.bulkQuote = null;
      setBulkBarOpen(false);
    } else {
      setBulkBarOpen(true);
      renderBulkBar();
    }
    renderCollection();
  }

  function selectAllSellableOnPage() {
    if (!state.bulkMode) setBulkMode(true);
    if (!state.bulkSelected) state.bulkSelected = {};
    var added = 0;
    forEachVisibleItem(function (it) {
      if (!isItemSellable(it) || !it.public_id) return;
      if (!state.bulkSelected[it.public_id]) added += 1;
      state.bulkSelected[it.public_id] = true;
    });
    scheduleBulkQuote();
    renderCollection();
    if (els.bulkHint && added === 0 && sellableCountOnPage() === 0) {
      els.bulkHint.textContent = "No sellable cards on this page.";
    }
  }

  function clearBulkSelection() {
    state.bulkSelected = {};
    state.bulkQuote = null;
    if (state.bulkQuoteInFlight) {
      try {
        state.bulkQuoteInFlight.abort();
      } catch (_) {}
      state.bulkQuoteInFlight = null;
    }
    renderBulkBar();
    renderCollection();
  }

  function bulkSelectedIds() {
    var out = [];
    var m = state.bulkSelected || {};
    Object.keys(m).forEach(function (k) {
      if (m[k]) out.push(k);
    });
    return out;
  }

  function renderBulkBar() {
    if (!els.bulkBar) return;
    if (!state.bulkMode) {
      setBulkBarOpen(false);
      return;
    }
    setBulkBarOpen(true);
    var ids = bulkSelectedIds();
    if (els.bulkCount) {
      els.bulkCount.textContent = ids.length + " selected";
    }
    var total = (state.bulkQuote && state.bulkQuote.total_pokedollars) || 0;
    if (els.bulkTotal) els.bulkTotal.textContent = "Total: " + fmtPokedollars(total);
    var sellable = sellableCountOnPage();
    var hint = "";
    if (!ids.length) {
      hint =
        sellable > 0
          ? sellable +
            " sellable on this page — use Select sellable on page or click tiles."
          : "No sellable cards on this page.";
    } else if (state.bulkQuote && state.bulkQuote.confirm_required) {
      hint = "High tier cards selected — confirmation required.";
    } else {
      hint = "Review and confirm before selling.";
    }
    if (els.bulkHint) els.bulkHint.textContent = hint;
    if (els.bulkNext) els.bulkNext.disabled = ids.length === 0 || !state.bulkQuote;
    if (els.bulkSelectPage) {
      els.bulkSelectPage.disabled = sellable === 0;
    }
    if (els.bulkClearSelection) {
      els.bulkClearSelection.disabled = ids.length === 0;
    }
  }

  function scheduleBulkQuote() {
    if (!state.bulkMode) return;
    if (state.bulkQuoteDebounce) clearTimeout(state.bulkQuoteDebounce);
    state.bulkQuoteDebounce = setTimeout(function () {
      state.bulkQuoteDebounce = 0;
      loadBulkQuote();
    }, 150);
  }

  function loadBulkQuote() {
    var ids = bulkSelectedIds();
    state.bulkQuote = null;
    renderBulkBar();
    if (!ids.length) return;
    if (state.bulkQuoteInFlight) state.bulkQuoteInFlight.abort();
    var ctrl = new AbortController();
    state.bulkQuoteInFlight = ctrl;
    apiFetch("/api/me/cards/bulk-sell/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ public_ids: ids }),
      signal: ctrl.signal,
    })
      .then(function (r) {
        return r
          .json()
          .catch(function () {
            return {};
          })
          .then(function (d) {
            return { ok: r.ok, status: r.status, data: d };
          });
      })
      .then(function (res) {
        if (state.bulkQuoteInFlight !== ctrl) return;
        state.bulkQuoteInFlight = null;
        if (!res.ok) return;
        state.bulkQuote = res.data || null;
        renderBulkBar();
      })
      .catch(function (err) {
        if (err && err.name === "AbortError") return;
        if (state.bulkQuoteInFlight === ctrl) state.bulkQuoteInFlight = null;
      });
  }

  function toggleBulkSelected(item) {
    if (!item) return;
    var pid = item.public_id;
    if (!pid) return;
    if (!isItemSellable(item)) {
      var reason = item.is_favorite
        ? "Unfavorite this copy before selling it."
        : (item.sell && item.sell.blocked_reason) || "This copy cannot be sold.";
      if (els.bulkHint) els.bulkHint.textContent = String(reason).replace(/\*\*/g, "");
      return;
    }
    if (!state.bulkSelected) state.bulkSelected = {};
    state.bulkSelected[pid] = !state.bulkSelected[pid];
    if (!state.bulkSelected[pid]) delete state.bulkSelected[pid];
    scheduleBulkQuote();
    renderCollection();
  }

  function bulkSellConfirmText(ids, quote) {
    var total = (quote && quote.total_pokedollars) || 0;
    var warn = quote && quote.confirm_required ? "\n\nSome selected cards are high tier." : "";
    return "Sell " + ids.length + " card" + (ids.length === 1 ? "" : "s") + " for " + fmtPokedollars(total) + "?" + warn;
  }

  function commitBulkSell() {
    var ids = bulkSelectedIds();
    if (!ids.length || !state.bulkQuote) return;
    var items = [];
    var itemMap = {};
    (state.bulkQuote.items || []).forEach(function (it) {
      if (it && it.public_id) itemMap[it.public_id] = it;
    });
    ids.forEach(function (pid) {
      var q = itemMap[pid] && itemMap[pid].quote_pokedollars;
      if (q == null) return;
      items.push({ public_id: pid, expected_payout: q });
    });
    if (!items.length) return;
    var confirmRare = !!(state.bulkQuote && state.bulkQuote.confirm_required);
    apiFetch("/api/me/cards/bulk-sell", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: items, confirm_rare: confirmRare }),
    })
      .then(function (r) {
        return r
          .json()
          .catch(function () {
            return {};
          })
          .then(function (d) {
            return { ok: r.ok, status: r.status, data: d };
          });
      })
      .then(function (res) {
        var d = res.data || {};
        if (res.ok && d.ok) {
          if (window.PokePonApp && window.PokePonApp.notifyBalancesChanged) {
            window.PokePonApp.notifyBalancesChanged();
          }
          setBulkMode(false);
          loadCollection(false);
          return;
        }
        scheduleBulkQuote();
      })
      .catch(function () {});
  }

  function isEvoFocusOpen() {
    var evoModal = document.getElementById("evo-focus-modal");
    return !!(evoModal && !evoModal.hidden);
  }

  function updateModalFooter() {
    if (!els.modalFooter) return;
    var sellOn = els.modalSellSection && !els.modalSellSection.hidden;
    var evoOn = els.modalEvoFooter && !els.modalEvoFooter.hidden;
    var gradeOn = els.modalGradeSection && !els.modalGradeSection.hidden;
    els.modalFooter.hidden = !sellOn && !evoOn && !gradeOn;
  }

  function revokeModalSlabUrl() {
    if (state.modalSlabObjectUrl) {
      try {
        URL.revokeObjectURL(state.modalSlabObjectUrl);
      } catch (_) {}
      state.modalSlabObjectUrl = null;
    }
  }

  function revokeTileSlabUrls() {
    var cache = state.tileSlabUrls || {};
    Object.keys(cache).forEach(function (pid) {
      try {
        URL.revokeObjectURL(cache[pid]);
      } catch (_) {}
    });
    state.tileSlabUrls = {};
  }

  function slabPathForItem(item) {
    var g = item && item.grading;
    if (!g || g.grade == null || !item.public_id) return null;
    return g.slab_url || "/api/me/cards/" + encodeURIComponent(item.public_id) + "/slab";
  }

  function fetchSlabBlobUrl(path) {
    return apiFetch(path)
      .then(function (r) {
        if (!r.ok) throw new Error("slab");
        return r.blob();
      })
      .then(function (blob) {
        return URL.createObjectURL(blob);
      });
  }

  function createAssemblyCompositeGrid(asm, preferLarge) {
    var layout = asm.layout || "quad";
    var grid = document.createElement("div");
    grid.className =
      "card-tile-assembly modal-assembly-composite layout-" +
      layout +
      " orientation-" +
      (asm.orientation || "portrait");
    asm.slots.forEach(function (slot) {
      var cell = document.createElement("span");
      cell.className = "card-tile-assembly-cell";
      cell.style.gridColumn = String((slot.grid_col || 0) + 1);
      cell.style.gridRow = String((slot.grid_row || 0) + 1);
      var cellImg = document.createElement("img");
      cellImg.alt = "";
      cellImg.loading = "lazy";
      cellImg.decoding = "async";
      cellImg.src = preferLarge
        ? slot.image_large_url || slot.image_small_url || ""
        : slot.image_small_url || slot.image_large_url || "";
      cellImg.style.transform = "rotate(" + (slot.rotation_deg || 0) + "deg)";
      cell.appendChild(cellImg);
      grid.appendChild(cell);
    });
    return grid;
  }

  function clearModalAssemblyComposite() {
    if (!els.modalImg || !els.modalImg.parentElement) return;
    var existing = els.modalImg.parentElement.querySelector(".modal-assembly-composite");
    if (existing) existing.remove();
    els.modalImg.hidden = false;
  }

  function applyAssemblyCompositeModal(item) {
    var asm = item && item.assembly;
    if (!asm || asm.role !== "result" || !Array.isArray(asm.slots) || !asm.slots.length) {
      return false;
    }
    clearModalAssemblyComposite();
    var grid = createAssemblyCompositeGrid(asm, true);
    els.modalImg.hidden = true;
    els.modalImg.removeAttribute("src");
    els.modalImg.classList.remove("modal-img--slab");
    els.modalImg.parentElement.insertBefore(grid, els.modalImg);
    return true;
  }

  function setModalCardImage(item) {
    revokeModalSlabUrl();
    if (applyAssemblyCompositeModal(item)) return;
    clearModalAssemblyComposite();
    var card = (item && item.card) || {};
    var slabPath = slabPathForItem(item);
    if (slabPath) {
      fetchSlabBlobUrl(slabPath)
        .then(function (url) {
          state.modalSlabObjectUrl = url;
          els.modalImg.src = url;
          els.modalImg.classList.add("modal-img--slab");
        })
        .catch(function () {
          els.modalImg.classList.remove("modal-img--slab");
          els.modalImg.src = card.image_large_url || card.image_small_url || "";
        });
    } else {
      els.modalImg.classList.remove("modal-img--slab");
      els.modalImg.src = card.image_large_url || card.image_small_url || "";
    }
  }

  function applyAssemblyCompositeTile(btn, item) {
    var asm = item && item.assembly;
    if (!asm || asm.role !== "result" || !Array.isArray(asm.slots) || !asm.slots.length) {
      return false;
    }
    var grid = createAssemblyCompositeGrid(asm, false);
    var existing = btn.querySelector(".card-tile-img");
    if (existing) existing.remove();
    var oldGrid = btn.querySelector(".card-tile-assembly");
    if (oldGrid) oldGrid.remove();
    btn.insertBefore(grid, btn.firstChild);
    return true;
  }

  function setTileCardImage(img, item) {
    var card = (item && item.card) || {};
    var slabPath = slabPathForItem(item);
    if (!slabPath) {
      img.classList.remove("card-tile-img--slab");
      img.src = card.image_small_url || card.image_large_url || "";
      return;
    }
    var pid = item.public_id;
    var cache = state.tileSlabUrls || {};
    if (cache[pid]) {
      img.classList.add("card-tile-img--slab");
      img.src = cache[pid];
      return;
    }
    img.classList.remove("card-tile-img--slab");
    img.src = card.image_small_url || card.image_large_url || "";
    fetchSlabBlobUrl(slabPath)
      .then(function (url) {
        if (!state.tileSlabUrls) state.tileSlabUrls = {};
        state.tileSlabUrls[pid] = url;
        if (img.isConnected) {
          img.classList.add("card-tile-img--slab");
          img.src = url;
        }
      })
      .catch(function () {});
  }

  function renderGradeUi(item) {
    if (!els.modalGradeSection) return;
    var g = item && item.grading;
    els.modalGradeSection.hidden = false;
    if (els.modalGradeMsg) {
      els.modalGradeMsg.hidden = true;
      els.modalGradeMsg.textContent = "";
      els.modalGradeMsg.className = "modal-grade-msg";
    }
    if (!g) {
      if (els.modalGradeSummary) els.modalGradeSummary.textContent = "Grading unavailable.";
      if (els.modalGradeRollBtn) els.modalGradeRollBtn.disabled = true;
      if (els.modalGradeRemoveBtn) els.modalGradeRemoveBtn.hidden = true;
      updateModalFooter();
      return;
    }
    var lines = [];
    if (g.grade != null) {
      lines.push(
        "Current grade: <strong>" +
          escapeHtml(String(g.grade)) +
          "</strong>" +
          (g.grade_label ? " — " + escapeHtml(g.grade_label) : "")
      );
    } else {
      lines.push("Not graded yet.");
    }
    if (g.copy_index != null && g.total_copies != null) {
      lines.push(
        "Global copy rank: <strong>#" +
          escapeHtml(String(g.copy_index)) +
          "</strong> of <strong>" +
          escapeHtml(String(g.total_copies)) +
          "</strong> for this printing."
      );
    }
    if (els.modalGradeSummary) els.modalGradeSummary.innerHTML = lines.join("<br>");
    var cost = g.crystal_cost != null ? g.crystal_cost : 15;
    if (els.modalGradeRollBtn) {
      els.modalGradeRollBtn.disabled = !!state.gradeInFlight;
      els.modalGradeRollBtn.textContent =
        (g.grade != null ? "Reroll grade (" : "Roll grade (") + cost + " 💎)";
    }
    if (els.modalGradeRemoveBtn) {
      els.modalGradeRemoveBtn.hidden = g.grade == null;
      els.modalGradeRemoveBtn.disabled = !!state.gradeInFlight;
    }
    updateModalFooter();
  }

  function rollGradeAction() {
    var item = state.modalItem;
    if (!item || !item.public_id || state.gradeInFlight) return;
    state.gradeInFlight = true;
    renderGradeUi(item);
    apiFetch("/api/me/cards/" + encodeURIComponent(item.public_id) + "/grade", { method: "POST" })
      .then(function (r) {
        return r.json().then(function (data) {
          return { ok: r.ok, data: data };
        });
      })
      .then(function (res) {
        state.gradeInFlight = false;
        var d = res.data || {};
        if (res.ok && d.ok && d.card) {
          state.modalItem = d.card;
          applyModalCardFields(d.card);
          renderGradeUi(d.card);
          renderSellUi(d.card);
          renderEvolutionUi(d.card);
          renderFavoriteBtn(d.card);
          loadCollection(false);
          return;
        }
        if (els.modalGradeMsg) {
          els.modalGradeMsg.hidden = false;
          els.modalGradeMsg.className = "modal-grade-msg is-error";
          els.modalGradeMsg.textContent = plainDiscordMsg(
            d.message || d.error || "Could not grade."
          );
        }
        renderGradeUi(state.modalItem);
      })
      .catch(function () {
        state.gradeInFlight = false;
        if (els.modalGradeMsg) {
          els.modalGradeMsg.hidden = false;
          els.modalGradeMsg.className = "modal-grade-msg is-error";
          els.modalGradeMsg.textContent = "Network error — try again.";
        }
        renderGradeUi(state.modalItem);
      });
  }

  function removeGradeAction() {
    var item = state.modalItem;
    if (!item || !item.public_id || state.gradeInFlight) return;
    state.gradeInFlight = true;
    renderGradeUi(item);
    apiFetch("/api/me/cards/" + encodeURIComponent(item.public_id) + "/grade/remove", {
      method: "POST",
    })
      .then(function (r) {
        return r.json().then(function (data) {
          return { ok: r.ok, data: data };
        });
      })
      .then(function (res) {
        state.gradeInFlight = false;
        var d = res.data || {};
        if (res.ok && d.ok && d.card) {
          state.modalItem = d.card;
          applyModalCardFields(d.card);
          renderGradeUi(d.card);
          renderSellUi(d.card);
          renderEvolutionUi(d.card);
          renderFavoriteBtn(d.card);
          loadCollection(false);
          return;
        }
        if (els.modalGradeMsg) {
          els.modalGradeMsg.hidden = false;
          els.modalGradeMsg.className = "modal-grade-msg is-error";
          els.modalGradeMsg.textContent = plainDiscordMsg(
            d.message || d.error || "Could not remove grade."
          );
        }
        renderGradeUi(state.modalItem);
      })
      .catch(function () {
        state.gradeInFlight = false;
        renderGradeUi(state.modalItem);
      });
  }

  function updateModalActionBack() {
    if (!els.modalSellBack) return;
    if (isEvoFocusOpen()) {
      els.modalSellBack.hidden = false;
      els.modalSellBack.textContent = "Back";
      return;
    }
    var sell = state.modalItem && state.modalItem.sell;
    var sellConfirm = !!(sell && sell.needs_confirm && state.sellUiStep === 1);
    if (!sellConfirm) {
      els.modalSellBack.hidden = true;
    }
  }

  function renderSellUi(item) {
    if (!els.modalSellSection) return;
    var sell = item && item.sell;
    els.modalSellMsg.hidden = true;
    els.modalSellMsg.textContent = "";
    els.modalSellMsg.className = "modal-sell-msg";

    if (!sell) {
      els.modalSellSection.hidden = true;
      updateModalFooter();
      return;
    }

    els.modalSellSection.hidden = false;
    els.modalSellBlock.hidden = true;
    els.modalSellBlock.textContent = "";
    els.modalSellWarn.hidden = true;
    els.modalSellWarn.textContent = "";

    if (sell.blocked_reason) {
      els.modalSellQuote.textContent = "";
      els.modalSellBlock.hidden = false;
      els.modalSellBlock.textContent = plainDiscordMsg(sell.blocked_reason);
      els.modalSellBtn.disabled = true;
      els.modalSellBtn.textContent = "Cannot sell";
      els.modalSellBack.hidden = true;
      state.sellUiStep = 0;
      updateModalFooter();
      return;
    }

    if (sell.quote_pokedollars == null) {
      if (sell.can_sell) {
        els.modalSellQuote.textContent = "Loading sell quote…";
        els.modalSellBtn.disabled = true;
        els.modalSellBtn.textContent = "Sell to shop";
        els.modalSellBack.hidden = true;
        state.sellUiStep = 0;
        updateModalFooter();
        return;
      }
      els.modalSellQuote.textContent = "Sell quote unavailable (missing rarity data).";
      els.modalSellBtn.disabled = true;
      els.modalSellBtn.textContent = "Cannot sell";
      els.modalSellBack.hidden = true;
      state.sellUiStep = 0;
      updateModalFooter();
      return;
    }

    var quote = sell.quote_pokedollars;
    var gradeBonus =
      sell.grade_bonus_percent > 0 && sell.base_quote_pokedollars != null
        ? " (+" + sell.grade_bonus_percent + "% graded bonus)"
        : "";
    var need = !!sell.needs_confirm;
    if (need && state.sellUiStep === 1) {
      els.modalSellQuote.textContent = "Sale amount: " + fmtPokedollars(quote) + gradeBonus;
      els.modalSellWarn.hidden = false;
      els.modalSellWarn.innerHTML =
        "High-tier printing — selling is permanent. You will receive " +
        "<strong>" +
        escapeHtml(fmtPokedollars(quote)) +
        "</strong>.";
      if (!state.sellInFlight) {
        els.modalSellBtn.disabled = false;
        els.modalSellBtn.textContent = "Confirm sale";
        els.modalSellBack.hidden = false;
      } else {
        els.modalSellBtn.disabled = true;
        els.modalSellBtn.textContent = "Selling…";
        els.modalSellBack.hidden = true;
      }
      updateModalFooter();
      updateModalActionBack();
      return;
    }

    els.modalSellQuote.textContent = "Shop buyout: " + fmtPokedollars(quote) + gradeBonus;
    els.modalSellBtn.disabled = state.sellInFlight || !sell.can_sell;
    if (state.sellInFlight) {
      els.modalSellBtn.textContent = "Selling…";
    } else if (need) {
      els.modalSellBtn.textContent = "Review sale…";
    } else {
      els.modalSellBtn.textContent = "Sell for " + fmtPokedollars(quote);
    }
    els.modalSellBack.hidden = true;
    updateModalFooter();
    updateModalActionBack();
  }

  function updateEvoButton(item) {
    if (!els.modalEvoBtn) return;
    var evo = item && item.evolution;
    if (!evo || !evo.can_evolve || state.evoInFlight) {
      els.modalEvoBtn.disabled = true;
      if (state.evoInFlight) els.modalEvoBtn.textContent = "Evolving…";
      return;
    }
    var targets = evo.targets || [];
    var sel = state.evoSelectedTargetId;
    var picked = null;
    targets.forEach(function (t) {
      if (t.card_id === sel) picked = t;
    });
    if (!picked) {
      els.modalEvoBtn.disabled = true;
      els.modalEvoBtn.textContent = targets.length > 1 ? "Pick an evolution" : "Evolve";
      return;
    }
    els.modalEvoBtn.disabled = false;
    els.modalEvoBtn.textContent =
      picked.cost_pokedollars != null
        ? "Evolve for " + fmtPokedollars(picked.cost_pokedollars)
        : "Evolve into " + (picked.name || "card");
  }

  function renderEvolutionUi(item, opts) {
    opts = opts || {};
    var readonly = !!opts.readonly;
    var evo = item && item.evolution;
    state.evoSelectedTargetId = null;
    if (els.modalEvoMsg) {
      els.modalEvoMsg.hidden = true;
      els.modalEvoMsg.textContent = "";
      els.modalEvoMsg.className = "modal-evolve-msg";
    }
    if (!els.modalEvolveSection || !evo || !evo.targets || !evo.targets.length) {
      if (els.modalEvolveSection) els.modalEvolveSection.hidden = true;
      if (els.modalEvoFooter) els.modalEvoFooter.hidden = true;
      updateModalFooter();
      return;
    }
    els.modalEvolveSection.hidden = false;
    if (els.modalEvoStages) {
      var stages = Number(evo.evolution_stages) || 0;
      els.modalEvoStages.textContent = stages
        ? "Times evolved on this copy: " + stages
        : "Not evolved yet on this copy.";
    }
    if (els.modalEvoBlock) {
      if (evo.blocked_reason) {
        els.modalEvoBlock.hidden = false;
        els.modalEvoBlock.textContent = plainDiscordMsg(evo.blocked_reason);
      } else {
        els.modalEvoBlock.hidden = true;
        els.modalEvoBlock.textContent = "";
      }
    }
    if (els.modalEvoTargets && window.PokeponEvoFocus) {
      PokeponEvoFocus.renderTargetRows(els.modalEvoTargets, evo.targets, {
        readonly: readonly,
        canEvolve: evo.can_evolve,
        selectedId: state.evoSelectedTargetId,
        fmtCost: fmtPokedollars,
        onSelect: function (cardId) {
          state.evoSelectedTargetId = cardId;
          updateEvoButton(state.modalItem);
        },
      });
      if (!readonly && evo.can_evolve && evo.targets.length === 1) {
        state.evoSelectedTargetId = evo.targets[0].card_id;
        PokeponEvoFocus.syncSelection(els.modalEvoTargets, state.evoSelectedTargetId);
      }
    }
    if (els.modalEvoFooter) {
      els.modalEvoFooter.hidden = readonly || !evo.can_evolve;
    }
    if (els.modalEvoBtn) {
      els.modalEvoBtn.hidden = false;
      updateEvoButton(item);
    }
    updateModalFooter();
    updateModalActionBack();
  }

  function refreshModalCardDetail(item) {
    var pid = item && item.public_id;
    if (!pid || !state.authenticated) return;
    apiFetch("/api/me/cards/" + encodeURIComponent(pid))
      .then(function (r) {
        if (r.status === 401) return null;
        if (!r.ok) return null;
        return r.json();
      })
      .then(function (detail) {
        if (!detail || detail.public_id !== pid) return;
        if (els.modal.hidden) return;
        if (
          !detail.assembly &&
          state.modalItem &&
          state.modalItem.public_id === pid &&
          state.modalItem.assembly
        ) {
          detail.assembly = state.modalItem.assembly;
        }
        state.modalItem = detail;
        renderSellUi(detail);
        renderEvolutionUi(detail);
        renderFavoriteBtn(detail);
        renderGradeUi(detail);
        applyModalCardFields(detail);
      })
      .catch(function () {});
  }

  function applyModalCardFields(item) {
    var card = item.card || {};
    var rarity = card.rarity || {};
    setModalCardImage(item);
    els.modalImg.alt = card.name || "Card";
    els.modalTitle.textContent = card.name || "Card";
    els.modalSet.textContent =
      (card.set_name || card.set_code || "") + " · #" + (card.collector_number || "?");
    els.modalRarity.textContent = rarity.display_name || card.tcg_rarity || "Unknown rarity";
    els.modalRarity.className = "modal-rarity " + rarityClassFor(rarity.display_name);
    els.modalHp.textContent = card.hp ? String(card.hp) : "—";
    els.modalDamage.textContent = card.max_damage ? String(card.max_damage) : "—";
    var types = Array.isArray(card.types) && card.types.length ? card.types.join(" · ") : "—";
    els.modalTypes.textContent = types;
    els.modalPid.textContent = item.public_id || "—";
    if (item.obtained_at) {
      var d = new Date(item.obtained_at);
      var obtainedText =
        "Obtained " + d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
      if (item.auction_obtained_at) {
        var ad = new Date(item.auction_obtained_at);
        obtainedText +=
          "\nWon from auction " + ad.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
      }
      els.modalObtained.textContent = obtainedText;
    } else {
      els.modalObtained.textContent = "";
    }
    var attacks = Array.isArray(card.attacks) ? card.attacks : [];
    if (attacks.length === 0) {
      els.modalAttacksSection.hidden = true;
      els.modalAttacks.innerHTML = "";
    } else {
      els.modalAttacksSection.hidden = false;
      els.modalAttacks.innerHTML = attacks
        .map(function (atk) {
          var name = escapeHtml(atk.name || "Attack");
          var dmg = atk.damage ? '<span class="atk-dmg">' + escapeHtml(atk.damage) + "</span>" : "";
          var cost = Array.isArray(atk.cost) && atk.cost.length
            ? '<span class="atk-cost">' + atk.cost.map(escapeHtml).join(" · ") + "</span>"
            : "";
          var text = atk.text ? '<p class="atk-text">' + escapeHtml(atk.text) + "</p>" : "";
          return (
            "<li>" +
            '<div class="atk-row"><span class="atk-name">' +
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

  // ------- modal --------------------------------------------------------

  function actuallyCloseModal() {
    state.modalItem = null;
    state.sellUiStep = 0;
    state.sellInFlight = false;
    state.evoSelectedTargetId = null;
    state.evoInFlight = false;
    state.favoriteInFlight = false;
    state.gradeInFlight = false;
    revokeModalSlabUrl();
    clearModalAssemblyComposite();
    if (els.modalFavoriteBtn) els.modalFavoriteBtn.hidden = true;
    if (els.modalEvolveSection) els.modalEvolveSection.hidden = true;
    if (els.modalSellSection) els.modalSellSection.hidden = true;
    if (els.modalGradeSection) els.modalGradeSection.hidden = true;
    if (els.modalEvoFooter) els.modalEvoFooter.hidden = true;
    if (els.modalFooter) els.modalFooter.hidden = true;
    els.modal.hidden = true;
    els.modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
  }

  function openModal(item) {
    state.modalItem = item;
    state.sellUiStep = 0;
    state.sellInFlight = false;
    state.evoInFlight = false;
    applyModalCardFields(item);
    renderFavoriteBtn(item);
    renderEvolutionUi(item);
    renderSellUi(item);
    renderGradeUi(item);
    refreshModalCardDetail(item);
    els.modal.hidden = false;
    els.modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    if (!modalHistory.card) {
      modalHistory.card = true;
      history.pushState({ pokepon: "card-modal" }, "");
    }
  }

  function closeModal(skipHistory) {
    if (window.PokeponEvoFocus) PokeponEvoFocus.close(true);
    if (!skipHistory && modalHistory.card) {
      history.back();
      return;
    }
    modalHistory.card = false;
    actuallyCloseModal();
  }

  function handleModalPopstate() {
    var evoModal = document.getElementById("evo-focus-modal");
    if (evoModal && !evoModal.hidden) {
      modalHistory.evo = false;
      if (window.PokeponEvoFocus) PokeponEvoFocus.close(true);
      return;
    }
    if (!els.modal.hidden) {
      modalHistory.card = false;
      actuallyCloseModal();
    }
  }

  // ------- event wiring -------------------------------------------------

  els.btnLogin.addEventListener("click", function () {
    window.location.href = loginUrl();
  });

  els.btnLogout.addEventListener("click", function () {
    clearSessionToken();
    apiFetch("/auth/logout", { method: "POST" }).finally(function () {
      window.location.reload();
    });
  });

  els.search.addEventListener("input", function (e) {
    var value = (e.target.value || "").trim();
    els.searchClear.hidden = value.length === 0;
    clearTimeout(state.searchDebounce);
    state.searchDebounce = setTimeout(function () {
      if (value === state.query) return;
      state.query = value.toLowerCase();
      state.page = 1;
      loadCollection(false);
    }, 200);
  });

  els.searchClear.addEventListener("click", function () {
    els.search.value = "";
    els.searchClear.hidden = true;
    if (state.query !== "") {
      state.query = "";
      state.page = 1;
      loadCollection(false);
    }
    els.search.focus();
  });

  if (els.filterFavoritedBtn) {
    els.filterFavoritedBtn.addEventListener("click", function () {
      state.filterFavorited = !state.filterFavorited;
      var on = state.filterFavorited;
      els.filterFavoritedBtn.classList.toggle("is-active", on);
      els.filterFavoritedBtn.setAttribute("aria-pressed", on ? "true" : "false");
      state.page = 1;
      loadCollection(false);
    });
  }

  function syncEvolvableFilterChips() {
    if (els.filterEvolvableBtn) {
      var evoOn = !!state.filterEvolvable;
      els.filterEvolvableBtn.classList.toggle("is-active", evoOn);
      els.filterEvolvableBtn.setAttribute("aria-pressed", evoOn ? "true" : "false");
    }
    if (els.filterNonEvolvableBtn) {
      var nonOn = !!state.filterNonEvolvable;
      els.filterNonEvolvableBtn.classList.toggle("is-active", nonOn);
      els.filterNonEvolvableBtn.setAttribute("aria-pressed", nonOn ? "true" : "false");
    }
  }

  if (els.filterEvolvableBtn) {
    els.filterEvolvableBtn.addEventListener("click", function () {
      var on = !state.filterEvolvable;
      state.filterEvolvable = on;
      if (on) state.filterNonEvolvable = false;
      syncEvolvableFilterChips();
      state.page = 1;
      loadCollection(false);
    });
  }

  if (els.filterNonEvolvableBtn) {
    els.filterNonEvolvableBtn.addEventListener("click", function () {
      var on = !state.filterNonEvolvable;
      state.filterNonEvolvable = on;
      if (on) state.filterEvolvable = false;
      syncEvolvableFilterChips();
      state.page = 1;
      loadCollection(false);
    });
  }

  if (els.filterDuplicatesBtn) {
    els.filterDuplicatesBtn.addEventListener("click", function () {
      state.filterDuplicates = !state.filterDuplicates;
      var on = state.filterDuplicates;
      els.filterDuplicatesBtn.classList.toggle("is-active", on);
      els.filterDuplicatesBtn.setAttribute("aria-pressed", on ? "true" : "false");
      state.page = 1;
      loadCollection(false);
    });
  }

  if (els.btnBulkSell) {
    els.btnBulkSell.addEventListener("click", function () {
      setBulkMode(!state.bulkMode);
    });
  }

  document.addEventListener("keydown", function (e) {
    if (e.key === "b" && e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey) {
      if (!els.modal.hidden) return;
      var tag = (e.target && e.target.tagName) || "";
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      setBulkMode(!state.bulkMode);
    }
  });

  if (els.bulkCancel) {
    els.bulkCancel.addEventListener("click", function () {
      setBulkMode(false);
    });
  }
  if (els.bulkSelectPage) {
    els.bulkSelectPage.addEventListener("click", function () {
      selectAllSellableOnPage();
    });
  }
  if (els.bulkClearSelection) {
    els.bulkClearSelection.addEventListener("click", function () {
      clearBulkSelection();
    });
  }
  if (els.bulkNext) {
    els.bulkNext.addEventListener("click", function () {
      var ids = bulkSelectedIds();
      if (!ids.length || !state.bulkQuote) return;
      var ok = window.confirm(bulkSellConfirmText(ids, state.bulkQuote));
      if (!ok) return;
      commitBulkSell();
    });
  }

  var craftRoleChips = Array.prototype.slice.call(
    document.querySelectorAll(".chip[data-craft-role]")
  );
  craftRoleChips.forEach(function (chip) {
    chip.addEventListener("click", function () {
      var role = chip.dataset.craftRole || "";
      if (role === state.craftRole) return;
      state.craftRole = role;
      craftRoleChips.forEach(function (c) {
        var on = c === chip;
        c.classList.toggle("is-active", on);
        c.setAttribute("aria-pressed", on ? "true" : "false");
      });
      state.page = 1;
      loadCollection(false);
    });
  });

  els.chips.forEach(function (chip) {
    chip.addEventListener("click", function () {
      var sort = chip.dataset.sort;
      if (!sort || sort === state.sort) return;
      els.chips.forEach(function (c) {
        var on = c === chip;
        c.classList.toggle("is-active", on);
        c.setAttribute("aria-pressed", on ? "true" : "false");
      });
      state.sort = sort;
      state.page = 1;
      loadCollection(false);
    });
    // Default "newest" is the visually-active one on first paint.
    if (chip.dataset.sort === state.sort) {
      chip.classList.add("is-active");
      chip.setAttribute("aria-pressed", "true");
    }
  });

  els.pagerPrev.addEventListener("click", function () {
    if (state.page <= 1) return;
    state.page -= 1;
    loadCollection(true);
  });
  els.pagerNext.addEventListener("click", function () {
    var pages = Math.max(1, Math.ceil(state.total / state.pageSize));
    if (state.page >= pages) return;
    state.page += 1;
    loadCollection(true);
  });

  document.addEventListener("click", function (e) {
    var closeEl = e.target && e.target.closest && e.target.closest("[data-close]");
    if (!closeEl || els.modal.hidden) return;
    if (closeEl.closest("#card-modal")) closeModal();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    var evoModal = document.getElementById("evo-focus-modal");
    if (evoModal && !evoModal.hidden) return;
    if (!els.modal.hidden) closeModal();
  });
  window.addEventListener("popstate", handleModalPopstate);

  if (els.modalCopyId) {
    els.modalCopyId.addEventListener("click", function () {
      copyCardId(els.modalPid.textContent, els.modalCopyId);
    });
  }
  if (els.modalGradeRollBtn) {
    els.modalGradeRollBtn.addEventListener("click", function () {
      rollGradeAction();
    });
  }
  if (els.modalGradeRemoveBtn) {
    els.modalGradeRemoveBtn.addEventListener("click", function () {
      removeGradeAction();
    });
  }

  if (els.modalFavoriteBtn) {
    els.modalFavoriteBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      toggleFavorite();
    });
  }

  function commitSellWithQuote(confirmRare) {
    var item = state.modalItem;
    if (!item || !item.sell || item.sell.quote_pokedollars == null) return;
    var q = item.sell.quote_pokedollars;
    var pid = item.public_id;
    state.sellInFlight = true;
    renderSellUi(item);
    els.modalSellMsg.hidden = true;

    apiFetch("/api/me/cards/" + encodeURIComponent(pid) + "/sell", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        expected_payout: q,
        confirm_rare: !!confirmRare,
      }),
    })
      .then(function (r) {
        return r
          .json()
          .catch(function () {
            return {};
          })
          .then(function (data) {
            return { ok: r.ok, status: r.status, data: data };
          });
      })
      .then(function (res) {
        state.sellInFlight = false;
        var d = res.data || {};

        if (res.ok && d.ok) {
          if (window.PokePonApp && window.PokePonApp.notifyBalancesChanged) {
            window.PokePonApp.notifyBalancesChanged();
          }
          closeModal();
          loadCollection(false);
          return;
        }

        if (res.status === 401) {
          state.authenticated = false;
          showSignedOut();
          renderUnauthenticated();
          closeModal();
          return;
        }

        if (
          res.status === 409 &&
          d.error === "quote_mismatch" &&
          d.quote_pokedollars != null
        ) {
          if (state.modalItem && state.modalItem.sell) {
            state.modalItem.sell.quote_pokedollars = d.quote_pokedollars;
          }
          state.sellUiStep = 0;
          els.modalSellMsg.hidden = false;
          els.modalSellMsg.className = "modal-sell-msg is-error";
          els.modalSellMsg.textContent =
            (d.message || "Price updated.") +
            " New amount: " +
            fmtPokedollars(d.quote_pokedollars);
          if (state.modalItem) renderSellUi(state.modalItem);
          return;
        }

        if (d.error === "confirm_required") {
          state.sellUiStep = 1;
          els.modalSellMsg.hidden = false;
          els.modalSellMsg.className = "modal-sell-msg is-error";
          els.modalSellMsg.textContent =
            d.message || "Please confirm this sale on the step below.";
          if (state.modalItem) renderSellUi(state.modalItem);
          return;
        }

        els.modalSellMsg.hidden = false;
        els.modalSellMsg.className = "modal-sell-msg is-error";
        els.modalSellMsg.textContent =
          plainDiscordMsg(d.reason || d.message || d.error || "Could not sell.");
        if (state.modalItem) renderSellUi(state.modalItem);
      })
      .catch(function () {
        state.sellInFlight = false;
        els.modalSellMsg.hidden = false;
        els.modalSellMsg.className = "modal-sell-msg is-error";
        els.modalSellMsg.textContent = "Network error — try again.";
        if (state.modalItem) renderSellUi(state.modalItem);
      });
  }

  if (els.modalSellBtn) {
    els.modalSellBtn.addEventListener("click", function () {
      var item = state.modalItem;
      if (!item || !item.sell || state.sellInFlight) return;
      var sell = item.sell;
      if (sell.blocked_reason || sell.quote_pokedollars == null) return;

      if (sell.needs_confirm && state.sellUiStep === 0) {
        state.sellUiStep = 1;
        els.modalSellMsg.hidden = true;
        renderSellUi(item);
        return;
      }

      var confirmRare = !!(sell.needs_confirm && state.sellUiStep === 1);
      commitSellWithQuote(confirmRare);
    });
  }

  if (els.modalSellBack) {
    els.modalSellBack.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (isEvoFocusOpen() && window.PokeponEvoFocus) {
        PokeponEvoFocus.close(false);
        updateModalActionBack();
        return;
      }
      state.sellUiStep = 0;
      els.modalSellMsg.hidden = true;
      if (state.modalItem) renderSellUi(state.modalItem);
    });
  }

  function commitEvolve() {
    var item = state.modalItem;
    var evo = item && item.evolution;
    if (!item || !evo || !evo.can_evolve || state.evoInFlight) return;
    var targets = evo.targets || [];
    var picked = null;
    targets.forEach(function (t) {
      if (t.card_id === state.evoSelectedTargetId) picked = t;
    });
    if (!picked || picked.cost_pokedollars == null) return;
    var pid = item.public_id;
    state.evoInFlight = true;
    updateEvoButton(item);
    if (els.modalEvoMsg) els.modalEvoMsg.hidden = true;
    apiFetch("/api/me/cards/" + encodeURIComponent(pid) + "/evolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        target_card_id: picked.card_id,
        expected_cost: picked.cost_pokedollars,
      }),
    })
      .then(function (r) {
        return r.json().then(function (data) {
          return { ok: r.ok, status: r.status, data: data };
        });
      })
      .then(function (res) {
        state.evoInFlight = false;
        var d = res.data || {};
        if (res.ok && d.ok && d.card) {
          state.modalItem = d.card;
          applyModalCardFields(d.card);
          renderEvolutionUi(d.card);
          renderSellUi(d.card);
          if (els.modalEvoMsg) {
            els.modalEvoMsg.hidden = false;
            els.modalEvoMsg.className = "modal-evolve-msg is-ok";
            els.modalEvoMsg.textContent =
              "Evolved " +
              (d.before_name || "card") +
              " → " +
              (d.card_name || d.card.card.name) +
              " for " +
              fmtPokedollars(d.cost_pokedollars) +
              ". Balance: " +
              fmtPokedollars(d.new_balance_pokedollars);
          }
          if (window.PokePonApp && window.PokePonApp.notifyBalancesChanged) {
            window.PokePonApp.notifyBalancesChanged();
          }
          loadCollection(false);
          return;
        }
        if (res.status === 409 && d.cost_pokedollars != null) {
          refreshModalCardDetail(state.modalItem);
          if (els.modalEvoMsg) {
            els.modalEvoMsg.hidden = false;
            els.modalEvoMsg.className = "modal-evolve-msg is-error";
            els.modalEvoMsg.textContent =
              (d.message || "Cost updated.") + " New cost: " + fmtPokedollars(d.cost_pokedollars);
          }
          return;
        }
        if (els.modalEvoMsg) {
          els.modalEvoMsg.hidden = false;
          els.modalEvoMsg.className = "modal-evolve-msg is-error";
          els.modalEvoMsg.textContent = plainDiscordMsg(
            d.reason || d.message || d.error || "Could not evolve."
          );
        }
        updateEvoButton(state.modalItem);
      })
      .catch(function () {
        state.evoInFlight = false;
        if (els.modalEvoMsg) {
          els.modalEvoMsg.hidden = false;
          els.modalEvoMsg.className = "modal-evolve-msg is-error";
          els.modalEvoMsg.textContent = "Network error — try again.";
        }
        updateEvoButton(state.modalItem);
      });
  }

  if (els.modalEvoBtn) {
    els.modalEvoBtn.addEventListener("click", function () {
      commitEvolve();
    });
  }

  // Boot
  if (window.PokeponEvoFocus) {
    PokeponEvoFocus.mount({
      fmtCost: fmtPokedollars,
      rarityClassFor: rarityClassFor,
      onHistoryPush: function () {
        if (!modalHistory.evo) {
          modalHistory.evo = true;
          history.pushState({ pokepon: "evo-focus" }, "");
        }
      },
      onHistoryBack: function () {
        if (modalHistory.evo) {
          modalHistory.evo = false;
          history.back();
        }
      },
      onOpen: function () {
        updateModalActionBack();
      },
      onClose: function () {
        if (state.modalItem) renderSellUi(state.modalItem);
        else updateModalActionBack();
      },
    });
  }
  captureSessionFromFragment();
  setBulkMode(false);
  bootAuth();
})();
