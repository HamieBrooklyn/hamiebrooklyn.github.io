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
    rarityFilter: document.getElementById("craft-rarity-filter"),
    grid: document.getElementById("card-grid"),
    pickerStatus: document.getElementById("picker-status"),
  };

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

  var state = {
    authenticated: false,
    pickerRole: "item",
    itemSlots: [],
    trainerEntry: null,
    query: "",
    rarityFilter: "",
    page: 1,
    pageSize: 120,
    allPickerItems: [],
    items: [],
    inflight: null,
    crafting: false,
    lastPackId: null,
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
    if (role === "craft_trainer") {
      qs.set("supertype", "Trainer");
    } else if (role === "item") {
      qs.set("craft_role", "item");
    }
    return "/api/me/collection?" + qs.toString();
  }

  function setPickerRole(role) {
    state.pickerRole = role;
    state.rarityFilter = "";
    if (els.rarityFilter) els.rarityFilter.value = "";
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
            return effectiveCraftRole(it) === "item";
          });
        } else if (role === "craft_trainer") {
          rows = rows.filter(function (it) {
            return effectiveCraftRole(it) === "craft_trainer";
          });
        }
        rows.forEach(rememberItem);
        state.allPickerItems = rows;
        populateRarityDropdown(rows);
        state.items = applyRarityFilter(rows);
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

  function itemRarityCode(item) {
    var r = item && item.card && item.card.rarity;
    return (r && r.code) || "";
  }

  function itemRarityDisplay(item) {
    var r = item && item.card && item.card.rarity;
    return (r && r.display_name) || "";
  }

  function itemRaritySort(item) {
    var r = item && item.card && item.card.rarity;
    return (r && typeof r.sort_order === "number") ? r.sort_order : 0;
  }

  function populateRarityDropdown(items) {
    if (!els.rarityFilter) return;
    var prev = state.rarityFilter;
    var seen = {};
    var opts = [];
    items.forEach(function (it) {
      var code = itemRarityCode(it);
      if (!code || seen[code]) return;
      seen[code] = true;
      opts.push({ code: code, name: itemRarityDisplay(it), sort: itemRaritySort(it) });
    });
    opts.sort(function (a, b) { return a.sort - b.sort; });
    els.rarityFilter.innerHTML = '<option value="">All rarities</option>';
    opts.forEach(function (o) {
      var opt = document.createElement("option");
      opt.value = o.code;
      opt.textContent = o.name || o.code;
      els.rarityFilter.appendChild(opt);
    });
    if (prev && seen[prev]) {
      els.rarityFilter.value = prev;
    } else {
      state.rarityFilter = "";
      els.rarityFilter.value = "";
    }
  }

  function applyRarityFilter(items) {
    var code = state.rarityFilter;
    if (!code) return items;
    return items.filter(function (it) {
      return itemRarityCode(it) === code;
    });
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
    if (role === "craft_trainer" && effectiveCraftRole(item) === "craft_trainer") {
      var meter = buildCraftUsesMeter(craftUsesForItem(item));
      if (meter) wrap.appendChild(meter);
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
    var meter = buildCraftUsesMeter(craftUsesForItem(item));
    if (meter) {
      meter.classList.add("craft-uses-meter--slot");
      slot.appendChild(meter);
    }
    slot.appendChild(clear);
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
          onClear: (function (slotIdx) {
            return function () {
              clearItemAt(slotIdx);
            };
          })(i),
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

  function copyPackId(packId, buttonEl) {
    var pid = (packId || "").trim();
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
        setStatus("error", "Could not copy Pack ID.");
      }
    }
  }

  function resetCraftWorkspace() {
    state.lastPackId = null;
    if (els.outputSlot) {
      els.outputSlot.innerHTML =
        '<p class="craft-output-placeholder muted">Your crafted pack appears here.</p>';
    }
    if (els.craftMsg) {
      els.craftMsg.hidden = true;
      els.craftMsg.textContent = "";
    }
    setPickerRole("item");
    updateCraftUi();
  }

  function updateCraftUi() {
    if (els.btnCraft) {
      if (state.lastPackId) {
        els.btnCraft.textContent = "Craft another";
        els.btnCraft.disabled = state.crafting;
      } else {
        els.btnCraft.textContent = "Craft pack";
        els.btnCraft.disabled = state.crafting || !craftReady();
      }
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
        var usedTrainerPid = trainerId();
        state.itemSlots = [];
        state.trainerEntry = null;
        state.lastPackId = (d.pack && d.pack.public_id) || null;
        if (usedTrainerPid) {
          if (d.trainer_uses_remaining == null) {
            state.allPickerItems = state.allPickerItems.filter(function (it) {
              return it.public_id !== usedTrainerPid;
            });
            if (state.itemCache && state.itemCache[usedTrainerPid]) {
              delete state.itemCache[usedTrainerPid];
            }
          } else {
            var rem = Number(d.trainer_uses_remaining);
            var maxUses = Number(d.trainer_max_uses) || 3;
            function patchUses(it) {
              if (!it || it.public_id !== usedTrainerPid) return it;
              it.craft_uses = {
                max: maxUses,
                remaining: rem,
                used: maxUses - rem,
              };
              return it;
            }
            state.allPickerItems = state.allPickerItems.map(patchUses);
            if (state.itemCache && state.itemCache[usedTrainerPid]) {
              patchUses(state.itemCache[usedTrainerPid]);
            }
          }
        }
        renderItemSlots();
        renderTrainerSlot();
        renderOutput(d);
        updateCraftUi();
        loadPicker(state.pickerRole);
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
      '<p class="muted">Pack tier: <strong>' +
      escapeHtml(d.pack_tier_rarity || "—") +
      "</strong> (best of materials + " +
      escapeHtml(d.trainer_name || "trainer") +
      ")</p>" +
      uses +
      '<p class="craft-output-meta muted">Pack ID: <code class="craft-pack-id">' +
      escapeHtml(pack.public_id || "") +
      "</code></p>" +
      '<p class="craft-output-discord muted">In Discord, run <strong>/packcolv</strong> to flip through ' +
      "unopened packs (including this one). " +
      "<strong>/packv</strong> alone is the shop — it does not list owned packs.</p>" +
      '<p class="craft-output-verify muted" id="craft-pack-verify" hidden></p>' +
      "</div></div>" +
      '<div class="craft-output-actions">' +
      '<button type="button" class="btn btn-primary" id="btn-copy-pack-id">Copy ID</button>' +
      "</div>";

    var copyBtn = document.getElementById("btn-copy-pack-id");
    if (copyBtn && pack.public_id) {
      copyBtn.addEventListener("click", function () {
        copyPackId(pack.public_id, copyBtn);
      });
    }
    if (pack.public_id) {
      verifyPackSaved(pack.public_id);
    }
  }

  function verifyPackSaved(packId) {
    apiFetch("/api/me/packs")
      .then(function (r) {
        if (!r.ok) return null;
        return r.json();
      })
      .then(function (body) {
        var el = document.getElementById("craft-pack-verify");
        if (!el || !body) return;
        var items = Array.isArray(body.items) ? body.items : [];
        var found = items.some(function (p) {
          return p && p.public_id === packId;
        });
        el.hidden = false;
        if (found) {
          el.textContent =
            "Pack is in your inventory — open it in Discord with /packcolv.";
        } else {
          el.className = "craft-output-verify is-warn";
          el.textContent =
            "Pack not found in inventory yet. Use the same Discord account as this site, " +
            "then run /packcolv again. If it still missing, restart the bot API and re-craft.";
        }
      })
      .catch(function () {
        /* packs API optional until bot deploy */
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

  var activeCraftPanel = "packs";
  var craftTabShowPanel = null;
  var craftSubtabsReady = false;
  var craftAuthReady = false;

  function initCraftSubtabs() {
    if (craftSubtabsReady) return;
    var subtabs = document.getElementById("craft-subtabs");
    if (!subtabs) return;
    craftSubtabsReady = true;
    var panels = document.querySelectorAll(
      ".craft-workspace[data-craft-panel], .craft-status[data-craft-panel]"
    );
    var lead = document.getElementById("craft-page-lead");

    function showPanel(name) {
      activeCraftPanel = name || "packs";
      var workspaces = document.querySelectorAll(".craft-workspace[data-craft-panel]");
      if (!craftAuthReady) {
        workspaces.forEach(function (el) {
          el.hidden = el.getAttribute("data-craft-panel") !== "packs";
        });
      } else if (!state.authenticated) {
        workspaces.forEach(function (el) {
          el.hidden = true;
        });
      } else {
        workspaces.forEach(function (el) {
          el.hidden = el.getAttribute("data-craft-panel") !== activeCraftPanel;
        });
      }
      panels.forEach(function (el) {
        if (el.classList.contains("craft-workspace")) return;
        var panel = el.getAttribute("data-craft-panel");
        if (!panel) return;
        el.hidden = panel !== activeCraftPanel;
      });
      subtabs.querySelectorAll(".craft-subtab").forEach(function (btn) {
        var on = btn.getAttribute("data-craft-panel") === activeCraftPanel;
        btn.classList.toggle("is-active", on);
        btn.setAttribute("aria-selected", on ? "true" : "false");
      });
      if (lead) {
        lead.innerHTML =
          activeCraftPanel === "assembly"
            ? "Combine <strong>2 or 4 puzzle pieces</strong> into one full card. Pieces are consumed; the assembled card appears in your collection (newest first)."
            : "Add <strong>5 item or Energy</strong> cards, then a <strong>trainer</strong> card, to craft a random booster pack. Trainer rarity sets the tier. Trainers show <strong>3 purple uses</strong>.";
      }
      if (
        activeCraftPanel === "assembly" &&
        state.authenticated &&
        window.PokePonAssembly &&
        window.PokePonAssembly.onPanelShown
      ) {
        window.PokePonAssembly.onPanelShown();
      }
    }

    subtabs.addEventListener("click", function (e) {
      var btn = e.target.closest(".craft-subtab");
      if (!btn) return;
      showPanel(btn.getAttribute("data-craft-panel") || "packs");
    });
    craftTabShowPanel = showPanel;
  }

  function finishCraftPageLoad() {
    craftAuthReady = true;
    if (craftTabShowPanel) craftTabShowPanel("packs");
  }

  function bootAuth() {
    if (craftTabShowPanel) craftTabShowPanel("packs");
    apiFetch("/api/me")
      .then(function (r) {
        return r.json();
      })
      .then(function (body) {
        if (body && body.authenticated && body.user) {
          state.authenticated = true;
          showSignedIn(body.user);
          renderItemSlots();
          renderTrainerSlot();
          updateCraftUi();
          setPickerRole("item");
          if (window.PokePonAssembly && window.PokePonAssembly.setAuthenticated) {
            window.PokePonAssembly.setAuthenticated(true);
          }
        } else {
          state.authenticated = false;
          showSignedOut();
          setStatus("auth", "Sign in with Discord to use pack crafting.");
          var asmStatus = document.getElementById("assembly-auth-status");
          if (asmStatus) {
            asmStatus.className = "craft-status state-auth";
            asmStatus.innerHTML =
              "Sign in with Discord to use card assembly.";
          }
        }
        finishCraftPageLoad();
      })
      .catch(function () {
        craftAuthReady = true;
        setStatus("error", "Could not verify your session — refresh the page.");
        if (craftTabShowPanel) craftTabShowPanel("packs");
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
    els.btnCraft.addEventListener("click", function () {
      if (state.lastPackId) {
        resetCraftWorkspace();
        return;
      }
      runCraft();
    });
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
  if (els.rarityFilter) {
    els.rarityFilter.addEventListener("change", function () {
      state.rarityFilter = els.rarityFilter.value;
      state.items = applyRarityFilter(state.allPickerItems);
      renderPicker(state.pickerRole);
    });
  }

  initCraftSubtabs();
  if (craftTabShowPanel) craftTabShowPanel("packs");
  bootAuth();
})();
