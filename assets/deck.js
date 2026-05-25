/* Deck editor for PokePon — talks to the bot's HTTP API.
 *
 * Flow:
 *   1. Boot auth (same as collection.js).
 *   2. GET /api/me/deck   → render 6 bench slots.
 *   3. GET /api/me/collection?… → picker grid of owned cards.
 *   4. User clicks slot to select, then clicks a collection card to assign.
 *   5. "Save Deck" → PUT /api/me/deck with ordered public_ids.
 */
(function () {
  "use strict";

  var API_BASE = (window.POKEPON_API_BASE || "").replace(/\/+$/, "");
  function api(path) { return API_BASE + path; }

  var SESSION_KEY = "pokepon-session";
  function readSessionToken() {
    try { return localStorage.getItem(SESSION_KEY) || ""; } catch (_) { return ""; }
  }
  function storeSessionToken(token) {
    try { localStorage.setItem(SESSION_KEY, token); } catch (_) {}
  }
  function clearSessionToken() {
    try { localStorage.removeItem(SESSION_KEY); } catch (_) {}
  }
  function captureSessionFromFragment() {
    if (!window.location.hash) return;
    var params = new URLSearchParams(window.location.hash.slice(1));
    var token = params.get("session");
    if (!token) return;
    storeSessionToken(token);
    params.delete("session");
    var nextHash = params.toString();
    var cleanUrl = window.location.pathname + window.location.search + (nextHash ? "#" + nextHash : "");
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
    var headers = Object.assign({}, apiHeaders(), options.headers || {});
    options.headers = headers;
    return fetch(api(path), options);
  }

  var MAX_DECK = 6;

  var els = {
    sidebarUser: document.getElementById("sidebar-user"),
    btnLogin: document.getElementById("btn-login"),
    btnLogout: document.getElementById("btn-logout"),
    userName: document.getElementById("user-name"),
    userAvatar: document.getElementById("user-avatar"),
    sidebarToggle: document.getElementById("sidebar-toggle"),
    sidebar: document.getElementById("sidebar"),

    deckStatus: document.getElementById("deck-status"),
    deckWorkspace: document.getElementById("deck-workspace"),
    bench: document.getElementById("deck-bench"),
    deckFillCount: document.getElementById("deck-fill-count"),
    deckSelectedNum: document.getElementById("deck-selected-num"),
    deckSelectedHint: document.getElementById("deck-selected-hint"),
    btnSave: document.getElementById("btn-save-deck"),
    saveHint: document.getElementById("save-hint"),

    search: document.getElementById("search-input"),
    searchClear: document.getElementById("search-clear"),
    chips: Array.prototype.slice.call(document.querySelectorAll(".chip[data-sort]")),
    pickerStatus: document.getElementById("picker-status"),
    grid: document.getElementById("card-grid"),
    pager: document.getElementById("pager"),
    pagerPrev: document.getElementById("pager-prev"),
    pagerNext: document.getElementById("pager-next"),
    pagerInfo: document.getElementById("pager-info"),
  };

  var state = {
    authenticated: false,
    selectedSlot: 0,
    slots: [],           // array of {public_id, card{…}} or null, length MAX_DECK
    dirty: false,
    saving: false,
    // picker
    page: 1,
    pageSize: 60,
    sort: "newest",
    query: "",
    total: 0,
    items: [],
    inflight: null,
    searchDebounce: 0,
  };

  function initSlots() {
    state.slots = [];
    for (var i = 0; i < MAX_DECK; i++) state.slots.push(null);
  }
  initSlots();

  // ------- helpers -------------------------------------------------------

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
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

  function setDeckStatus(kind, html) {
    if (!html) { els.deckStatus.hidden = true; els.deckStatus.innerHTML = ""; return; }
    els.deckStatus.hidden = false;
    els.deckStatus.className = "deck-status state-" + kind;
    els.deckStatus.innerHTML = html;
  }

  function setPickerStatus(kind, html) {
    if (!html) { els.pickerStatus.hidden = true; els.pickerStatus.innerHTML = ""; return; }
    els.pickerStatus.hidden = false;
    els.pickerStatus.className = "deck-picker-status state-" + kind;
    els.pickerStatus.innerHTML = html;
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
          loadDeck();
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
        setDeckStatus(
          "error",
          'Could not reach the Poké Pon API at <code>' +
            escapeHtml(API_BASE || window.location.origin) +
            "</code>. " +
            "<br><span class=\"muted\">" + escapeHtml(err.message || String(err)) + "</span>"
        );
      });
  }

  function renderUnauthenticated() {
    els.grid.innerHTML = "";
    els.pager.hidden = true;
    if (els.deckWorkspace) els.deckWorkspace.hidden = true;
    document.body.classList.remove("deck-editor-active");
    setDeckStatus("auth", "Sign in with Discord to edit your combat deck. The button is in the side panel.");
  }

  function deckFillCount() {
    var n = 0;
    for (var i = 0; i < MAX_DECK; i++) {
      if (state.slots[i]) n += 1;
    }
    return n;
  }

  function updateDeckMeta() {
    if (els.deckFillCount) {
      var filled = deckFillCount();
      els.deckFillCount.textContent = filled + " / " + MAX_DECK + " card" + (filled === 1 ? "" : "s");
    }
    if (els.deckSelectedNum) {
      els.deckSelectedNum.textContent = String(state.selectedSlot + 1);
    }
    if (els.deckSelectedHint) {
      els.deckSelectedHint.hidden = false;
    }
  }

  function getDeckSlotForPublicId(publicId) {
    for (var i = 0; i < MAX_DECK; i++) {
      if (state.slots[i] && state.slots[i].public_id === publicId) return i;
    }
    return -1;
  }

  var flashTimer = null;
  function flashSlot(idx) {
    var slotEl = els.bench.querySelector('.deck-slot[data-slot="' + idx + '"]');
    if (!slotEl) return;
    slotEl.classList.remove("is-just-added");
    void slotEl.offsetWidth;
    slotEl.classList.add("is-just-added");
    clearTimeout(flashTimer);
    flashTimer = setTimeout(function () {
      slotEl.classList.remove("is-just-added");
    }, 900);
  }

  // ------- deck slots ---------------------------------------------------

  function loadDeck() {
    apiFetch("/api/me/deck")
      .then(function (r) {
        if (r.status === 401) { renderUnauthenticated(); throw new Error("unauthenticated"); }
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (body) {
        var apiSlots = body.slots || [];
        for (var i = 0; i < MAX_DECK; i++) {
          state.slots[i] = apiSlots[i] || null;
        }
        state.dirty = false;
        renderBench();
        updateDeckMeta();
        if (els.deckWorkspace) els.deckWorkspace.hidden = false;
        document.body.classList.add("deck-editor-active");
        setSaveHint("");
      })
      .catch(function (err) {
        if ((err.message || "") === "unauthenticated") return;
        setDeckStatus("error", "Could not load deck: " + escapeHtml(err.message));
      });
  }

  function renderBench() {
    var slotEls = els.bench.querySelectorAll(".deck-slot");
    for (var i = 0; i < slotEls.length; i++) {
      var el = slotEls[i];
      var idx = parseInt(el.dataset.slot, 10);
      var data = state.slots[idx];
      var cardEl = el.querySelector(".deck-slot-card");
      var clearBtn = el.querySelector(".deck-slot-clear");

      el.classList.toggle("is-selected", idx === state.selectedSlot);
      el.classList.toggle("is-filled", !!data);

      if (data && data.card) {
        var c = data.card;
        cardEl.innerHTML =
          '<img class="deck-slot-img" src="' + escapeHtml(c.image_small_url || c.image_large_url || "") +
          '" alt="' + escapeHtml(c.name) + '" />' +
          '<span class="deck-slot-name">' + escapeHtml(c.name) + "</span>" +
          '<span class="deck-slot-hp">' + (c.hp ? "HP " + escapeHtml(c.hp) : "") + "</span>";
        clearBtn.hidden = false;
      } else {
        cardEl.innerHTML = '<span class="deck-slot-empty">Empty</span>';
        clearBtn.hidden = true;
      }
    }
    els.btnSave.disabled = state.saving;
    updateDeckMeta();
  }

  function selectSlot(idx) {
    state.selectedSlot = idx;
    renderBench();
  }

  function clearSlot(idx) {
    if (!state.slots[idx]) return;
    state.slots[idx] = null;
    state.dirty = true;
    renderBench();
    renderCollection();
    setSaveHint("Cleared slot " + (idx + 1) + " — unsaved changes");
  }

  function assignCardToSlot(item) {
    var card = item.card || {};
    if ((card.supertype || "").indexOf("Pok") === -1 || !card.hp) {
      setSaveHint("Only Pokémon with HP can go in a deck slot.");
      return;
    }

    var pid = item.public_id;
    var existing = getDeckSlotForPublicId(pid);
    if (existing >= 0) {
      setSaveHint("That card is already in slot " + (existing + 1) + ".");
      return;
    }

    var targetSlot = state.selectedSlot;
    state.slots[targetSlot] = {
      public_id: pid,
      card: card,
    };
    state.dirty = true;

    // Auto-advance to next empty slot
    for (var j = 1; j < MAX_DECK; j++) {
      var next = (targetSlot + j) % MAX_DECK;
      if (!state.slots[next]) {
        state.selectedSlot = next;
        break;
      }
    }

    renderBench();
    renderCollection();
    flashSlot(targetSlot);
    setSaveHint(
      "Added " + (card.name || "card") + " to slot " + (targetSlot + 1) + " — save when ready"
    );
  }

  function saveDeck() {
    var ids = [];
    for (var i = 0; i < MAX_DECK; i++) {
      if (state.slots[i]) ids.push(state.slots[i].public_id);
    }

    if (ids.length === 0) {
      setSaveHint("Add at least 1 Pokémon to save a deck.");
      return;
    }

    state.saving = true;
    els.btnSave.disabled = true;
    setSaveHint("Saving…");

    apiFetch("/api/me/deck", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ public_ids: ids }),
    })
      .then(function (r) {
        if (r.status === 401) { renderUnauthenticated(); throw new Error("unauthenticated"); }
        return r.json().then(function (body) { return { ok: r.ok, body: body }; });
      })
      .then(function (res) {
        state.saving = false;
        els.btnSave.disabled = false;
        if (!res.ok) {
          setSaveHint(res.body.error || "Save failed.");
          return;
        }
        var apiSlots = res.body.slots || [];
        for (var i = 0; i < MAX_DECK; i++) {
          state.slots[i] = apiSlots[i] || null;
        }
        state.dirty = false;
        renderBench();
        setSaveHint("Saved ✓");
        setTimeout(function () { if (!state.dirty) setSaveHint(""); }, 3000);
      })
      .catch(function (err) {
        state.saving = false;
        els.btnSave.disabled = false;
        if ((err.message || "") === "unauthenticated") return;
        setSaveHint("Error: " + (err.message || String(err)));
      });
  }

  function setSaveHint(text) {
    els.saveHint.textContent = text;
  }

  // ------- collection picker -------------------------------------------

  function buildCollectionPath() {
    var qs = new URLSearchParams();
    qs.set("page", String(state.page));
    qs.set("page_size", String(state.pageSize));
    qs.set("sort", state.sort);
    if (state.query) qs.set("q", state.query);
    return "/api/me/collection?" + qs.toString();
  }

  function loadCollection(scrollTop) {
    if (!state.authenticated) return;
    if (state.inflight) state.inflight.abort();
    var ctrl = new AbortController();
    state.inflight = ctrl;
    setPickerStatus("info", "Loading your collection…");
    els.grid.setAttribute("aria-busy", "true");

    apiFetch(buildCollectionPath(), { signal: ctrl.signal })
      .then(function (r) {
        if (r.status === 401) { renderUnauthenticated(); throw new Error("unauthenticated"); }
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (body) {
        state.inflight = null;
        state.items = Array.isArray(body.items) ? body.items : [];
        state.total = Number(body.total) || 0;
        state.page = Number(body.page) || 1;
        state.pageSize = Number(body.page_size) || state.pageSize;
        renderCollection();
        if (scrollTop) window.scrollTo({ top: 0, behavior: "smooth" });
      })
      .catch(function (err) {
        if (err.name === "AbortError") return;
        if ((err.message || "") === "unauthenticated") return;
        state.inflight = null;
        setPickerStatus("error", "Could not load your collection: " + escapeHtml(err.message));
      })
      .finally(function () { els.grid.removeAttribute("aria-busy"); });
  }

  function isCardInDeck(publicId) {
    return getDeckSlotForPublicId(publicId) >= 0;
  }

  function isEligible(item) {
    var card = item.card || {};
    var st = String(card.supertype || "").trim();
    if (st && st.toLowerCase().indexOf("pok") === -1) return false;
    var hp = Number(card.hp);
    return !isNaN(hp) ? hp > 0 : !!card.hp;
  }

  function renderCollection() {
    if (state.total === 0) {
      els.grid.innerHTML = "";
      els.pager.hidden = true;
      setPickerStatus(
        "empty",
        state.query
          ? "No cards match <strong>" + escapeHtml(state.query) + "</strong>."
          : "Your collection is empty. Drop cards with <code>ppcd</code> in Discord first."
      );
      return;
    }
    setPickerStatus(
      "info",
      "<strong>" + state.total.toLocaleString() + "</strong> card" +
        (state.total === 1 ? "" : "s") +
        (state.query ? ' matching "' + escapeHtml(state.query) + '"' : "") +
        " · sorted by <strong>" + sortLabel(state.sort) + "</strong>" +
        " — tap a Pokémon card to assign it to <strong>slot " + (state.selectedSlot + 1) + "</strong>"
    );

    var frag = document.createDocumentFragment();
    state.items.forEach(function (it, idx) {
      frag.appendChild(buildPickerTile(it, idx));
    });
    els.grid.innerHTML = "";
    els.grid.appendChild(frag);

    var pages = Math.max(1, Math.ceil(state.total / state.pageSize));
    els.pagerInfo.textContent = "Page " + state.page + " of " + pages;
    els.pagerPrev.disabled = state.page <= 1;
    els.pagerNext.disabled = state.page >= pages;
    els.pager.hidden = pages <= 1;
  }

  function buildPickerTile(item, idx) {
    var card = item.card || {};
    var rarity = card.rarity || {};
    var publicId = item.public_id || "";
    var deckSlotIdx = getDeckSlotForPublicId(publicId);
    var inDeck = deckSlotIdx >= 0;
    var eligible = isEligible(item);

    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "card-tile picker-tile " + rarityClassFor(rarity.display_name);
    if (inDeck) btn.classList.add("is-in-deck");
    if (!eligible) btn.classList.add("is-ineligible");
    btn.dataset.idx = String(idx);

    var img = document.createElement("img");
    img.loading = "lazy";
    img.decoding = "async";
    img.src = card.image_small_url || card.image_large_url || "";
    img.alt = card.name || "Card";
    img.className = "card-tile-img";

    var meta = document.createElement("div");
    meta.className = "card-tile-meta";
    meta.innerHTML =
      '<span class="card-tile-name">' + escapeHtml(card.name) + "</span>" +
      '<span class="card-tile-sub">' +
      escapeHtml((card.set_name || card.set_code || "") + " · #" + (card.collector_number || "?")) +
      "</span>";

    var statsRow = document.createElement("div");
    statsRow.className = "card-tile-stats";
    var stats = [];
    if (card.hp) stats.push('<span title="HP">❤ ' + escapeHtml(card.hp) + "</span>");
    if (card.max_damage) stats.push('<span title="Max damage">⚡ ' + escapeHtml(card.max_damage) + "</span>");
    statsRow.innerHTML = stats.join("");

    var badge = document.createElement("span");
    badge.className = "picker-badge";
    if (inDeck) {
      badge.textContent = "Slot " + (deckSlotIdx + 1);
    } else if (!eligible) {
      badge.textContent = "Not eligible";
    }

    btn.appendChild(img);
    btn.appendChild(meta);
    btn.appendChild(statsRow);
    if (badge.textContent) btn.appendChild(badge);

    btn.addEventListener("click", function () {
      if (inDeck || !eligible) return;
      assignCardToSlot(item);
    });

    return btn;
  }

  function sortLabel(sort) {
    switch (sort) {
      case "rarity": return "rarity";
      case "hp": return "HP";
      case "damage": return "damage";
      default: return "newest";
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

  // Slot selection
  els.bench.addEventListener("click", function (e) {
    var slotEl = e.target.closest(".deck-slot");
    if (!slotEl) return;

    var clearBtn = e.target.closest(".deck-slot-clear");
    if (clearBtn) {
      clearSlot(parseInt(clearBtn.dataset.clear, 10));
      return;
    }

    selectSlot(parseInt(slotEl.dataset.slot, 10));
  });

  els.btnSave.addEventListener("click", saveDeck);

  // Search
  els.search.addEventListener("input", function (e) {
    var value = (e.target.value || "").trim();
    els.searchClear.hidden = value.length === 0;
    clearTimeout(state.searchDebounce);
    state.searchDebounce = setTimeout(function () {
      if (value === state.query) return;
      state.query = value;
      state.page = 1;
      loadCollection(false);
    }, 280);
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

  // Sort chips
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
    if (chip.dataset.sort === state.sort) {
      chip.classList.add("is-active");
      chip.setAttribute("aria-pressed", "true");
    }
  });

  // Pagination
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


  // Boot
  captureSessionFromFragment();
  bootAuth();
})();
