/* PokePon duels — advanced PvP duel minigame */
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

  function duelIdFromQuery() {
    var raw = new URLSearchParams(window.location.search).get("duel");
    if (!raw) return null;
    var n = parseInt(raw, 10);
    return isFinite(n) && n > 0 ? n : null;
  }

  var els = {
    sidebarUser: document.getElementById("sidebar-user"),
    userAvatar: document.getElementById("user-avatar"),
    userName: document.getElementById("user-name"),
    btnLogin: document.getElementById("btn-login"),
    btnLogout: document.getElementById("btn-logout"),
    inviteSection: document.getElementById("duel-invite-section"),
    inviteInput: document.getElementById("invite-input"),
    inviteSuggestions: document.getElementById("invite-suggestions"),
    betCurrency: document.getElementById("bet-currency"),
    betAmount: document.getElementById("bet-amount"),
    btnInvite: document.getElementById("btn-invite"),
    inviteMsg: document.getElementById("invite-msg"),
    listSection: document.getElementById("duel-list-section"),
    listError: document.getElementById("duel-list-error"),
    listEmpty: document.getElementById("duel-list-empty"),
    duelList: document.getElementById("duel-list"),
    room: document.getElementById("duel-room"),
    roomTitle: document.getElementById("duel-room-title"),
    roomMeta: document.getElementById("duel-room-meta"),
    btnLeave: document.getElementById("btn-leave"),
    btnSurrender: document.getElementById("btn-surrender"),
    drawEnergy: document.getElementById("draw-energy"),
    drawItem: document.getElementById("draw-item"),
    drawHint: document.getElementById("draw-hint"),
    oppDeck: document.getElementById("opponent-deck"),
    yourDeck: document.getElementById("your-deck"),
    itemsHand: document.getElementById("items-hand"),
    coinFace: document.getElementById("coin-face"),
    stakes: document.getElementById("duel-stakes"),
    btnEndTurn: document.getElementById("btn-end-turn"),
    log: document.getElementById("duel-log"),
  };

  var state = {
    authenticated: false,
    me: null,
    duels: [],
    activeDuel: null,
    activeState: null,
    selectedPartnerId: null,
    inviteSearchDebounce: 0,
    inviteSearchInFlight: null,
    inviteSearchCache: {},
    ws: null,
    wsConnected: false,
    selectedAttackerSlot: null,
    selectedItemId: null,
  };

  function escapeHtml(s) {
    s = String(s == null ? "" : s);
    return s.replace(/[&<>"]/g, function (c) {
      if (c === "&") return "&amp;";
      if (c === "<") return "&lt;";
      if (c === ">") return "&gt;";
      if (c === '"') return "&quot;";
      return c;
    });
  }

  function fmtBet(cur, amt) {
    amt = Number(amt || 0);
    if (!amt) return "No bet";
    if ((cur || "") === "crystals") return "💎 " + amt.toLocaleString();
    return "₽" + amt.toLocaleString();
  }

  function showSignedOut() {
    if (!els.sidebarUser) return;
    els.sidebarUser.dataset.state = "signedout";
    var so = els.sidebarUser.querySelector(".sidebar-user-signedout");
    var si = els.sidebarUser.querySelector(".sidebar-user-signedin");
    var ld = els.sidebarUser.querySelector(".sidebar-user-loading");
    if (ld) ld.hidden = true;
    if (so) so.hidden = false;
    if (si) si.hidden = true;
    if (els.inviteSection) els.inviteSection.hidden = true;
    if (els.listSection) els.listSection.hidden = true;
    if (els.room) els.room.hidden = true;
  }

  function showSignedIn(user) {
    if (!els.sidebarUser) return;
    els.sidebarUser.dataset.state = "signedin";
    var so = els.sidebarUser.querySelector(".sidebar-user-signedout");
    var si = els.sidebarUser.querySelector(".sidebar-user-signedin");
    var ld = els.sidebarUser.querySelector(".sidebar-user-loading");
    if (ld) ld.hidden = true;
    if (so) so.hidden = true;
    if (si) si.hidden = false;
    if (els.userAvatar && user.avatar_url) els.userAvatar.src = user.avatar_url;
    if (els.userName) els.userName.textContent = user.global_name || user.username || "You";
    if (els.inviteSection) els.inviteSection.hidden = false;
    if (els.listSection) els.listSection.hidden = false;
  }

  async function loadMe() {
    try {
      var r = await apiFetch("/api/me");
      if (!r.ok) throw new Error("HTTP " + r.status);
      var body = await r.json();
      if (!body || !body.authenticated) {
        state.authenticated = false;
        state.me = null;
        showSignedOut();
        return;
      }
      state.authenticated = true;
      state.me = body.user || null;
      showSignedIn(state.me || {});
    } catch (_) {
      state.authenticated = false;
      state.me = null;
      showSignedOut();
    }
  }

  function inviteSearchQuery() {
    var raw = String((els.inviteInput && els.inviteInput.value) || "").trim();
    raw = raw.replace(/^@+/, "");
    return raw;
  }

  function hideInviteSuggestions() {
    if (!els.inviteSuggestions) return;
    els.inviteSuggestions.hidden = true;
    els.inviteSuggestions.innerHTML = "";
  }

  function profileUser(u) {
    if (!u) return null;
    if (u.username || u.global_name || u.avatar_url) return u;
    if (u.id) return u;
    return null;
  }

  function renderInviteSuggestions(users) {
    if (!els.inviteSuggestions) return;
    els.inviteSuggestions.innerHTML = "";
    if (!users || !users.length) {
      var empty = document.createElement("div");
      empty.className = "invite-suggestion-hint";
      empty.textContent = "No users match that prefix.";
      els.inviteSuggestions.appendChild(empty);
      els.inviteSuggestions.hidden = false;
      return;
    }
    users.forEach(function (u) {
      u = profileUser(u);
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "invite-suggestion";
      var display = (u.global_name || u.username || ("User " + u.id));
      btn.textContent = display;
      btn.addEventListener("click", function () {
        state.selectedPartnerId = u.id;
        if (els.inviteInput) els.inviteInput.value = display;
        hideInviteSuggestions();
      });
      els.inviteSuggestions.appendChild(btn);
    });
    els.inviteSuggestions.hidden = false;
  }

  function scheduleInviteUserSearch() {
    if (!state.authenticated) return;
    state.selectedPartnerId = null;
    var q = inviteSearchQuery();
    if (!q || /^\d+$/.test(q)) { hideInviteSuggestions(); return; }
    if (state.inviteSearchDebounce) clearTimeout(state.inviteSearchDebounce);
    state.inviteSearchDebounce = setTimeout(function () {
      state.inviteSearchDebounce = 0;
      fetchInviteUserSuggestions(q);
    }, 80);
  }

  async function fetchInviteUserSuggestions(q) {
    if (state.inviteSearchInFlight) state.inviteSearchInFlight.abort();
    var ctrl = new AbortController();
    state.inviteSearchInFlight = ctrl;
    try {
      var r = await apiFetch("/api/me/duel-user-search?q=" + encodeURIComponent(q) + "&limit=12", { signal: ctrl.signal });
      if (!r.ok) return;
      var body = await r.json();
      if (inviteSearchQuery() !== q) return;
      renderInviteSuggestions(body.users || []);
    } catch (_) {
      /* ignore */
    } finally {
      if (state.inviteSearchInFlight === ctrl) state.inviteSearchInFlight = null;
    }
  }

  async function loadDuels() {
    if (!state.authenticated) return;
    try {
      var r = await apiFetch("/api/me/duels");
      if (!r.ok) throw new Error("HTTP " + r.status);
      var body = await r.json();
      state.duels = body.duels || [];
      renderDuelsList();
      var qid = duelIdFromQuery();
      if (qid) {
        var hit = state.duels.find(function (d) { return Number(d.id) === Number(qid); });
        if (hit) enterRoom(hit.id);
      }
    } catch (e) {
      if (els.listError) { els.listError.hidden = false; els.listError.textContent = "Could not load duels."; }
    }
  }

  function renderDuelsList() {
    if (!els.duelList) return;
    els.duelList.innerHTML = "";
    if (!state.duels.length) {
      if (els.listEmpty) els.listEmpty.hidden = false;
      return;
    }
    if (els.listEmpty) els.listEmpty.hidden = true;
    state.duels.forEach(function (d) {
      var item = document.createElement("div");
      item.className = "duel-list-item";
      var left = document.createElement("div");
      var title = document.createElement("div");
      title.className = "duel-list-item-title";
      var opp = (d.initiator && d.initiator.display_name) || (d.initiator && d.initiator.username) || "Opponent";
      var par = (d.partner && d.partner.display_name) || (d.partner && d.partner.username) || "Opponent";
      title.textContent = opp + " vs " + par;
      var meta = document.createElement("div");
      meta.className = "duel-list-item-meta";
      meta.textContent = (d.status || "invited") + " · " + fmtBet(d.bet && d.bet.currency, d.bet && d.bet.amount);
      left.appendChild(title);
      left.appendChild(meta);
      var right = document.createElement("div");
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn btn-small btn-primary";
      btn.textContent = "Open";
      btn.addEventListener("click", function () { enterRoom(d.id); });
      right.appendChild(btn);
      item.appendChild(left);
      item.appendChild(right);
      els.duelList.appendChild(item);
    });
  }

  async function sendInvite() {
    if (!state.authenticated) return;
    if (!els.inviteMsg) return;
    els.inviteMsg.textContent = "";
    var val = inviteSearchQuery();
    if (!val) { els.inviteMsg.textContent = "Pick an opponent."; return; }
    var amt = parseInt(String((els.betAmount && els.betAmount.value) || "0").replace(/[^\d]/g, ""), 10);
    if (isNaN(amt) || amt < 0) amt = 0;
    var cur = (els.betCurrency && els.betCurrency.value) || "pokedollars";

    var body;
    if (state.selectedPartnerId) body = { partner_id: String(state.selectedPartnerId) };
    else if (/^\d+$/.test(val)) body = { partner_id: val };
    else body = { partner_username: val };
    body.bet_currency = cur;
    body.bet_amount = amt;

    try {
      var r = await apiFetch("/api/me/duels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      var resp = await r.json().catch(function () { return null; });
      if (!r.ok) {
        els.inviteMsg.textContent = (resp && resp.message) || "Could not create duel.";
        return;
      }
      els.inviteMsg.textContent = "Invite sent.";
      await loadDuels();
    } catch (_) {
      els.inviteMsg.textContent = "Network error.";
    }
  }

  function wsUrlForDuel(duelId) {
    var base = API_BASE || "";
    // convert https->wss, http->ws
    if (/^https:/i.test(base)) base = base.replace(/^https:/i, "wss:");
    else if (/^http:/i.test(base)) base = base.replace(/^http:/i, "ws:");
    return base + "/ws/duels/" + encodeURIComponent(String(duelId));
  }

  function disconnectWs() {
    if (state.ws) {
      try { state.ws.onopen = null; state.ws.onmessage = null; state.ws.onerror = null; state.ws.onclose = null; state.ws.close(); } catch (_) {}
    }
    state.ws = null;
    state.wsConnected = false;
  }

  async function acceptIfNeeded(duelId) {
    // If duel is still invited and I am partner, accept so gameplay can start.
    try {
      var r = await apiFetch("/api/me/duels/" + duelId);
      if (!r.ok) return;
      var body = await r.json();
      state.activeDuel = body;
      if (body && body.status === "invited") {
        var meId = String((body.viewer_id || (state.me && state.me.id) || "") || "");
        var partnerId = String((body.partner && body.partner.id) || "");
        if (meId && partnerId && meId === partnerId) {
          await apiFetch("/api/me/duels/" + duelId + "/accept", { method: "POST" });
        }
      }
    } catch (_) {}
  }

  async function enterRoom(duelId) {
    duelId = Number(duelId);
    if (!duelId) return;
    if (els.room) els.room.hidden = false;
    if (els.inviteSection) els.inviteSection.hidden = true;
    if (els.listSection) els.listSection.hidden = true;
    if (els.roomTitle) els.roomTitle.textContent = "Duel #" + duelId;
    disconnectWs();
    await acceptIfNeeded(duelId);
    connectWs(duelId);
    window.history.replaceState(null, "", "/duel/?duel=" + duelId);
  }

  function leaveRoom() {
    disconnectWs();
    state.activeDuel = null;
    state.activeState = null;
    state.selectedAttackerSlot = null;
    state.selectedItemId = null;
    if (els.room) els.room.hidden = true;
    if (els.inviteSection) els.inviteSection.hidden = false;
    if (els.listSection) els.listSection.hidden = false;
    window.history.replaceState(null, "", "/duel/");
  }

  function connectWs(duelId) {
    var url = wsUrlForDuel(duelId);
    var ws = new WebSocket(url);
    state.ws = ws;
    state.wsConnected = false;
    ws.onopen = function () { state.wsConnected = true; };
    ws.onmessage = function (ev) {
      var msg;
      try { msg = JSON.parse(ev.data); } catch (_) { return; }
      if (!msg) return;
      if (msg.type === "state") {
        state.activeDuel = msg.duel || state.activeDuel;
        state.activeState = msg.state || {};
        renderRoom();
      } else if (msg.type === "error") {
        if (els.log) els.log.textContent = "Error: " + (msg.message || "unknown");
      }
    };
    ws.onclose = function () {
      state.wsConnected = false;
      if (els.drawHint) els.drawHint.textContent = "Disconnected. Refresh to reconnect.";
    };
    ws.onerror = function () {
      state.wsConnected = false;
    };
  }

  function myId() {
    var id = (state.me && (state.me.id || state.me.user_id)) || null;
    if (id == null && state.activeDuel) id = state.activeDuel.viewer_id;
    return id != null ? String(id) : "";
  }

  function isMyTurn() {
    var st = state.activeState || {};
    return String(st.turn || "") === myId();
  }

  function renderRoom() {
    var d = state.activeDuel || {};
    var st = state.activeState || {};
    var me = myId();
    if (els.roomMeta) {
      els.roomMeta.textContent =
        "Turn: " + (st.turn ? ("User " + st.turn) : "—") +
        " · draws left: " + Number(st.draws_remaining || 0) +
        " · version: " + Number(d.version || 0);
    }
    if (els.coinFace) els.coinFace.textContent = isMyTurn() ? "YOU" : "THEM";
    if (els.stakes) {
      els.stakes.textContent = "Stake: " + fmtBet(d.bet && d.bet.currency, d.bet && d.bet.amount);
    }
    if (els.drawHint) {
      els.drawHint.textContent = isMyTurn()
        ? "Draw up to 2 cards (2 from one stack or 1+1)."
        : "Waiting for opponent…";
    }
    var drawsRemaining = Number(st.draws_remaining || 0);
    if (els.drawEnergy) els.drawEnergy.disabled = !isMyTurn() || drawsRemaining <= 0;
    if (els.drawItem) els.drawItem.disabled = !isMyTurn() || drawsRemaining <= 0;
    if (els.btnEndTurn) els.btnEndTurn.disabled = !isMyTurn();

    renderDecks();
    renderItems();
    renderLog();
  }

  function cardTile(row, slot, mine) {
    var wrap = document.createElement("div");
    wrap.className = "duel-card";
    var hp = Number(row.current_hp || 0);
    if (hp <= 0) wrap.classList.add("is-dead");
    var img = document.createElement("img");
    img.alt = "";
    img.src = row.image_small || row.image_large || "/assets/favicon.png";
    var meta = document.createElement("div");
    var nm = document.createElement("div");
    nm.className = "duel-card-name";
    nm.textContent = row.name || "Pokémon";
    var hpLine = document.createElement("div");
    hpLine.className = "duel-card-hp";
    hpLine.textContent = "HP " + Number(row.current_hp || 0) + " / " + Number(row.max_hp || 0);
    meta.appendChild(nm);
    meta.appendChild(hpLine);
    wrap.appendChild(img);
    wrap.appendChild(meta);

    wrap.addEventListener("click", function () {
      if (!isMyTurn()) return;
      if (mine) {
        if (state.selectedItemId) {
          sendWsAction({ type: "use_item", item_id: state.selectedItemId, target_slot: slot });
          state.selectedItemId = null;
          if (els.log) els.log.textContent = "Used item.";
        } else {
          state.selectedAttackerSlot = slot;
          if (els.log) els.log.textContent = "Selected attacker: " + (row.name || "Pokémon") + ". Now click an opponent Pokémon to attack.";
        }
      } else {
        if (state.selectedItemId) {
          // using item on my own only, ignore
          return;
        }
        if (state.selectedAttackerSlot == null) return;
        // always use attack_index 0 for MVP
        sendWsAction({ type: "attack", attacker_slot: state.selectedAttackerSlot, attack_index: 0, defender_slot: slot });
        state.selectedAttackerSlot = null;
      }
      renderRoom();
    });
    return wrap;
  }

  function renderDecks() {
    var st = state.activeState || {};
    var me = myId();
    var lineups = st.lineups || {};
    var myLine = lineups[me] || [];
    var oppId = null;
    (st.players || []).forEach(function (pid) { if (String(pid) !== me) oppId = String(pid); });
    var oppLine = oppId ? (lineups[oppId] || []) : [];

    if (els.yourDeck) {
      els.yourDeck.innerHTML = "";
      myLine.forEach(function (row, idx) { els.yourDeck.appendChild(cardTile(row, idx, true)); });
    }
    if (els.oppDeck) {
      els.oppDeck.innerHTML = "";
      oppLine.forEach(function (row, idx) { els.oppDeck.appendChild(cardTile(row, idx, false)); });
    }
  }

  function renderItems() {
    var st = state.activeState || {};
    var me = myId();
    var items = (st.items && st.items[me]) || [];
    if (!els.itemsHand) return;
    els.itemsHand.innerHTML = "";
    items.forEach(function (it) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "duel-item";
      btn.textContent = it;
      btn.addEventListener("click", function () {
        if (!isMyTurn()) return;
        state.selectedItemId = it;
        state.selectedAttackerSlot = null;
        if (els.log) els.log.textContent = "Selected item: " + it + ". Click one of your Pokémon to use it.";
        // next click on your deck uses it:
      });
      els.itemsHand.appendChild(btn);
    });
  }

  function renderLog() {
    var st = state.activeState || {};
    var log = st.log || [];
    if (!els.log) return;
    if (!log.length) {
      els.log.textContent = "Waiting for actions…";
      return;
    }
    var last = log.slice(-8);
    els.log.textContent = last.map(function (e) {
      if (!e || !e.type) return "";
      if (e.type === "draw") return "Draw: " + e.from + " x" + e.count;
      if (e.type === "attack") return "Attack: " + e.move + " for " + e.damage + (e.ko ? " (KO)" : "");
      if (e.type === "end_turn") return "Turn ended.";
      if (e.type === "item") return "Item: " + e.item;
      if (e.type === "surrender") return "Surrender.";
      return e.type;
    }).join("\n");
  }

  function sendWsAction(msg) {
    if (!state.ws || state.ws.readyState !== 1) return;
    var d = state.activeDuel || {};
    msg.expected_version = Number(d.version || 0);
    state.ws.send(JSON.stringify(msg));
  }

  function bindActions() {
    if (els.inviteInput) {
      els.inviteInput.addEventListener("input", scheduleInviteUserSearch);
      els.inviteInput.addEventListener("keydown", function (e) {
        if (e.key === "Enter") { e.preventDefault(); sendInvite(); }
      });
    }
    if (els.btnInvite) els.btnInvite.addEventListener("click", sendInvite);
    if (els.btnLeave) els.btnLeave.addEventListener("click", leaveRoom);
    if (els.btnSurrender) els.btnSurrender.addEventListener("click", function () {
      var did = duelIdFromQuery();
      if (!did) return;
      apiFetch("/api/me/duels/" + did + "/surrender", { method: "POST" }).then(function () { leaveRoom(); loadDuels(); });
    });
    if (els.drawEnergy) els.drawEnergy.addEventListener("click", function () {
      var st = state.activeState || {};
      var n = Number(st.draws_remaining || 0);
      sendWsAction({ type: "draw", from: "energy", count: n >= 2 ? 2 : 1 });
    });
    if (els.drawItem) els.drawItem.addEventListener("click", function () {
      var st = state.activeState || {};
      var n = Number(st.draws_remaining || 0);
      sendWsAction({ type: "draw", from: "item", count: n >= 2 ? 2 : 1 });
    });
    if (els.btnEndTurn) els.btnEndTurn.addEventListener("click", function () {
      sendWsAction({ type: "end_turn" });
    });
    if (els.btnLogin) els.btnLogin.addEventListener("click", function () {
      window.location.href = api("/auth/discord/login?return_to=" + encodeURIComponent(window.location.href));
    });
    if (els.btnLogout) els.btnLogout.addEventListener("click", function () {
      apiFetch("/auth/logout", { method: "POST" }).finally(function () { showSignedOut(); });
    });
  }

  async function boot() {
    captureSessionFromFragment();
    bindActions();
    await loadMe();
    if (!state.authenticated) return;
    await loadDuels();
    var qid = duelIdFromQuery();
    if (qid) enterRoom(qid);
  }

  boot();
})();

