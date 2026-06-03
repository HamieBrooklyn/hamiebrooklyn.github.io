/* PokePon duels — lobby + invites (arena: /duel/play/) */
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
    pollTimer: null,
    selectedAttackerSlot: null,
    selectedItemId: null,
    acceptError: null,
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
    var v = String((els.inviteInput && els.inviteInput.value) || "").trim();
    v = v.replace(/^@+/, "").trim();
    var paren = v.match(/\(@([^)]+)\)\s*$/);
    if (paren) return paren[1].trim();
    return v;
  }

  function clearInviteSuggestions() {
    if (!els.inviteSuggestions) return;
    els.inviteSuggestions.innerHTML = "";
    els.inviteSuggestions.hidden = true;
  }

  function inviteCacheGet(raw) {
    var key = raw.toLowerCase();
    var hit = state.inviteSearchCache[key];
    if (!hit) return null;
    if (Date.now() - hit.ts > 60000) {
      delete state.inviteSearchCache[key];
      return null;
    }
    return hit.users;
  }

  function inviteCacheSet(raw, users) {
    state.inviteSearchCache[raw.toLowerCase()] = { users: users, ts: Date.now() };
  }

  function showInviteSearching() {
    if (!els.inviteSuggestions) return;
    els.inviteSuggestions.innerHTML = '<div class="invite-suggestion-hint">Searching…</div>';
    els.inviteSuggestions.hidden = false;
  }

  function selectPartnerFromSuggestion(u) {
    state.selectedPartnerId = u.id;
    var handle = u.username || "";
    var disp = u.global_name || u.display_name || "";
    if (els.inviteInput) {
      els.inviteInput.value = disp ? disp + " (@" + handle + ")" : "@" + handle;
    }
    clearInviteSuggestions();
  }

  function renderInviteSuggestions(users) {
    if (!els.inviteSuggestions) return;
    els.inviteSuggestions.innerHTML = "";
    users = Array.isArray(users) ? users : [];
    if (!users.length) {
      var empty = document.createElement("div");
      empty.className = "invite-suggestion-hint";
      empty.textContent = "No users in your shared servers match that prefix.";
      els.inviteSuggestions.appendChild(empty);
      els.inviteSuggestions.hidden = false;
      return;
    }
    users.forEach(function (u) {
      if (!u || !u.id) return;
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "invite-suggestion";
      btn.setAttribute("role", "option");
      if (u.avatar_url) {
        var img = document.createElement("img");
        img.className = "invite-suggestion-avatar";
        img.src = u.avatar_url;
        img.alt = "";
        btn.appendChild(img);
      } else {
        var ph = document.createElement("span");
        ph.className = "invite-suggestion-avatar";
        ph.setAttribute("aria-hidden", "true");
        btn.appendChild(ph);
      }
      var meta = document.createElement("span");
      meta.className = "invite-suggestion-meta";
      var handle = document.createElement("span");
      handle.className = "invite-suggestion-handle";
      handle.textContent = "@" + (u.username || "?");
      meta.appendChild(handle);
      var gn = u.global_name || u.display_name || "";
      if (gn) {
        var disp = document.createElement("span");
        disp.className = "invite-suggestion-display";
        disp.textContent = gn;
        meta.appendChild(disp);
      }
      btn.appendChild(meta);
      btn.onclick = function () { selectPartnerFromSuggestion(u); };
      els.inviteSuggestions.appendChild(btn);
    });
    els.inviteSuggestions.hidden = false;
  }

  function scheduleInviteUserSearch() {
    if (!state.authenticated) return;
    clearTimeout(state.inviteSearchDebounce);
    state.selectedPartnerId = null;
    var raw = inviteSearchQuery();
    if (!els.inviteSuggestions) return;
    if (/^\d+$/.test(raw) || !raw) {
      clearInviteSuggestions();
      return;
    }
    var cached = inviteCacheGet(raw);
    if (cached) {
      renderInviteSuggestions(cached);
    } else {
      showInviteSearching();
    }
    state.inviteSearchDebounce = setTimeout(fetchInviteUserSuggestions, cached ? 120 : 35);
  }

  async function fetchInviteUserSuggestions() {
    if (!els.inviteSuggestions || !state.authenticated) return;
    var raw = inviteSearchQuery();
    if (/^\d+$/.test(raw) || !raw) {
      clearInviteSuggestions();
      return;
    }
    if (state.inviteSearchInFlight) state.inviteSearchInFlight.abort();
    var ctrl = new AbortController();
    state.inviteSearchInFlight = ctrl;
    try {
      var r = await apiFetch(
        "/api/me/duel-user-search?q=" + encodeURIComponent(raw) + "&limit=12",
        { signal: ctrl.signal }
      );
      state.inviteSearchInFlight = null;
      if (!r.ok) {
        if (els.inviteSuggestions) {
          els.inviteSuggestions.innerHTML =
            '<div class="invite-suggestion-hint">Could not search users. Try again.</div>';
          els.inviteSuggestions.hidden = false;
        }
        return;
      }
      var body = await r.json();
      var users = body.users || [];
      if (inviteSearchQuery() !== raw) return;
      inviteCacheSet(raw, users);
      renderInviteSuggestions(users);
    } catch (err) {
      state.inviteSearchInFlight = null;
      if (err && err.name === "AbortError") return;
      if (els.inviteSuggestions) {
        els.inviteSuggestions.innerHTML =
          '<div class="invite-suggestion-hint">Could not search users. Try again.</div>';
        els.inviteSuggestions.hidden = false;
      }
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
      await openDuelFromQuery();
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
    var url = base + "/ws/duels/" + encodeURIComponent(String(duelId));
    var tok = readSessionToken();
    if (tok) url += (url.indexOf("?") >= 0 ? "&" : "?") + "session=" + encodeURIComponent(tok);
    return url;
  }

  function applyDuelPayload(body) {
    if (!body) return;
    state.activeDuel = {
      id: body.id,
      status: body.status,
      version: body.version,
      winner_id: body.winner_id,
      bet: body.bet,
      viewer_id: body.viewer_id,
      viewer_role: body.viewer_role,
      starting_player_id: body.starting_player_id,
    };
    state.activeState = body.state || {};
    renderRoom();
  }

  async function loadDuelSnapshot(duelId) {
    try {
      var r = await apiFetch("/api/me/duels/" + encodeURIComponent(String(duelId)));
      if (!r.ok) return false;
      var body = await r.json();
      applyDuelPayload(body);
      return true;
    } catch (_) {
      return false;
    }
  }

  function isDuelFinished() {
    var d = state.activeDuel || {};
    var st = state.activeState || {};
    return d.status === "completed" || d.status === "cancelled" || d.status === "expired" ||
      d.status === "declined" || d.winner_id != null || st.winner != null;
  }

  function disconnectWs() {
    if (state.ws) {
      try { state.ws.onopen = null; state.ws.onmessage = null; state.ws.onerror = null; state.ws.onclose = null; state.ws.close(); } catch (_) {}
    }
    state.ws = null;
    state.wsConnected = false;
  }

  function isViewerPartner(body) {
    if (!body) return false;
    if (body.viewer_role === "partner") return true;
    var meId = String(body.viewer_id || (state.me && state.me.id) || "");
    var partnerId = String((body.partner && body.partner.id) || "");
    return !!(meId && partnerId && meId === partnerId);
  }

  function duelErrorMessage(payload, fallback) {
    if (!payload || typeof payload !== "object") return fallback;
    return payload.message || payload.error || fallback;
  }

  async function fetchDuelDetail(duelId) {
    try {
      var r = await apiFetch("/api/me/duels/" + encodeURIComponent(String(duelId)));
      if (!r.ok) return null;
      return await r.json();
    } catch (_) {
      return null;
    }
  }

  async function acceptIfNeeded(duelId) {
    state.acceptError = null;
    try {
      var body = await fetchDuelDetail(duelId);
      if (!body) return null;
      if (body.status === "active") return body;
      if (body.status !== "invited" || !isViewerPartner(body)) return body;

      var ar = await apiFetch(
        "/api/me/duels/" + encodeURIComponent(String(duelId)) + "/accept",
        { method: "POST" }
      );
      var accepted = await ar.json().catch(function () { return {}; });
      if (ar.ok && accepted && accepted.status === "active") return accepted;

      var fresh = await fetchDuelDetail(duelId);
      if (fresh && fresh.status === "active") return fresh;

      var msg = duelErrorMessage(accepted, "Could not accept duel invite.");
      state.acceptError = msg;
      if (els.log) els.log.textContent = msg;
      return fresh || body;
    } catch (_) {
      state.acceptError = "Network error while accepting invite.";
      return null;
    }
  }

  async function openDuelFromQuery() {
    var id = duelIdFromQuery();
    if (!id || !state.authenticated) return;
    try {
      var r = await apiFetch("/api/me/duels/" + encodeURIComponent(String(id)));
      if (!r.ok) return;
      await enterRoom(id);
    } catch (_) {
      /* invite may still appear in list */
    }
  }

  function startRoomPolling(duelId) {
    stopRoomPolling();
    function tick() {
      var d = state.activeDuel || {};
      if (Number(d.id) !== Number(duelId)) {
        stopRoomPolling();
        return;
      }
      if (d.status !== "invited" && d.status !== "active") {
        stopRoomPolling();
        return;
      }
      loadDuelSnapshot(duelId);
    }
    tick();
    state.pollTimer = setInterval(tick, state.wsConnected ? 15000 : 3000);
  }

  function stopRoomPolling() {
    if (state.pollTimer) {
      clearInterval(state.pollTimer);
      state.pollTimer = null;
    }
  }

  function playArenaUrl(duelId) {
    var q = "?duel=" + encodeURIComponent(String(duelId));
    var apiParam = new URLSearchParams(window.location.search).get("api");
    if (!apiParam) {
      try { apiParam = localStorage.getItem("pokepon-api-base") || ""; } catch (_) { apiParam = ""; }
    }
    if (!apiParam && API_BASE) apiParam = API_BASE;
    if (apiParam) q += "&api=" + encodeURIComponent(apiParam);
    return "/duel/play/" + q;
  }

  async function enterRoom(duelId) {
    duelId = Number(duelId);
    if (!duelId) return;
    window.location.href = playArenaUrl(duelId);
  }

  function leaveRoom() {
    stopRoomPolling();
    disconnectWs();
    state.activeDuel = null;
    state.activeState = null;
    state.selectedAttackerSlot = null;
    state.selectedItemId = null;
    state.acceptError = null;
    if (els.yourDeck) els.yourDeck.innerHTML = "";
    if (els.oppDeck) els.oppDeck.innerHTML = "";
    if (els.itemsHand) els.itemsHand.innerHTML = "";
    if (els.log) els.log.textContent = "";
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
    ws.onopen = function () {
      state.wsConnected = true;
      if (state.activeDuel && state.activeDuel.id === duelId) startRoomPolling(duelId);
    };
    ws.onmessage = function (ev) {
      var msg;
      try { msg = JSON.parse(ev.data); } catch (_) { return; }
      if (!msg) return;
      if (msg.type === "state") {
        var prev = state.activeDuel || {};
        var duel = msg.duel || {};
        state.activeDuel = Object.assign({}, prev, duel);
        if (prev.viewer_id != null && state.activeDuel.viewer_id == null) {
          state.activeDuel.viewer_id = prev.viewer_id;
        }
        if (prev.viewer_role != null && state.activeDuel.viewer_role == null) {
          state.activeDuel.viewer_role = prev.viewer_role;
        }
        state.activeState = msg.state || {};
        renderRoom();
        if (isDuelFinished()) {
          setTimeout(function () {
            if (isDuelFinished()) loadDuels();
          }, 800);
        }
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
    var finished = isDuelFinished();
    var invited = d.status === "invited";
    if (els.roomMeta) {
      var meta = "Status: " + (d.status || "—") +
        " · version: " + Number(d.version || 0);
      if (!finished && !invited) {
        meta += " · turn: " + (st.turn ? String(st.turn) : "—") +
          " · draws left: " + Number(st.draws_remaining || 0);
      }
      els.roomMeta.textContent = meta;
    }
    if (els.coinFace) {
      if (finished) els.coinFace.textContent = "END";
      else if (invited) els.coinFace.textContent = "…";
      else els.coinFace.textContent = isMyTurn() ? "YOU" : "THEM";
    }
    if (els.stakes) {
      els.stakes.textContent = "Stake: " + fmtBet(d.bet && d.bet.currency, d.bet && d.bet.amount);
    }
    if (els.drawHint) {
      if (finished) {
        var won = d.winner_id != null && String(d.winner_id) === me;
        els.drawHint.textContent = won ? "You won this duel." : "Duel finished.";
      } else if (invited) {
        if (state.acceptError) {
          els.drawHint.textContent = state.acceptError;
        } else if ((state.activeDuel && state.activeDuel.viewer_role) === "partner") {
          els.drawHint.textContent = "Accepting invite…";
        } else {
          els.drawHint.textContent =
            "Waiting for opponent to accept the invite… (they need a saved deck on Deck editor)";
        }
      } else if (!state.wsConnected) {
        els.drawHint.textContent = "Connecting…";
      } else if (isMyTurn()) {
        els.drawHint.textContent = "Draw up to 2 cards (2 from one stack or 1+1).";
      } else {
        els.drawHint.textContent = "Waiting for opponent…";
      }
    }
    var drawsRemaining = Number(st.draws_remaining || 0);
    var canPlay = !finished && !invited && state.wsConnected;
    if (els.drawEnergy) els.drawEnergy.disabled = !canPlay || !isMyTurn() || drawsRemaining <= 0;
    if (els.drawItem) els.drawItem.disabled = !canPlay || !isMyTurn() || drawsRemaining <= 0;
    if (els.btnEndTurn) els.btnEndTurn.disabled = !canPlay || !isMyTurn();
    if (els.btnSurrender) els.btnSurrender.disabled = !canPlay || d.status !== "active";

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
      els.inviteInput.addEventListener("paste", function () {
        setTimeout(scheduleInviteUserSearch, 0);
      });
      els.inviteInput.addEventListener("keydown", function (e) {
        if (e.key === "Enter") { e.preventDefault(); sendInvite(); }
      });
    }
    document.addEventListener("click", function (e) {
      if (!els.inviteSuggestions || els.inviteSuggestions.hidden) return;
      var wrap = document.querySelector(".duel-field-invite");
      if (wrap && !wrap.contains(e.target)) clearInviteSuggestions();
    });
    if (els.btnInvite) els.btnInvite.addEventListener("click", sendInvite);
    if (els.btnLeave) els.btnLeave.addEventListener("click", leaveRoom);
    if (els.btnSurrender) els.btnSurrender.addEventListener("click", function () {
      var did = (state.activeDuel && state.activeDuel.id) || duelIdFromQuery();
      if (!did) return;
      if (els.btnSurrender.disabled) return;
      els.btnSurrender.disabled = true;
      apiFetch("/api/me/duels/" + encodeURIComponent(String(did)) + "/surrender", { method: "POST" })
        .then(function (r) {
          return r.json().catch(function () { return {}; }).then(function (body) {
            return { ok: r.ok, body: body };
          });
        })
        .then(function (res) {
          if (res.ok && res.body) applyDuelPayload(res.body);
          if (els.log) {
            els.log.textContent = res.ok ? "You surrendered." : ((res.body && res.body.message) || "Could not surrender.");
          }
          if (res.ok) {
            setTimeout(function () {
              leaveRoom();
              loadDuels();
            }, 600);
          } else if (els.btnSurrender) {
            els.btnSurrender.disabled = false;
          }
        })
        .catch(function () {
          if (els.log) els.log.textContent = "Network error while surrendering.";
          if (els.btnSurrender) els.btnSurrender.disabled = false;
        });
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
  }

  boot();
})();

