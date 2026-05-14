/* PokePon trades — interactive two-sided trade sessions */
(function () {
  "use strict";

  var API_BASE = (window.POKEPON_API_BASE || "").replace(/\/+$/, "");
  function api(path) { return API_BASE + path; }

  var SESSION_KEY = "pokepon-session";
  function readSessionToken() { try { return localStorage.getItem(SESSION_KEY) || ""; } catch (_) { return ""; } }
  function storeSessionToken(t) { try { localStorage.setItem(SESSION_KEY, t); } catch (_) {} }
  function captureSessionFromFragment() {
    if (!window.location.hash) return;
    var p = new URLSearchParams(window.location.hash.slice(1));
    var t = p.get("session"); if (!t) return;
    storeSessionToken(t); p.delete("session");
    var h = p.toString();
    window.history.replaceState(null, "", window.location.pathname + window.location.search + (h ? "#" + h : ""));
  }
  function apiHeaders() {
    var h = { "ngrok-skip-browser-warning": "1" };
    var t = readSessionToken(); if (t) h.Authorization = "Bearer " + t;
    return h;
  }
  function apiFetch(path, opts) {
    opts = opts || {}; opts.credentials = "include";
    opts.headers = Object.assign({}, apiHeaders(), opts.headers || {});
    return fetch(api(path), opts);
  }

  var state = {
    me: null, authenticated: false,
    activeTrade: null,
    myCards: [],
    selectedCardIds: [],
    pollTimer: null,
    listTimer: null,
  };

  var els = {
    sidebarUser: document.getElementById("sidebar-user"),
    userAvatar: document.getElementById("user-avatar"),
    userName: document.getElementById("user-name"),
    btnLogin: document.getElementById("btn-login"),
    btnLogout: document.getElementById("btn-logout"),
    inviteSection: document.getElementById("trade-invite-section"),
    inviteInput: document.getElementById("invite-input"),
    btnInvite: document.getElementById("btn-invite"),
    inviteMsg: document.getElementById("invite-msg"),
    listSection: document.getElementById("trade-list-section"),
    listError: document.getElementById("trade-list-error"),
    tradeList: document.getElementById("trade-list"),
    listEmpty: document.getElementById("trade-list-empty"),
    room: document.getElementById("trade-room"),
    roomTitle: document.getElementById("trade-room-title"),
    roomMsg: document.getElementById("trade-room-msg"),
    btnReady: document.getElementById("btn-ready"),
    btnCancelTrade: document.getElementById("btn-cancel-trade"),
    sideMineCards: document.getElementById("side-mine-cards"),
    sideTheirsCards: document.getElementById("side-theirs-cards"),
    sideMineLabel: document.getElementById("side-mine-label"),
    sideTheirsLabel: document.getElementById("side-theirs-label"),
    myPd: document.getElementById("my-pd"),
    myCr: document.getElementById("my-cr"),
    btnSaveSide: document.getElementById("btn-save-side"),
    theirPd: document.getElementById("their-pd"),
    theirCr: document.getElementById("their-cr"),
    theirReadyStatus: document.getElementById("their-ready-status"),
    pickerSearch: document.getElementById("picker-search"),
    pickerResults: document.getElementById("picker-results"),
    sidebarToggle: document.getElementById("sidebar-toggle"),
    sidebar: document.getElementById("sidebar"),
  };

  function fmtPd(n) { return "₽" + Number(n || 0).toLocaleString(); }
  function fmtCr(n) { return "💎 " + Number(n || 0).toLocaleString(); }

  function showLoadingUser() {
    if (!els.sidebarUser) return;
    els.sidebarUser.dataset.state = "loading";
    els.sidebarUser.querySelector(".sidebar-user-loading").hidden = false;
    els.sidebarUser.querySelector(".sidebar-user-signedout").hidden = true;
    els.sidebarUser.querySelector(".sidebar-user-signedin").hidden = true;
  }
  function showSignedOut() {
    if (!els.sidebarUser) return;
    els.sidebarUser.dataset.state = "signed-out";
    els.sidebarUser.querySelector(".sidebar-user-loading").hidden = true;
    els.sidebarUser.querySelector(".sidebar-user-signedout").hidden = false;
    els.sidebarUser.querySelector(".sidebar-user-signedin").hidden = true;
    if (els.inviteSection) els.inviteSection.hidden = true;
  }
  function showSignedIn(user) {
    if (!els.sidebarUser) return;
    els.sidebarUser.dataset.state = "signed-in";
    els.sidebarUser.querySelector(".sidebar-user-loading").hidden = true;
    els.sidebarUser.querySelector(".sidebar-user-signedout").hidden = true;
    els.sidebarUser.querySelector(".sidebar-user-signedin").hidden = false;
    els.userName.textContent = user.global_name || user.username || "Trainer";
    if (user.avatar_url) { els.userAvatar.src = user.avatar_url; els.userAvatar.alt = els.userName.textContent; }
    if (els.inviteSection) els.inviteSection.hidden = false;
  }
  function loginUrl() { return api("/auth/discord/login?return_to=" + encodeURIComponent(window.location.href)); }

  async function bootAuth() {
    showLoadingUser();
    try {
      var r = await apiFetch("/api/me");
      if (!r.ok) throw new Error();
      var j = await r.json();
      if (j && j.authenticated && j.user) {
        state.authenticated = true; state.me = j.user;
        showSignedIn(j.user);
      } else { showSignedOut(); }
    } catch (_) { showSignedOut(); }
    if (els.btnLogin) els.btnLogin.onclick = function () { window.location.href = loginUrl(); };
    if (els.btnLogout) els.btnLogout.onclick = async function () {
      await apiFetch("/auth/logout", { method: "POST" });
      state.authenticated = false; state.me = null; showSignedOut(); leaveRoom(); loadList();
    };
  }

  function userLabel(u) {
    if (!u) return "Unknown";
    return u.global_name || u.username || u.id;
  }

  // ---- Trade list ----
  async function loadList() {
    if (!state.authenticated) return;
    try {
      var r = await apiFetch("/api/me/trades");
      if (!r.ok) throw new Error((await r.json()).error || "load failed");
      var j = await r.json();
      var trades = j.trades || [];
      els.tradeList.innerHTML = "";
      if (!trades.length) { els.listEmpty.hidden = false; return; }
      els.listEmpty.hidden = true;
      trades.forEach(function (t) {
        var isInvitedToMe = t.status === "invited" && t.viewer_role === "partner";
        var isMySentInvite = t.status === "invited" && t.viewer_role === "initiator";
        var other = t.viewer_role === "initiator" ? t.partner : t.initiator;

        var el = document.createElement("div");
        el.className = "trade-list-item";

        var info = document.createElement("div");
        info.className = "trade-list-info";
        var label = "";
        if (isInvitedToMe) label = "Invite from <strong>" + userLabel(other) + "</strong>";
        else if (isMySentInvite) label = "Invite sent to <strong>" + userLabel(other) + "</strong> (waiting)";
        else label = "Active trade with <strong>" + userLabel(other) + "</strong>";
        info.innerHTML = label + '<br><span class="trade-muted">Status: ' + t.status + "</span>";
        el.appendChild(info);

        var actions = document.createElement("div");
        actions.className = "trade-list-actions";

        if (isInvitedToMe) {
          var accBtn = document.createElement("button");
          accBtn.className = "btn btn-primary";
          accBtn.textContent = "Accept";
          accBtn.onclick = function () { acceptInvite(t.id); };
          actions.appendChild(accBtn);
          var decBtn = document.createElement("button");
          decBtn.className = "btn btn-ghost";
          decBtn.textContent = "Decline";
          decBtn.onclick = function () { declineInvite(t.id); };
          actions.appendChild(decBtn);
        } else if (t.status === "active") {
          var openBtn = document.createElement("button");
          openBtn.className = "btn btn-primary";
          openBtn.textContent = "Open";
          openBtn.onclick = function () { enterRoom(t.id); };
          actions.appendChild(openBtn);
        }

        var cancelBtn = document.createElement("button");
        cancelBtn.className = "btn btn-ghost";
        cancelBtn.textContent = "Cancel";
        cancelBtn.onclick = function () { cancelTrade(t.id); };
        actions.appendChild(cancelBtn);

        el.appendChild(actions);
        els.tradeList.appendChild(el);
      });
    } catch (e) {
      if (els.listError) { els.listError.hidden = false; els.listError.textContent = String(e.message || e); }
    }
  }

  async function sendInvite() {
    if (els.inviteMsg) els.inviteMsg.innerHTML = "";
    var val = (els.inviteInput.value || "").trim();
    if (!val) return;
    var body = /^\d+$/.test(val) ? { partner_id: val } : { partner_username: val };
    try {
      var r = await apiFetch("/api/me/trades", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      var j = await r.json();
      if (!r.ok) throw new Error(j.message || j.error || "Failed");
      if (els.inviteMsg) els.inviteMsg.innerHTML = '<div class="trade-msg-ok">Invite sent!</div>';
      els.inviteInput.value = "";
      loadList();
    } catch (e) {
      if (els.inviteMsg) els.inviteMsg.innerHTML = '<div class="trade-msg-err">' + String(e.message || e) + "</div>";
    }
  }

  async function acceptInvite(id) {
    try {
      var r = await apiFetch("/api/me/trades/" + id + "/accept", { method: "POST" });
      var j = await r.json();
      if (!r.ok) throw new Error(j.message || j.error);
      await loadList();
      enterRoom(id);
    } catch (e) { alert(e.message || e); }
  }

  async function declineInvite(id) {
    try {
      var r = await apiFetch("/api/me/trades/" + id + "/decline", { method: "POST" });
      if (!r.ok) { var j = await r.json(); throw new Error(j.message || j.error); }
      loadList();
    } catch (e) { alert(e.message || e); }
  }

  async function cancelTrade(id) {
    try {
      var r = await apiFetch("/api/me/trades/" + id + "/cancel", { method: "POST" });
      if (!r.ok) { var j = await r.json(); throw new Error(j.message || j.error); }
      if (state.activeTrade && state.activeTrade.id === id) leaveRoom();
      loadList();
    } catch (e) { alert(e.message || e); }
  }

  // ---- Trade room ----
  async function enterRoom(id) {
    els.listSection.hidden = true;
    els.inviteSection.hidden = true;
    els.room.hidden = false;
    state.selectedCardIds = [];
    await loadTradeState(id);
    await loadMyCollection();
    startPolling(id);
  }

  function leaveRoom() {
    stopPolling();
    state.activeTrade = null;
    state.selectedCardIds = [];
    els.room.hidden = true;
    els.listSection.hidden = false;
    if (state.authenticated && els.inviteSection) els.inviteSection.hidden = false;
    loadList();
  }

  function startPolling(id) {
    stopPolling();
    state.pollTimer = setInterval(function () { loadTradeState(id); }, 3000);
  }

  function stopPolling() {
    if (state.pollTimer) { clearInterval(state.pollTimer); state.pollTimer = null; }
  }

  async function loadTradeState(id) {
    try {
      var r = await apiFetch("/api/me/trades/" + id);
      if (!r.ok) { var j = await r.json(); throw new Error(j.message || j.error || "not found"); }
      var t = await r.json();
      state.activeTrade = t;

      if (t.status === "completed") {
        stopPolling();
        if (els.roomMsg) els.roomMsg.innerHTML = '<div class="trade-msg-ok" style="font-size:1.1rem;font-weight:600">Trade completed! Check your collection.</div>';
        els.btnReady.hidden = true;
        els.btnCancelTrade.hidden = true;
        return;
      }
      if (t.status !== "active") {
        stopPolling();
        if (els.roomMsg) els.roomMsg.innerHTML = '<div class="trade-msg-err">Trade is no longer active (' + t.status + ').</div>';
        els.btnReady.hidden = true;
        els.btnCancelTrade.hidden = true;
        return;
      }

      var other = t.viewer_role === "initiator" ? t.partner : t.initiator;
      els.roomTitle.textContent = "Trade with " + userLabel(other);

      var mySide = t.viewer_role === "initiator" ? t.initiator_side : t.partner_side;
      var theirSide = t.viewer_role === "initiator" ? t.partner_side : t.initiator_side;

      renderSideCards(els.sideMineCards, mySide.cards, true);
      renderSideCards(els.sideTheirsCards, theirSide.cards, false);

      state.selectedCardIds = mySide.cards.map(function (c) { return c.instance_id; });

      els.myPd.value = mySide.pokedollars || 0;
      els.myCr.value = mySide.crystals || 0;
      els.theirPd.textContent = fmtPd(theirSide.pokedollars);
      els.theirCr.textContent = fmtCr(theirSide.crystals);

      var myReady = mySide.ready;
      els.btnReady.textContent = myReady ? "Unready" : "Ready";
      els.btnReady.classList.toggle("is-ready", myReady);
      els.btnReady.hidden = false;
      els.btnCancelTrade.hidden = false;

      if (theirSide.ready) {
        els.theirReadyStatus.innerHTML = '<span class="trade-ready-badge is-ready">Ready</span>';
      } else {
        els.theirReadyStatus.innerHTML = '<span class="trade-ready-badge not-ready">Not ready</span>';
      }

      renderPicker();
    } catch (e) {
      if (els.roomMsg) els.roomMsg.innerHTML = '<div class="trade-msg-err">' + String(e.message || e) + "</div>";
    }
  }

  function renderSideCards(container, cards, removable) {
    container.innerHTML = "";
    if (!cards || !cards.length) {
      container.innerHTML = '<span class="trade-muted">No cards added yet</span>';
      return;
    }
    cards.forEach(function (c) {
      var chip = document.createElement("div");
      chip.className = "trade-card-chip";
      var img = c.image_small_url ? '<img src="' + c.image_small_url + '" alt="" />' : "";
      chip.innerHTML = img + "<span>" + (c.name || "Card") + "</span>";
      if (removable) {
        var rm = document.createElement("span");
        rm.className = "remove-card";
        rm.textContent = "×";
        rm.onclick = function () { removeCard(c.instance_id); };
        chip.appendChild(rm);
      }
      container.appendChild(chip);
    });
  }

  async function removeCard(instanceId) {
    state.selectedCardIds = state.selectedCardIds.filter(function (id) { return id !== instanceId; });
    await saveSide();
  }

  async function addCard(instanceId) {
    if (state.selectedCardIds.indexOf(instanceId) >= 0) return;
    state.selectedCardIds.push(instanceId);
    await saveSide();
  }

  async function saveSide() {
    if (!state.activeTrade) return;
    var pd = parseInt(els.myPd.value, 10) || 0;
    var cr = parseInt(els.myCr.value, 10) || 0;
    try {
      var r = await apiFetch("/api/me/trades/" + state.activeTrade.id + "/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ card_ids: state.selectedCardIds, pokedollars: pd, crystals: cr }),
      });
      var j = await r.json();
      if (!r.ok) throw new Error(j.message || j.error);
      await loadTradeState(state.activeTrade.id);
    } catch (e) {
      if (els.roomMsg) els.roomMsg.innerHTML = '<div class="trade-msg-err">' + String(e.message || e) + "</div>";
    }
  }

  async function toggleReady() {
    if (!state.activeTrade) return;
    if (els.roomMsg) els.roomMsg.innerHTML = "";
    try {
      var r = await apiFetch("/api/me/trades/" + state.activeTrade.id + "/ready", { method: "POST" });
      var j = await r.json();
      if (!r.ok) throw new Error(j.message || j.error);
      await loadTradeState(state.activeTrade.id);
    } catch (e) {
      if (els.roomMsg) els.roomMsg.innerHTML = '<div class="trade-msg-err">' + String(e.message || e) + "</div>";
    }
  }

  // ---- Card picker ----
  async function loadMyCollection() {
    try {
      var r = await apiFetch("/api/me/collection?limit=200");
      if (!r.ok) return;
      var j = await r.json();
      state.myCards = (j.cards || []).map(function (c) {
        return {
          instance_id: c.instance_id,
          public_id: c.public_id,
          name: c.card ? c.card.name : "Card",
          image_small_url: c.card ? c.card.image_small_url : null,
        };
      });
      renderPicker();
    } catch (_) {}
  }

  function renderPicker() {
    if (!els.pickerResults) return;
    var q = (els.pickerSearch.value || "").trim().toLowerCase();
    els.pickerResults.innerHTML = "";
    var cards = state.myCards.filter(function (c) {
      if (q && c.name.toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    cards.forEach(function (c) {
      var el = document.createElement("div");
      el.className = "picker-card";
      if (state.selectedCardIds.indexOf(c.instance_id) >= 0) el.classList.add("is-selected");
      var img = c.image_small_url ? '<img src="' + c.image_small_url + '" alt="" loading="lazy" />' : "";
      el.innerHTML = img + "<div>" + (c.name || "Card") + "</div>";
      el.onclick = function () {
        if (state.selectedCardIds.indexOf(c.instance_id) >= 0) {
          removeCard(c.instance_id);
        } else {
          addCard(c.instance_id);
        }
      };
      els.pickerResults.appendChild(el);
    });
  }

  // ---- Init ----
  function init() {
    if (els.sidebarToggle && els.sidebar) {
      els.sidebarToggle.addEventListener("click", function () {
        var open = els.sidebar.classList.toggle("is-open");
        els.sidebarToggle.setAttribute("aria-expanded", open ? "true" : "false");
      });
    }
    if (els.btnInvite) els.btnInvite.addEventListener("click", sendInvite);
    if (els.inviteInput) els.inviteInput.addEventListener("keydown", function (e) { if (e.key === "Enter") sendInvite(); });
    if (els.btnReady) els.btnReady.addEventListener("click", toggleReady);
    if (els.btnCancelTrade) els.btnCancelTrade.addEventListener("click", function () {
      if (state.activeTrade) cancelTrade(state.activeTrade.id);
    });
    if (els.btnSaveSide) els.btnSaveSide.addEventListener("click", saveSide);
    if (els.pickerSearch) els.pickerSearch.addEventListener("input", renderPicker);

    captureSessionFromFragment();
    bootAuth().then(function () {
      loadList();
      state.listTimer = setInterval(loadList, 10000);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
