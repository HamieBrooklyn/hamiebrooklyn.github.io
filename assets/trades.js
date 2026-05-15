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
    pickerQuery: "",
    pickerPage: 1,
    pickerTotal: 0,
    pickerDebounce: 0,
    pickerInflight: null,
    selectedPartnerId: null,
    inviteSearchDebounce: 0,
    inviteSearchInFlight: null,
  };

  var els = {
    sidebarUser: document.getElementById("sidebar-user"),
    userAvatar: document.getElementById("user-avatar"),
    userName: document.getElementById("user-name"),
    btnLogin: document.getElementById("btn-login"),
    btnLogout: document.getElementById("btn-logout"),
    inviteSection: document.getElementById("trade-invite-section"),
    inviteInput: document.getElementById("invite-input"),
    inviteSuggestions: document.getElementById("invite-suggestions"),
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
    modal: document.getElementById("card-modal"),
    modalImg: document.getElementById("modal-img"),
    modalTitle: document.getElementById("modal-title"),
    modalSet: document.getElementById("modal-set"),
    modalRarity: document.getElementById("modal-rarity"),
    modalHp: document.getElementById("modal-hp"),
    modalDamage: document.getElementById("modal-damage"),
    modalTypes: document.getElementById("modal-types"),
    modalPid: document.getElementById("modal-pid"),
    modalAttacksSection: document.getElementById("modal-attacks-section"),
    modalAttacks: document.getElementById("modal-attacks"),
    modalObtained: document.getElementById("modal-obtained"),
    modalCopyId: document.getElementById("modal-copy-id"),
  };

  function fmtPd(n) { return "₽" + Number(n || 0).toLocaleString(); }
  function fmtCr(n) { return "💎 " + Number(n || 0).toLocaleString(); }

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
      navigator.clipboard.writeText(pid).then(function () { flash(true); }).catch(function () { fallbackCopy(); });
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

  /** Build collection-shaped item for the card modal from a trade-side card entry. */
  function tradeModalItemFromSide(c) {
    if (!c || c.missing) return null;
    if (c.card) {
      return { public_id: c.public_id, obtained_at: c.obtained_at, card: c.card };
    }
    return {
      public_id: c.public_id,
      obtained_at: c.obtained_at,
      card: {
        name: c.name,
        set_name: c.set_name,
        collector_number: c.collector_number,
        image_small_url: c.image_small_url,
        image_large_url: c.image_large_url,
      },
    };
  }

  function tradeChipThumbUrl(c) {
    if (!c || c.missing) return "";
    if (c.card && c.card.image_small_url) return c.card.image_small_url;
    return c.image_small_url || "";
  }

  function tradeChipLabel(c) {
    if (!c || c.missing) return "Missing";
    if (c.card && c.card.name) return c.card.name;
    return c.name || "Card";
  }

  function openTradeCardModal(item) {
    if (!item || !els.modal) return;
    var card = item.card || {};
    var rarity = card.rarity || {};
    els.modalImg.src = card.image_large_url || card.image_small_url || "";
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
      els.modalObtained.textContent =
        "Obtained " + d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
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

    els.modal.hidden = false;
    els.modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
  }

  function closeTradeCardModal() {
    if (!els.modal) return;
    els.modal.hidden = true;
    els.modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
  }

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
    var body;
    if (state.selectedPartnerId) {
      body = { partner_id: String(state.selectedPartnerId) };
    } else if (/^\d+$/.test(val)) {
      body = { partner_id: val };
    } else {
      body = { partner_username: val };
    }
    try {
      var r = await apiFetch("/api/me/trades", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      var j = await r.json();
      if (!r.ok) throw new Error(j.message || j.error || "Failed");
      if (els.inviteMsg) els.inviteMsg.innerHTML = '<div class="trade-msg-ok">Invite sent!</div>';
      els.inviteInput.value = "";
      state.selectedPartnerId = null;
      clearInviteSuggestions();
      loadList();
    } catch (e) {
      if (els.inviteMsg) els.inviteMsg.innerHTML = '<div class="trade-msg-err">' + String(e.message || e) + "</div>";
    }
  }

  function clearInviteSuggestions() {
    if (!els.inviteSuggestions) return;
    els.inviteSuggestions.innerHTML = "";
    els.inviteSuggestions.hidden = true;
  }

  function selectPartnerFromSuggestion(u) {
    state.selectedPartnerId = u.id;
    var handle = u.username || "";
    var disp = u.global_name || u.display_name || "";
    els.inviteInput.value = disp ? disp + " (@" + handle + ")" : "@" + handle;
    clearInviteSuggestions();
  }

  function inviteSearchQuery() {
    var v = (els.inviteInput && els.inviteInput.value || "").trim();
    return v.replace(/^@+/, "").trim();
  }

  function scheduleInviteUserSearch() {
    clearTimeout(state.inviteSearchDebounce);
    state.selectedPartnerId = null;
    var raw = inviteSearchQuery();
    if (!els.inviteSuggestions) return;
    if (/^\d+$/.test(raw) || !raw) {
      clearInviteSuggestions();
      return;
    }
    state.inviteSearchDebounce = setTimeout(fetchInviteUserSuggestions, 150);
  }

  async function fetchInviteUserSuggestions() {
    if (!els.inviteSuggestions || !state.authenticated) return;
    var raw = inviteSearchQuery();
    if (/^\d+$/.test(raw) || !raw) {
      clearInviteSuggestions();
      return;
    }
    if (state.inviteSearchInflight) state.inviteSearchInflight.abort();
    var ctrl = new AbortController();
    state.inviteSearchInflight = ctrl;
    try {
      var r = await apiFetch(
        "/api/me/trade-user-search?q=" + encodeURIComponent(raw) + "&limit=12",
        { signal: ctrl.signal }
      );
      state.inviteSearchInflight = null;
      if (!r.ok) {
        clearInviteSuggestions();
        return;
      }
      var j = await r.json();
      var users = j.users || [];
      els.inviteSuggestions.innerHTML = "";
      if (!users.length) {
        var empty = document.createElement("div");
        empty.className = "invite-suggestion-hint";
        empty.textContent = "No users in bot servers match that prefix.";
        els.inviteSuggestions.appendChild(empty);
        els.inviteSuggestions.hidden = false;
        return;
      }
      users.forEach(function (u) {
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
    } catch (e) {
      state.inviteSearchInflight = null;
      if (e.name === "AbortError") return;
      clearInviteSuggestions();
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
      if (c.missing) {
        var miss = document.createElement("div");
        miss.className = "trade-card-chip trade-card-chip-missing";
        miss.textContent = "Missing instance #" + c.instance_id;
        container.appendChild(miss);
        return;
      }
      var row = document.createElement("div");
      row.className = "trade-card-chip";
      var hit = document.createElement("button");
      hit.type = "button";
      hit.className = "trade-card-chip-hit";
      var thumb = tradeChipThumbUrl(c);
      if (thumb) {
        var img = document.createElement("img");
        img.src = thumb;
        img.alt = "";
        hit.appendChild(img);
      }
      var sp = document.createElement("span");
      sp.textContent = tradeChipLabel(c);
      hit.appendChild(sp);
      var modalItem = tradeModalItemFromSide(c);
      hit.onclick = function () {
        if (modalItem) openTradeCardModal(modalItem);
      };
      row.appendChild(hit);
      if (removable) {
        var rm = document.createElement("button");
        rm.type = "button";
        rm.className = "remove-card";
        rm.setAttribute("aria-label", "Remove card from offer");
        rm.textContent = "×";
        rm.onclick = function (ev) {
          ev.stopPropagation();
          removeCard(c.instance_id);
        };
        row.appendChild(rm);
      }
      container.appendChild(row);
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

  // ---- Card picker (server-side search, same as collection page) ----
  var PICKER_PAGE_SIZE = 60;

  function buildPickerPath() {
    var qs = new URLSearchParams();
    qs.set("page", String(state.pickerPage));
    qs.set("page_size", String(PICKER_PAGE_SIZE));
    qs.set("sort", "newest");
    if (state.pickerQuery) qs.set("q", state.pickerQuery);
    return "/api/me/collection?" + qs.toString();
  }

  async function loadMyCollection() {
    if (state.pickerInflight) { state.pickerInflight.abort(); }
    var ctrl = new AbortController();
    state.pickerInflight = ctrl;
    try {
      var r = await apiFetch(buildPickerPath(), { signal: ctrl.signal });
      if (!r.ok) return;
      var j = await r.json();
      state.pickerInflight = null;
      state.myCards = (j.items || []).map(function (c) {
        return {
          instance_id: c.instance_id,
          public_id: c.public_id,
          name: c.card ? c.card.name : "Card",
          set_info: c.card ? ((c.card.set_name || "") + " #" + (c.card.collector_number || "")) : "",
          image_small_url: c.card ? c.card.image_small_url : null,
        };
      });
      state.pickerTotal = Number(j.total) || 0;
      renderPicker();
    } catch (e) {
      if (e.name === "AbortError") return;
      state.pickerInflight = null;
    }
  }

  function pickerSearchChanged() {
    var value = (els.pickerSearch.value || "").trim();
    clearTimeout(state.pickerDebounce);
    state.pickerDebounce = setTimeout(function () {
      if (value === state.pickerQuery) return;
      state.pickerQuery = value;
      state.pickerPage = 1;
      loadMyCollection();
    }, 280);
  }

  function renderPicker() {
    if (!els.pickerResults) return;
    els.pickerResults.innerHTML = "";
    if (!state.myCards.length) {
      if (state.pickerQuery) {
        els.pickerResults.innerHTML = '<div class="trade-muted">No cards match "' + state.pickerQuery + '"</div>';
      }
      return;
    }
    state.myCards.forEach(function (c) {
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
    var totalPages = Math.max(1, Math.ceil(state.pickerTotal / PICKER_PAGE_SIZE));
    if (totalPages > 1) {
      var nav = document.createElement("div");
      nav.className = "picker-pager";
      var prev = document.createElement("button");
      prev.type = "button";
      prev.className = "btn-small";
      prev.textContent = "← Prev";
      prev.disabled = state.pickerPage <= 1;
      prev.onclick = function () { if (state.pickerPage > 1) { state.pickerPage--; loadMyCollection(); } };
      var info = document.createElement("span");
      info.className = "trade-muted";
      info.textContent = " Page " + state.pickerPage + " of " + totalPages + " ";
      var next = document.createElement("button");
      next.type = "button";
      next.className = "btn-small";
      next.textContent = "Next →";
      next.disabled = state.pickerPage >= totalPages;
      next.onclick = function () { if (state.pickerPage < totalPages) { state.pickerPage++; loadMyCollection(); } };
      nav.appendChild(prev);
      nav.appendChild(info);
      nav.appendChild(next);
      els.pickerResults.appendChild(nav);
    }
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
    if (els.inviteInput) {
      els.inviteInput.addEventListener("input", scheduleInviteUserSearch);
      els.inviteInput.addEventListener("paste", function () {
        setTimeout(scheduleInviteUserSearch, 0);
      });
      els.inviteInput.addEventListener("keydown", function (e) { if (e.key === "Enter") sendInvite(); });
    }
    document.addEventListener("click", function (e) {
      if (!els.inviteSuggestions || els.inviteSuggestions.hidden) return;
      var wrap = document.querySelector(".trade-field-invite");
      if (wrap && !wrap.contains(e.target)) clearInviteSuggestions();
    });
    if (els.btnReady) els.btnReady.addEventListener("click", toggleReady);
    if (els.btnCancelTrade) els.btnCancelTrade.addEventListener("click", function () {
      if (state.activeTrade) cancelTrade(state.activeTrade.id);
    });
    if (els.btnSaveSide) els.btnSaveSide.addEventListener("click", saveSide);
    if (els.pickerSearch) els.pickerSearch.addEventListener("input", pickerSearchChanged);

    document.addEventListener("click", function (e) {
      var t = e.target;
      if (t && t.dataset && t.dataset.close !== undefined) closeTradeCardModal();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && els.modal && !els.modal.hidden) closeTradeCardModal();
    });
    if (els.modalCopyId && els.modalPid) {
      els.modalCopyId.addEventListener("click", function () {
        copyCardId(els.modalPid.textContent, els.modalCopyId);
      });
    }

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
