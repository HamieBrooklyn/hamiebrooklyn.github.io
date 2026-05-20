/* Crafting — 5 item/energy cards + 1 trainer → random pack tier */
(function () {
  "use strict";

  var API_BASE = (window.POKEPON_API_BASE || "").replace(/\/+$/, "");
  var ITEM_COUNT = 5;
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

  var els = {
    sidebarUser: document.getElementById("sidebar-user"),
    btnLogin: document.getElementById("btn-login"),
    btnLogout: document.getElementById("btn-logout"),
    userName: document.getElementById("user-name"),
    userAvatar: document.getElementById("user-avatar"),
    sidebarToggle: document.getElementById("sidebar-toggle"),
    sidebar: document.getElementById("sidebar"),
    status: document.getElementById("craft-status"),
    workspace: document.getElementById("craft-workspace"),
    nodeMaterials: document.getElementById("craft-node-materials"),
    nodeTrainer: document.getElementById("craft-node-trainer"),
    nodeOutput: document.getElementById("craft-node-output"),
    itemSlots: document.getElementById("craft-item-slots"),
    itemCount: document.getElementById("craft-item-count"),
    trainerSlotWrap: document.getElementById("craft-trainer-slot-wrap"),
    outputSlot: document.getElementById("craft-output-slot"),
    btnCraft: document.getElementById("btn-craft"),
    craftMsg: document.getElementById("craft-msg"),
    pickerTitle: document.getElementById("craft-picker-title"),
    pickerLead: document.getElementById("craft-picker-lead"),
    search: document.getElementById("search-input"),
    searchClear: document.getElementById("search-clear"),
    grid: document.getElementById("card-grid"),
    pickerStatus: document.getElementById("picker-status"),
  };

  var state = {
    authenticated: false,
    pickerRole: "item",
    itemSlots: [],
    trainerEntry: null,
    query: "",
    page: 1,
    pageSize: 60,
    items: [],
    inflight: null,
    crafting: false,
    searchDebounce: 0,
  };

  function rememberItem(item) {
    if (!item || !item.public_id) return;
    state.itemCache = state.itemCache || {};
    state.itemCache[item.public_id] = item;
  }

  function itemIds() {
    return state.itemSlots
      .filter(Boolean)
      .map(function (it) {
        return it.public_id;
      });
  }

  function trainerId() {
    return state.trainerEntry ? state.trainerEntry.public_id : null;
  }

  function itemsFull() {
    return state.itemSlots.filter(Boolean).length === ITEM_COUNT;
  }

  function craftReady() {
    return itemsFull() && !!trainerId();
  }

  function setStatus(kind, html) {
    if (!html) {
      els.status.hidden = true;
      els.status.innerHTML = "";
      return;
    }
    els.status.hidden = false;
    els.status.className = "craft-status state-" + kind;
    els.status.innerHTML = html;
  }

  function craftUsesDots(uses) {
    if (!uses || uses.max == null) return "";
    var max = Number(uses.max) || 3;
    var rem = Number(uses.remaining);
    if (isNaN(rem)) rem = max;
    var html = "";
    var i;
    for (i = 0; i < max; i++) {
      html +=
        '<span class="craft-use-dot' +
        (i < rem ? " is-active" : "") +
        '" aria-hidden="true"></span>';
    }
    return html;
  }

  function cardSubline(card) {
    card = card || {};
    var set = card.set_name || card.set_code || "";
    var num = card.collector_number != null ? card.collector_number : "?";
    return (set ? set + " · " : "") + "#" + num;
  }

  function buildCollectionPath(role) {
    var qs = new URLSearchParams();
    qs.set("page", String(state.page));
    qs.set("page_size", String(state.pageSize));
    qs.set("sort", "newest");
    if (state.query) qs.set("q", state.query);
    if (role) qs.set("craft_role", role);
    return "/api/me/collection?" + qs.toString();
  }

  function setPickerRole(role) {
    state.pickerRole = role;
    if (els.nodeMaterials) {
      els.nodeMaterials.classList.toggle("is-active", role === "item");
    }
    if (els.nodeTrainer) {
      els.nodeTrainer.classList.toggle("is-active", role === "craft_trainer");
    }
    if (els.pickerTitle) {
      els.pickerTitle.textContent =
        role === "craft_trainer" ? "Pick a trainer" : "Pick materials";
    }
    if (els.pickerLead) {
      els.pickerLead.textContent =
        role === "craft_trainer"
          ? "Supporter, Stadium, or Tool trainers — not Item cards."
          : "Item and Energy cards from your collection.";
    }
    if (els.search) {
      els.search.placeholder =
        role === "craft_trainer"
          ? "Search trainers by name…"
          : "Search items & energy by name…";
    }
    loadPicker(role);
  }

  function loadPicker(role) {
    if (!state.authenticated) return;
    role = role || state.pickerRole;
    if (state.inflight) state.inflight.abort();
    var ctrl = new AbortController();
    state.inflight = ctrl;
    els.grid.setAttribute("aria-busy", "true");
    setPickerStatus("info", "Loading cards…");

    apiFetch(buildCollectionPath(role), { signal: ctrl.signal })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (body) {
        state.inflight = null;
        var rows = Array.isArray(body.items) ? body.items : [];
        if (role === "item") {
          rows = rows.filter(function (it) {
            return it.craft_role === "item";
          });
        } else if (role === "craft_trainer") {
          rows = rows.filter(function (it) {
            return it.craft_role === "craft_trainer";
          });
        }
        rows.forEach(rememberItem);
        state.items = rows;
        renderPicker(role);
      })
      .catch(function (err) {
        if (err.name === "AbortError") return;
        state.inflight = null;
        setPickerStatus("error", escapeHtml(err.message || String(err)));
      })
      .finally(function () {
        els.grid.removeAttribute("aria-busy");
      });
  }

  function setPickerStatus(kind, html) {
    if (!els.pickerStatus) return;
    if (!html) {
      els.pickerStatus.hidden = true;
      els.pickerStatus.innerHTML = "";
      return;
    }
    els.pickerStatus.hidden = false;
    els.pickerStatus.className = "craft-picker-status state-" + kind;
    els.pickerStatus.innerHTML = html;
  }

  function renderPicker(role) {
    els.grid.innerHTML = "";
    if (!state.items.length) {
      setPickerStatus(
        "empty",
        state.query
          ? "No cards match your search."
          : role === "item"
            ? "No item or Energy cards in your collection yet — pull from packs."
            : "No craftable trainer cards yet."
      );
      return;
    }
    setPickerStatus("info", state.items.length + " card(s) shown");
    var frag = document.createDocumentFragment();
    state.items.forEach(function (it) {
      frag.appendChild(buildPickerTile(it, role));
    });
    els.grid.appendChild(frag);
  }

  function buildPickerTile(item, role) {
    var card = item.card || {};
    var wrap = document.createElement("button");
    wrap.type = "button";
    wrap.className = "card-tile picker-tile craft-picker-tile";
    var selected =
      role === "item"
        ? state.itemSlots.some(function (s) {
            return s && s.public_id === item.public_id;
          })
        : state.trainerEntry && state.trainerEntry.public_id === item.public_id;
    if (selected) wrap.classList.add("is-selected");
    if (item.sell && item.sell.blocked_reason) wrap.classList.add("is-blocked");

    var img = document.createElement("img");
    img.loading = "lazy";
    img.decoding = "async";
    img.alt = card.name || "Card";
    img.src = card.image_small_url || card.image_large_url || "";
    img.className = "card-tile-img";

    var meta = document.createElement("div");
    meta.className = "card-tile-meta";
    meta.innerHTML =
      '<span class="card-tile-name">' +
      escapeHtml(card.name) +
      '</span><span class="card-tile-sub">' +
      escapeHtml(cardSubline(card)) +
      "</span>";

    wrap.appendChild(img);
    wrap.appendChild(meta);
    var dots = craftUsesDots(item.craft_uses);
    if (dots) {
      var du = document.createElement("span");
      du.className = "card-tile-craft-uses craft-use-dots";
      du.innerHTML = dots;
      wrap.appendChild(du);
    }

    wrap.addEventListener("click", function () {
      if (item.sell && item.sell.blocked_reason) return;
      if (role === "item") toggleItem(item);
      else selectTrainer(item);
    });
    return wrap;
  }

  function ensureSlotArray() {
    while (state.itemSlots.length < ITEM_COUNT) state.itemSlots.push(null);
    if (state.itemSlots.length > ITEM_COUNT) {
      state.itemSlots = state.itemSlots.slice(0, ITEM_COUNT);
    }
  }

  function toggleItem(item) {
    var pid = item.public_id;
    var idx = -1;
    var i;
    for (i = 0; i < state.itemSlots.length; i++) {
      if (state.itemSlots[i] && state.itemSlots[i].public_id === pid) {
        idx = i;
        break;
      }
    }
    if (idx !== -1) {
      state.itemSlots[idx] = null;
    } else {
      if (trainerId() === pid) return;
      if (state.itemSlots.filter(Boolean).length >= ITEM_COUNT) return;
      ensureSlotArray();
      for (i = 0; i < ITEM_COUNT; i++) {
        if (!state.itemSlots[i]) {
          state.itemSlots[i] = item;
          rememberItem(item);
          break;
        }
      }
    }
    renderItemSlots();
    updateCraftUi();
    renderPicker("item");
  }

  function clearItemAt(idx) {
    if (idx >= 0 && idx < ITEM_COUNT) {
      state.itemSlots[idx] = null;
      renderItemSlots();
      updateCraftUi();
      renderPicker(state.pickerRole);
    }
  }

  function selectTrainer(item) {
    var pid = item.public_id;
    if (itemIds().indexOf(pid) !== -1) return;
    if (state.trainerEntry && state.trainerEntry.public_id === pid) {
      state.trainerEntry = null;
    } else {
      state.trainerEntry = item;
      rememberItem(item);
    }
    renderTrainerSlot();
    updateCraftUi();
    renderPicker("craft_trainer");
  }

  function buildFilledSlotCard(item, options) {
    options = options || {};
    var card = item.card || {};
    var slot = document.createElement("div");
    slot.className = "craft-slot-card is-filled";
    if (options.label) {
      var lbl = document.createElement("span");
      lbl.className = "craft-slot-index";
      lbl.textContent = options.label;
      slot.appendChild(lbl);
    }

    var img = document.createElement("img");
    img.className = "craft-slot-img";
    img.loading = "lazy";
    img.alt = card.name || "Card";
    img.src = card.image_small_url || card.image_large_url || "";

    var cap = document.createElement("div");
    cap.className = "craft-slot-caption";
    cap.innerHTML =
      '<span class="craft-slot-name">' +
      escapeHtml(card.name) +
      "</span>";

    var clear = document.createElement("button");
    clear.type = "button";
    clear.className = "craft-slot-clear";
    clear.setAttribute("aria-label", "Remove card");
    clear.textContent = "×";
    clear.addEventListener("click", function (e) {
      e.stopPropagation();
      if (options.onClear) options.onClear();
    });

    slot.appendChild(img);
    slot.appendChild(cap);
    slot.appendChild(clear);

    var dots = craftUsesDots(item.craft_uses);
    if (dots) {
      var du = document.createElement("span");
      du.className = "craft-slot-uses";
      du.innerHTML = dots;
      slot.appendChild(du);
    }
    return slot;
  }

  function buildEmptySlot(label, onClick) {
    var slot = document.createElement("button");
    slot.type = "button";
    slot.className = "craft-slot-card is-empty";
    slot.innerHTML =
      '<span class="craft-slot-index">' +
      escapeHtml(label) +
      '</span><span class="craft-slot-empty-label">+</span>';
    if (onClick) {
      slot.addEventListener("click", onClick);
    }
    return slot;
  }

  function renderItemSlots() {
    if (!els.itemSlots) return;
    ensureSlotArray();
    els.itemSlots.innerHTML = "";
    var i;
    for (i = 0; i < ITEM_COUNT; i++) {
      var item = state.itemSlots[i];
      var el;
      if (item) {
        el = buildFilledSlotCard(item, {
          label: String(i + 1),
          onClear: function () {
            clearItemAt(i);
          },
        });
      } else {
        el = buildEmptySlot(String(i + 1), function () {
          setPickerRole("item");
        });
      }
      els.itemSlots.appendChild(el);
    }
    var filled = state.itemSlots.filter(Boolean).length;
    if (els.itemCount) {
      els.itemCount.textContent = filled + " / " + ITEM_COUNT;
    }
    if (filled === ITEM_COUNT && state.pickerRole === "item") {
      setPickerRole("craft_trainer");
    }
  }

  function renderTrainerSlot() {
    if (!els.trainerSlotWrap) return;
    els.trainerSlotWrap.innerHTML = "";
    if (!state.trainerEntry) {
      var empty = buildEmptySlot("Trainer", function () {
        setPickerRole("craft_trainer");
      });
      empty.classList.add("craft-slot-card--trainer");
      els.trainerSlotWrap.appendChild(empty);
      return;
    }
    var filled = buildFilledSlotCard(state.trainerEntry, {
      onClear: function () {
        state.trainerEntry = null;
        renderTrainerSlot();
        updateCraftUi();
        if (state.pickerRole === "craft_trainer") renderPicker("craft_trainer");
      },
    });
    filled.classList.add("craft-slot-card--trainer");
    els.trainerSlotWrap.appendChild(filled);
  }

  function updateCraftUi() {
    if (els.btnCraft) {
      els.btnCraft.disabled = state.crafting || !craftReady();
    }
    if (els.nodeTrainer) {
      els.nodeTrainer.classList.toggle("is-ready", itemsFull());
    }
    if (els.nodeOutput) {
      els.nodeOutput.classList.toggle("is-ready", craftReady());
    }
  }

  function runCraft() {
    if (state.crafting || !craftReady()) return;
    state.crafting = true;
    if (els.craftMsg) {
      els.craftMsg.hidden = true;
      els.craftMsg.textContent = "";
    }
    if (els.btnCraft) els.btnCraft.disabled = true;

    apiFetch("/api/me/craft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        item_public_ids: itemIds(),
        trainer_public_id: trainerId(),
      }),
    })
      .then(function (r) {
        return r.json().then(function (d) {
          return { ok: r.ok, data: d };
        });
      })
      .then(function (res) {
        state.crafting = false;
        var d = res.data || {};
        if (!res.ok || !d.ok) {
          if (els.craftMsg) {
            els.craftMsg.hidden = false;
            els.craftMsg.className = "craft-msg is-error";
            els.craftMsg.textContent = d.message || d.error || "Craft failed.";
          }
          updateCraftUi();
          return;
        }
        state.itemSlots = [];
        state.trainerEntry = null;
        renderItemSlots();
        renderTrainerSlot();
        renderOutput(d);
        updateCraftUi();
        setPickerRole("item");
      })
      .catch(function () {
        state.crafting = false;
        if (els.craftMsg) {
          els.craftMsg.hidden = false;
          els.craftMsg.className = "craft-msg is-error";
          els.craftMsg.textContent = "Network error — try again.";
        }
        updateCraftUi();
      });
  }

  function renderOutput(d) {
    if (!els.outputSlot) return;
    var pack = d.pack || {};
    var series = pack.series || {};
    var art = series.pack_art_url
      ? '<img class="craft-pack-art" src="' +
        escapeHtml(series.pack_art_url) +
        '" alt="">'
      : '<div class="craft-output-pack-icon" aria-hidden="true">📦</div>';
    var uses =
      d.trainer_uses_remaining != null
        ? '<p class="craft-output-meta">Trainer uses left: <strong>' +
          escapeHtml(String(d.trainer_uses_remaining)) +
          "</strong></p>"
        : '<p class="craft-output-meta muted">Trainer card was fully used up.</p>';

    els.outputSlot.innerHTML =
      '<div class="craft-output-result">' +
      art +
      '<div class="craft-output-text">' +
      "<p><strong>" +
      escapeHtml(series.display_name || "Booster") +
      "</strong></p>" +
      '<p class="muted">Tier from <strong>' +
      escapeHtml(d.trainer_name || "trainer") +
      "</strong></p>" +
      uses +
      "</div></div>" +
      '<div class="craft-output-actions">' +
      '<button type="button" class="btn btn-primary" id="btn-open-pack">Open pack</button>' +
      '<button type="button" class="btn btn-ghost" id="btn-craft-again">Craft another</button>' +
      "</div>";

    var openBtn = document.getElementById("btn-open-pack");
    var againBtn = document.getElementById("btn-craft-again");
    if (openBtn) {
      openBtn.addEventListener("click", function () {
        openPack(pack.public_id);
      });
    }
    if (againBtn) {
      againBtn.addEventListener("click", function () {
        els.outputSlot.innerHTML =
          '<p class="craft-output-placeholder muted">Your crafted pack appears here.</p>';
        setPickerRole("item");
      });
    }
  }

  function openPack(pid) {
    apiFetch("/api/me/craft/open-pack", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pack_public_id: pid }),
    })
      .then(function (r) {
        return r.json();
      })
      .then(function (d) {
        if (d.ok) {
          setStatus("info", d.message || "Pack opened — check your collection.");
        } else {
          setStatus("error", d.message || d.error || "Could not open pack.");
        }
      })
      .catch(function () {
        setStatus("error", "Network error opening pack.");
      });
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
    }
  }

  function bootAuth() {
    apiFetch("/api/me")
      .then(function (r) {
        return r.json();
      })
      .then(function (body) {
        if (body && body.authenticated && body.user) {
          state.authenticated = true;
          showSignedIn(body.user);
          if (els.workspace) els.workspace.hidden = false;
          renderItemSlots();
          renderTrainerSlot();
          updateCraftUi();
          setPickerRole("item");
        } else {
          showSignedOut();
          setStatus("auth", "Sign in with Discord to use crafting.");
        }
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
  if (els.btnCraft) {
    els.btnCraft.addEventListener("click", runCraft);
  }
  if (els.nodeMaterials) {
    els.nodeMaterials.addEventListener("click", function (e) {
      if (e.target.closest(".craft-slot-clear")) return;
      setPickerRole("item");
    });
  }
  if (els.nodeTrainer) {
    els.nodeTrainer.addEventListener("click", function (e) {
      if (e.target.closest(".craft-slot-clear")) return;
      setPickerRole("craft_trainer");
    });
  }
  if (els.search) {
    els.search.addEventListener("input", function (e) {
      var v = (e.target.value || "").trim();
      if (els.searchClear) els.searchClear.hidden = !v;
      clearTimeout(state.searchDebounce);
      state.searchDebounce = setTimeout(function () {
        state.query = v.toLowerCase();
        state.page = 1;
        loadPicker(state.pickerRole);
      }, 200);
    });
  }
  if (els.searchClear) {
    els.searchClear.addEventListener("click", function () {
      els.search.value = "";
      els.searchClear.hidden = true;
      state.query = "";
      loadPicker(state.pickerRole);
    });
  }
  if (els.sidebarToggle && els.sidebar) {
    els.sidebarToggle.addEventListener("click", function () {
      els.sidebar.classList.toggle("is-open");
    });
  }

  bootAuth();
})();
