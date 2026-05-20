/* Crafting — 10 item cards + 1 trainer → random pack tier */
(function () {
  "use strict";

  var API_BASE = (window.POKEPON_API_BASE || "").replace(/\/+$/, "");
  var ITEM_COUNT = 10;
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
    stepItems: document.getElementById("craft-step-items"),
    stepTrainer: document.getElementById("craft-step-trainer"),
    stepOutput: document.getElementById("craft-step-output"),
    itemSlots: document.getElementById("craft-item-slots"),
    itemCount: document.getElementById("craft-item-count"),
    trainerSlot: document.getElementById("craft-trainer-slot"),
    btnBackItems: document.getElementById("craft-back-items"),
    btnCraft: document.getElementById("btn-craft"),
    craftMsg: document.getElementById("craft-msg"),
    outputPanel: document.getElementById("craft-output"),
    search: document.getElementById("search-input"),
    searchClear: document.getElementById("search-clear"),
    grid: document.getElementById("card-grid"),
    pickerStatus: document.getElementById("picker-status"),
    pager: document.getElementById("pager"),
    pagerPrev: document.getElementById("pager-prev"),
    pagerNext: document.getElementById("pager-next"),
    pagerInfo: document.getElementById("picker-pager-info"),
  };

  var state = {
    authenticated: false,
    phase: "items",
    itemIds: [],
    trainerId: null,
    query: "",
    page: 1,
    pageSize: 60,
    total: 0,
    items: [],
    inflight: null,
    crafting: false,
    lastPack: null,
    searchDebounce: 0,
  };

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

  function buildCollectionPath(role) {
    var qs = new URLSearchParams();
    qs.set("page", String(state.page));
    qs.set("page_size", String(state.pageSize));
    qs.set("sort", "newest");
    if (state.query) qs.set("q", state.query);
    if (role) qs.set("craft_role", role);
    return "/api/me/collection?" + qs.toString();
  }

  function loadPicker(role) {
    if (!state.authenticated) return;
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
        state.items = rows;
        state.total = rows.length;
        state.page = Number(body.page) || 1;
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
            ? "No item cards in your collection yet — pull trainers from packs."
            : "No craftable trainer cards yet."
      );
      if (els.pager) els.pager.hidden = true;
      return;
    }
    setPickerStatus("info", state.items.length + " card(s) shown");
    var frag = document.createDocumentFragment();
    state.items.forEach(function (it) {
      frag.appendChild(buildPickerTile(it, role));
    });
    els.grid.appendChild(frag);
    if (els.pager) els.pager.hidden = true;
  }

  function buildPickerTile(item, role) {
    var card = item.card || {};
    var wrap = document.createElement("button");
    wrap.type = "button";
    wrap.className = "picker-tile craft-picker-tile";
    var selected =
      role === "item"
        ? state.itemIds.indexOf(item.public_id) !== -1
        : state.trainerId === item.public_id;
    if (selected) wrap.classList.add("is-selected");
    if (item.sell && item.sell.blocked_reason) wrap.classList.add("is-blocked");

    var img = document.createElement("img");
    img.loading = "lazy";
    img.alt = card.name || "Card";
    img.src = card.image_small_url || card.image_large_url || "";

    var meta = document.createElement("span");
    meta.className = "picker-tile-meta";
    meta.innerHTML =
      "<span class=\"picker-tile-name\">" +
      escapeHtml(card.name) +
      "</span><span class=\"picker-tile-sub\">" +
      escapeHtml(item.public_id) +
      "</span>";

    wrap.appendChild(img);
    wrap.appendChild(meta);
    var dots = craftUsesDots(item.craft_uses);
    if (dots) {
      var du = document.createElement("span");
      du.className = "craft-use-dots";
      du.innerHTML = dots;
      wrap.appendChild(du);
    }

    wrap.addEventListener("click", function () {
      if (item.sell && item.sell.blocked_reason) return;
      if (role === "item") toggleItem(item.public_id);
      else selectTrainer(item.public_id);
    });
    return wrap;
  }

  function toggleItem(pid) {
    var idx = state.itemIds.indexOf(pid);
    if (idx !== -1) state.itemIds.splice(idx, 1);
    else {
      if (state.itemIds.length >= ITEM_COUNT) return;
      if (state.trainerId === pid) return;
      state.itemIds.push(pid);
    }
    renderItemSlots();
    updatePhaseUi();
    loadPicker("item");
  }

  function selectTrainer(pid) {
    if (state.itemIds.indexOf(pid) !== -1) return;
    state.trainerId = state.trainerId === pid ? null : pid;
    renderTrainerSlot();
    updatePhaseUi();
    loadPicker("craft_trainer");
  }

  function renderItemSlots() {
    if (!els.itemSlots) return;
    els.itemSlots.innerHTML = "";
    var i;
    for (i = 0; i < ITEM_COUNT; i++) {
      var slot = document.createElement("div");
      slot.className = "craft-material-slot";
      var pid = state.itemIds[i];
      if (pid) {
        slot.classList.add("is-filled");
        slot.innerHTML =
          '<span class="craft-slot-label">#' +
          (i + 1) +
          "</span><code>" +
          escapeHtml(pid) +
          '</code><button type="button" class="craft-slot-clear" data-idx="' +
          i +
          '">×</button>';
        slot.querySelector(".craft-slot-clear").addEventListener("click", function (e) {
          e.stopPropagation();
          var idx2 = Number(this.dataset.idx);
          if (!isNaN(idx2)) {
            state.itemIds.splice(idx2, 1);
            renderItemSlots();
            updatePhaseUi();
            loadPicker("item");
          }
        });
      } else {
        slot.innerHTML = '<span class="craft-slot-label">#' + (i + 1) + "</span><span class=\"muted\">Empty</span>";
      }
      els.itemSlots.appendChild(slot);
    }
    if (els.itemCount) {
      els.itemCount.textContent = state.itemIds.length + " / " + ITEM_COUNT;
    }
  }

  function renderTrainerSlot() {
    if (!els.trainerSlot) return;
    if (!state.trainerId) {
      els.trainerSlot.innerHTML = '<span class="muted">Pick a trainer below</span>';
      els.trainerSlot.classList.remove("is-filled");
      return;
    }
    els.trainerSlot.classList.add("is-filled");
    els.trainerSlot.innerHTML =
      "<code>" + escapeHtml(state.trainerId) + "</code>";
  }

  function updatePhaseUi() {
    var itemsFull = state.itemIds.length === ITEM_COUNT;
    if (els.stepItems) els.stepItems.hidden = state.phase !== "items";
    if (els.stepTrainer) els.stepTrainer.hidden = state.phase !== "trainer";
    if (els.stepOutput) els.stepOutput.hidden = state.phase !== "output";
    if (els.btnCraft) {
      els.btnCraft.disabled =
        state.crafting || state.phase !== "trainer" || !state.trainerId || !itemsFull;
    }
    if (itemsFull && state.phase === "items") {
      state.phase = "trainer";
      if (els.stepItems) els.stepItems.hidden = true;
      if (els.stepTrainer) els.stepTrainer.hidden = false;
      loadPicker("craft_trainer");
    }
  }

  function goToItemsPhase() {
    state.phase = "items";
    updatePhaseUi();
    loadPicker("item");
  }

  function runCraft() {
    if (state.crafting || state.itemIds.length !== ITEM_COUNT || !state.trainerId) return;
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
        item_public_ids: state.itemIds.slice(),
        trainer_public_id: state.trainerId,
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
          updatePhaseUi();
          return;
        }
        state.lastPack = d.pack;
        state.itemIds = [];
        state.trainerId = null;
        state.phase = "output";
        renderItemSlots();
        renderTrainerSlot();
        renderOutput(d);
        updatePhaseUi();
      })
      .catch(function () {
        state.crafting = false;
        if (els.craftMsg) {
          els.craftMsg.hidden = false;
          els.craftMsg.className = "craft-msg is-error";
          els.craftMsg.textContent = "Network error — try again.";
        }
        updatePhaseUi();
      });
  }

  function renderOutput(d) {
    if (!els.outputPanel) return;
    var pack = d.pack || {};
    var series = pack.series || {};
    var art = series.pack_art_url
      ? '<img class="craft-pack-art" src="' +
        escapeHtml(series.pack_art_url) +
        '" alt="">'
      : "";
    var uses =
      d.trainer_uses_remaining != null
        ? "<p>Trainer uses left: <strong>" + escapeHtml(String(d.trainer_uses_remaining)) + "</strong></p>"
        : "<p class=\"muted\">Trainer card was fully used up.</p>";
    els.outputPanel.innerHTML =
      "<h2>Pack crafted</h2>" +
      art +
      "<p><strong>" +
      escapeHtml(series.display_name || "Booster") +
      "</strong> — tier from <strong>" +
      escapeHtml(d.trainer_name || "trainer") +
      "</strong>.</p>" +
      "<p>Pack ID: <code id=\"craft-pack-id\">" +
      escapeHtml(pack.public_id || "") +
      "</code></p>" +
      uses +
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
        state.phase = "items";
        state.lastPack = null;
        if (els.outputPanel) els.outputPanel.innerHTML = "";
        renderItemSlots();
        renderTrainerSlot();
        goToItemsPhase();
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
          goToItemsPhase();
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
  if (els.btnBackItems) {
    els.btnBackItems.addEventListener("click", goToItemsPhase);
  }
  if (els.btnCraft) {
    els.btnCraft.addEventListener("click", runCraft);
  }
  if (els.search) {
    els.search.addEventListener("input", function (e) {
      var v = (e.target.value || "").trim();
      if (els.searchClear) els.searchClear.hidden = !v;
      clearTimeout(state.searchDebounce);
      state.searchDebounce = setTimeout(function () {
        state.query = v.toLowerCase();
        state.page = 1;
        loadPicker(state.phase === "trainer" ? "craft_trainer" : "item");
      }, 200);
    });
  }
  if (els.searchClear) {
    els.searchClear.addEventListener("click", function () {
      els.search.value = "";
      els.searchClear.hidden = true;
      state.query = "";
      loadPicker(state.phase === "trainer" ? "craft_trainer" : "item");
    });
  }
  if (els.sidebarToggle && els.sidebar) {
    els.sidebarToggle.addEventListener("click", function () {
      els.sidebar.classList.toggle("is-open");
    });
  }

  bootAuth();
})();
