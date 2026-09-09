/* PokePon physical TCG tabletop. All legal moves and private views come from the server. */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const API = (window.POKEPON_API_BASE || "").replace(/\/+$/, "");
  const SESSION = "pokepon-session";
  const state = {
    user: null, lobby: null, game: null, view: "home", busy: false,
    socket: null, socketGeneration: 0, reconnectTimer: null, reconnectAttempt: 0,
    connected: false, cards: new Map(), catalog: [], catalogTotal: 0, catalogPage: 1,
    catalogPageSize: 24, catalogRequest: 0, decks: [], entries: new Map(), deckId: null,
    catalogAbort: null, inspect: null, choiceId: null, choiceSelected: new Set(), toastTimer: null,
  };
  const esc = (value) => String(value == null ? "" : value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const attr = esc;
  const readToken = () => { try { return localStorage.getItem(SESSION) || ""; } catch (_) { return ""; } };
  const storeToken = (token) => { try { token ? localStorage.setItem(SESSION, token) : localStorage.removeItem(SESSION); } catch (_) {} };
  const myId = () => String(state.user?.id || "");
  const cardId = (card) => String(card?.id || card?.card_id || "");
  const nameOf = (card) => card?.name || "Unknown card";
  const getCard = (value) => value?.card || state.cards.get(String(value?.card_id || value?.id || value)) || (typeof value === "object" ? value : { id: value, name: value });
  const imageOf = (card) => safeImage(card?.image_url || card?.images?.small || card?.images?.large || card?.image_small || "");
  const quantity = () => Array.from(state.entries.values()).reduce((a, b) => a + Number(b || 0), 0);
  const busyAttr = () => state.busy ? " disabled" : "";
  function safeImage(url) {
    try { const value = new URL(url, location.origin); return ["https:", "http:"].includes(value.protocol) && url ? value.href : ""; } catch (_) { return ""; }
  }
  function remember(card) { if (cardId(card)) state.cards.set(cardId(card), { ...state.cards.get(cardId(card)), ...card }); return card; }
  function entriesPayload() { return Array.from(state.entries, ([card_id, quantity]) => ({ card_id, quantity })).filter((e) => e.quantity > 0); }
  function loadEntries(entries) {
    state.entries = new Map();
    for (const entry of entries || []) {
      const id = String(entry.card_id || entry.id || entry.card?.id || "");
      if (!id) continue;
      if (entry.card) remember(entry.card);
      state.entries.set(id, Number(entry.quantity || entry.count || 0));
    }
  }
  function uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return Array.from(crypto.getRandomValues(new Uint8Array(16)), (v) => v.toString(16).padStart(2, "0")).join("");
  }
  function notice(message, error = false) {
    $("tcg-notice").hidden = !message;
    $("tcg-notice").textContent = message || "";
    $("tcg-notice").classList.toggle("error", error);
  }
  function toast(message) {
    clearTimeout(state.toastTimer);
    $("tcg-toast").textContent = message;
    $("tcg-toast").hidden = false;
    state.toastTimer = setTimeout(() => { $("tcg-toast").hidden = true; }, 4500);
  }
  async function request(path, options = {}) {
    const headers = { "ngrok-skip-browser-warning": "1", ...options.headers };
    if (readToken()) headers.Authorization = "Bearer " + readToken();
    if (options.body && typeof options.body !== "string") { headers["Content-Type"] = "application/json"; options.body = JSON.stringify(options.body); }
    const response = await fetch(API + path, { ...options, headers, credentials: "include" });
    let body;
    try { body = await response.json(); } catch (_) { body = {}; }
    if (!response.ok) {
      const details = body.errors || body.details;
      const detailText = Array.isArray(details) ? details.map((e) => typeof e === "string" ? e : e.message || e.reason || JSON.stringify(e)).join(" · ") : "";
      const error = new Error(detailText || body.message || (typeof body.error === "string" ? body.error : body.error?.message) || (response.status === 404 ? "TCG Tabletop is not enabled on this server yet." : "The table could not complete that request. Please try again."));
      error.status = response.status;
      error.body = body;
      throw error;
    }
    return body;
  }
  function showView(view) {
    state.view = view;
    document.body.classList.toggle("tcg-in-game", view === "game");
    for (const name of ["home", "lobby", "game", "workshop"]) $("tcg-" + name).hidden = name !== view;
    $("tcg-loading").hidden = true;
  }
  function applyEnvelope(body) {
    if (!body?.lobby) return;
    if (state.lobby && state.lobby.id === body.lobby.id && Number(body.lobby.version) < Number(state.lobby.version)) return;
    const oldGameVersion = state.game?.version;
    state.lobby = body.lobby;
    state.game = body.game || null;
    for (const entry of body.lobby.own_deck || []) if (entry.card) remember(entry.card);
    if (state.game?.board) for (const board of Object.values(state.game.board)) {
      for (const entry of [...(Array.isArray(board.hand) ? board.hand : []), ...(board.discard || []), ...(board.bench || []), ...(board.active ? [board.active] : [])]) {
        if (entry.card) remember(entry.card);
        for (const attachment of entry.attachments || []) if (attachment.card) remember(attachment.card);
      }
    }
    if (oldGameVersion != null && oldGameVersion !== state.game?.version && state.inspect) closeDialog();
    if (state.view !== "workshop") showView(state.game ? "game" : "lobby");
    renderLobby();
    if (state.game) renderGame();
    const url = new URL(location.href);
    url.searchParams.set("code", body.lobby.code);
    url.searchParams.delete("lobby");
    history.replaceState(null, "", url.pathname + url.search);
    try { sessionStorage.setItem("pokepon-tcg-lobby", body.lobby.id); } catch (_) {}
  }
  function disconnect() {
    state.socketGeneration++;
    clearTimeout(state.reconnectTimer);
    if (state.socket) { state.socket.onclose = null; state.socket.close(); state.socket = null; }
    state.connected = false;
  }
  function connect() {
    disconnect();
    if (!state.lobby) return;
    const generation = state.socketGeneration;
    const url = new URL(API + "/api/tcg/lobbies/" + encodeURIComponent(state.lobby.id) + "/ws", location.origin);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(url.href);
    state.socket = socket;
    socket.onopen = () => {
      if (generation !== state.socketGeneration) return;
      if (readToken()) socket.send(JSON.stringify({ type: "auth", token: readToken() }));
    };
    socket.onmessage = (event) => {
      if (generation !== state.socketGeneration) return;
      let body;
      try { body = JSON.parse(event.data); } catch (_) { return; }
      if (body.type === "ping") { socket.send(JSON.stringify({ type: "pong" })); return; }
      if (body.type === "error") { notice(body.message || body.error || "The live connection needs to reconnect.", true); return; }
      if (body.lobby || body.type === "state") {
        state.connected = true;
        state.reconnectAttempt = 0;
        applyEnvelope(body);
      }
    };
    socket.onclose = () => {
      if (generation !== state.socketGeneration || !state.lobby) return;
      state.connected = false;
      if (state.game) renderGame(); else renderLobby();
      const delay = Math.min(15000, 1000 * 2 ** Math.min(state.reconnectAttempt++, 4));
      state.reconnectTimer = setTimeout(async () => {
        if (generation !== state.socketGeneration) return;
        try { applyEnvelope(await request("/api/tcg/lobbies/" + encodeURIComponent(state.lobby.id))); }
        catch (error) { if ([401, 403, 404].includes(error.status)) { notice(error.message, true); disconnect(); return; } }
        connect();
      }, delay);
    };
    socket.onerror = () => { /* onclose handles reconnection */ };
  }
  async function command(action) {
    if (state.busy || !state.lobby) return false;
    state.busy = true;
    const lobbyId = state.lobby.id;
    notice("");
    renderCurrent();
    try {
      const body = await request("/api/tcg/lobbies/" + encodeURIComponent(lobbyId) + "/commands", { method: "POST", body: { command_id: uuid(), version: state.lobby.version, action } });
      if (action.type === "leave") { leaveLocal(); await loadTables(); return true; }
      applyEnvelope(body);
      return true;
    } catch (error) {
      notice(error.message, true);
      try { applyEnvelope(await request("/api/tcg/lobbies/" + encodeURIComponent(lobbyId))); } catch (_) {}
      return false;
    } finally { state.busy = false; renderCurrent(); }
  }
  function renderCurrent() {
    if (state.game) renderGame();
    else if (state.lobby) renderLobby();
  }
  function leaveLocal() {
    disconnect();
    state.lobby = null;
    state.game = null;
    const url = new URL(location.href);
    url.searchParams.delete("code");
    url.searchParams.delete("lobby");
    history.replaceState(null, "", url.pathname + url.search);
    try { sessionStorage.removeItem("pokepon-tcg-lobby"); } catch (_) {}
    showView("home");
  }
  async function enterTable(body) { applyEnvelope(body); connect(); }
  async function join(code) {
    if (!state.user || state.busy) return;
    try { if (/^https?:/i.test(code)) code = new URL(code).searchParams.get("code") || ""; } catch (_) {}
    if (!code.trim()) return;
    state.busy = true;
    try { await enterTable(await request("/api/tcg/lobbies/join", { method: "POST", body: { code: code.trim().toUpperCase() } })); notice(""); }
    catch (error) { notice(error.message, true); }
    finally { state.busy = false; renderCurrent(); }
  }
  async function loadTables() {
    try {
      const body = await request("/api/tcg/lobbies");
      const lobbies = body.lobbies || [];
      $("active-tables-panel").hidden = !lobbies.length;
      $("active-tables").innerHTML = lobbies.map((l) => '<div class="tcg-table-row"><div><strong>' + esc(l.code) + '</strong><small>' + esc(modeLabel(l)) + ' · ' + esc(l.status || "Waiting") + '</small></div><button class="tcg-btn tcg-btn-outline" data-resume="' + attr(l.id) + '" type="button">Return to table →</button></div>').join("");
    } catch (error) { notice(error.message, true); }
  }
  function modeLabel(lobby = state.lobby) { return lobby?.source === "owned" ? (lobby.mixed ? "Owned + Mixed" : "Owned collection") : "Global catalog"; }
  function connectionPill() { return '<span class="tcg-pill"><span class="tcg-dot' + (state.connected ? "" : " offline") + '"></span>' + (state.connected ? "Live" : "Reconnecting…") + '</span>'; }
  function renderLobby() {
    const lobby = state.lobby;
    if (!lobby) return;
    const players = lobby.players || [];
    const own = players.find((p) => String(p.id) === myId());
    const host = String(lobby.host_id) === myId();
    const allReady = players.length === 2 && players.every((p) => p.ready);
    const seat = (p, index) => p ? '<div class="tcg-seat"><div class="tcg-seat-avatar">' + esc((p.name || "T").slice(0, 1).toUpperCase()) + '</div><div class="tcg-seat-info"><strong>' + esc(p.name || "Trainer") + (String(p.id) === myId() ? ' <span>(you)</span>' : '') + '</strong><span>' + (Number(p.deck_count) === 60 ? '60-card deck selected' : Number(p.deck_count || 0) + ' / 60 cards selected') + (String(p.id) === String(lobby.host_id) ? ' · Host' : '') + '</span></div><span class="' + (p.ready ? 'tcg-ready' : 'tcg-waiting') + '">' + (p.ready ? 'Ready ✓' : 'Preparing') + '</span></div>' : '<div class="tcg-seat empty"><div class="tcg-seat-avatar">+</div><div class="tcg-seat-info"><strong>Waiting for a friend</strong><span>Share the invite to fill seat ' + (index + 1) + '.</span></div></div>';
    $("tcg-lobby").innerHTML = '<div class="tcg-lobby-header"><div><p class="tcg-eyebrow">Your table</p><h2>Let’s set up.</h2></div><div class="tcg-row"><span class="tcg-lobby-code">' + esc(lobby.code) + '</span><button class="tcg-btn tcg-btn-outline" data-do="copy-invite" type="button">Copy invite ↗</button></div></div><div class="tcg-lobby-layout"><section class="tcg-panel"><div class="tcg-section-title"><h3>Two seats. One game.</h3>' + connectionPill() + '</div><p class="tcg-muted">Choose your deck, then ready up. Both players must be ready before the host starts.</p>' + seat(players[0], 0) + seat(players[1], 1) + '<div class="tcg-lobby-actions"><button class="tcg-btn tcg-btn-outline" data-do="edit-lobby-deck" type="button"' + (state.busy || (lobby.mixed && players.length < 2) ? ' disabled' : '') + '>Build your deck</button><button class="tcg-btn tcg-btn-outline" data-do="starter" type="button"' + (state.busy || (lobby.mixed && players.length < 2) ? ' disabled' : '') + '>Use starter deck</button><button class="tcg-btn ' + (own?.ready ? 'tcg-btn-outline' : 'tcg-btn-gold') + '" data-do="ready" type="button"' + (state.busy || (!own?.ready && Number(own?.deck_count) !== 60) ? ' disabled' : '') + '>' + (own?.ready ? 'Unready' : 'Ready to play ✓') + '</button>' + (host ? '<button class="tcg-btn tcg-btn-gold" data-do="start" type="button"' + (state.busy || !allReady ? ' disabled' : '') + '>Start game →</button>' : '') + '</div>' + (lobby.mixed && players.length < 2 ? '<p class="tcg-fineprint">Mixed deck building opens when your opponent joins, so both collections are available.</p>' : '') + '</section><aside class="tcg-panel tcg-lobby-settings"><h3>Table settings</h3><label for="lobby-source">Deck source</label><select class="tcg-input" id="lobby-source"' + (!host || state.busy ? ' disabled' : '') + '><option value="global"' + (lobby.source === 'global' ? ' selected' : '') + '>Global catalog</option><option value="owned"' + (lobby.source === 'owned' ? ' selected' : '') + '>Owned collection</option></select>' + (lobby.source === 'owned' ? '<label class="tcg-toggle-row"><input id="lobby-mixed" type="checkbox"' + (lobby.mixed ? ' checked' : '') + (!host || state.busy ? ' disabled' : '') + '><span><strong>Mixed — share collections</strong><small>Both players can use cards from either collection.</small></span></label>' : '') + '<div class="tcg-format-line"><span class="tcg-label">Format</span><span>Casual · all catalog eras</span></div><p class="tcg-sharing-note">' + (lobby.mixed ? 'Each player independently gets the combined quantity of each printing. You may both play the same shared cards. Nothing is transferred or consumed.' : lobby.source === 'owned' ? 'Each player uses their own copies, including Basic Energy. Your cards stay in your collection throughout the match.' : 'Both players can build from playable global cards without owning them. Normal deck construction rules apply.') + '</p><p class="tcg-fineprint">Changing a deck or table setting clears readiness. Your match uses a snapshot of the eligible cards when it starts.</p><button class="tcg-btn tcg-btn-quiet" data-do="leave" type="button"' + busyAttr() + '>Leave table</button></aside></div>';
  }
  async function copyInvite() {
    const url = new URL(location.href);
    url.searchParams.delete("api");
    url.searchParams.set("code", state.lobby.code);
    try { await navigator.clipboard.writeText(url.href); toast("Invite copied. Send it to your friend."); }
    catch (_) { openDialog("Invite your friend", '<p class="tcg-muted">Copy this link to invite the second player.</p><input class="tcg-input" readonly value="' + attr(url.href) + '" aria-label="Invite link">'); $("dialog-body").querySelector("input").select(); }
  }
  async function loadDecks() {
    const body = await request("/api/tcg/decks");
    state.decks = body.decks || [];
    for (const deck of state.decks) for (const e of deck.entries || []) if (e.card) remember(e.card);
    $("saved-decks").innerHTML = '<option value="">New deck</option>' + state.decks.map((d) => '<option value="' + attr(d.id) + '">' + esc(d.name) + '</option>').join("");
    $("saved-decks").value = state.deckId || "";
  }
  async function openWorkshop() {
    if (state.game) return;
    if (state.lobby?.mixed && state.lobby.players.length < 2) return;
    state.deckId = null;
    loadEntries(state.lobby?.own_deck || []);
    $("deck-name").value = "";
    $("workshop-source").textContent = modeLabel() + (state.lobby ? " · Table " + state.lobby.code : "");
    $("close-workshop").textContent = state.lobby ? "← Back to table" : "← Back to tables";
    $("use-deck").hidden = !state.lobby;
    $("deck-validation").textContent = "";
    showView("workshop");
    renderDeck();
    state.catalogPage = 1;
    try { await loadDecks(); } catch (error) { notice(error.message, true); }
    await loadCatalog();
  }
  async function loadCatalog() {
    state.catalogAbort?.abort();
    const abort = new AbortController();
    state.catalogAbort = abort;
    const requestId = ++state.catalogRequest;
    $("catalog-status").textContent = "Finding cards…";
    const params = new URLSearchParams({ q: $("catalog-search").value.trim(), page: state.catalogPage, page_size: state.catalogPageSize });
    if ($("catalog-type").value) params.set("supertype", $("catalog-type").value);
    if ($("catalog-supported").checked) params.set("supported", "1");
    if (state.lobby) params.set("lobby_id", state.lobby.id);
    try {
      const body = await request("/api/tcg/catalog?" + params, { signal: abort.signal });
      if (requestId !== state.catalogRequest) return;
      state.catalog = (body.cards || []).map(remember);
      state.catalogTotal = body.total || 0;
      state.catalogPageSize = body.page_size || 24;
      $("catalog-status").textContent = state.catalog.length ? "" : "No cards match these filters. Try another name or show all cards.";
      $("catalog-count").textContent = Number(state.catalogTotal).toLocaleString() + " cards";
      if (body.coverage) $("coverage-note").textContent = Number(body.coverage.supported || 0).toLocaleString() + " of " + Number(body.coverage.total || 0).toLocaleString() + " catalog printings have playable effects. Unsupported cards are clearly marked and cannot enter a match.";
      renderCatalog(); renderDeck();
    } catch (error) { if (error.name !== "AbortError") $("catalog-status").textContent = error.message; }
  }
  function cardArt(card, extraClass = "") {
    const src = imageOf(card);
    return src ? '<img class="tcg-card-art ' + extraClass + '" src="' + attr(src) + '" alt="' + attr(nameOf(card)) + '" loading="lazy" decoding="async">' : '<div class="tcg-card-placeholder ' + extraClass + '"><strong>' + esc(nameOf(card)) + '</strong><small>' + esc(card?.supertype || "Card") + (card?.hp ? ' · ' + esc(card.hp) + ' HP' : '') + '</small></div>';
  }
  function maxAvailable(card) { const value = card.available_quantity ?? card.available; return value == null ? Infinity : Math.max(0, Number(value)); }
  function cardSupported(card) { return card.supported !== false && card.coverage?.supported !== false; }
  function quantityControls(id, compact = false) {
    const card = state.cards.get(id) || {};
    const count = state.entries.get(id) || 0;
    return '<div class="tcg-quantity"><button type="button" data-quantity="-1" data-card="' + attr(id) + '" aria-label="Remove one ' + attr(nameOf(card)) + '"' + (count < 1 ? ' disabled' : '') + '>−</button><span aria-label="' + count + ' copies">' + count + '</span><button type="button" data-quantity="1" data-card="' + attr(id) + '" aria-label="Add one ' + attr(nameOf(card)) + '"' + (!cardSupported(card) || count >= maxAvailable(card) || quantity() >= 60 ? ' disabled' : '') + '>+</button></div>';
  }
  function renderCatalog() {
    $("catalog-cards").innerHTML = state.catalog.map((card) => {
      const id = cardId(card), supported = cardSupported(card);
      const ownership = { yours: "Yours", opponents: "Opponent’s", both: "Both", global: "Global" }[card.ownership] || "";
      return '<article class="tcg-catalog-card"><button class="tcg-card-image-button" type="button" data-inspect="' + attr(id) + '" aria-label="Inspect ' + attr(nameOf(card)) + '">' + cardArt(card) + '</button><h3>' + esc(nameOf(card)) + '</h3><div class="tcg-card-meta"><span>' + esc(card.set?.name || card.set_name || id) + '</span></div><div class="tcg-card-meta"><span class="tcg-ownership">' + esc(ownership) + (maxAvailable(card) < Infinity ? ' · ' + maxAvailable(card) : '') + '</span><span class="tcg-coverage-badge' + (supported ? '' : ' unsupported') + '" title="' + attr(card.unsupported_reason || (supported ? "Effects implemented" : "Effects not yet supported")) + '">' + (supported ? 'Playable' : 'Unsupported') + '</span></div>' + quantityControls(id) + '</article>';
    }).join("");
    $("catalog-page").textContent = "Page " + state.catalogPage + " of " + Math.max(1, Math.ceil(state.catalogTotal / state.catalogPageSize));
    $("catalog-prev").disabled = state.catalogPage <= 1;
    $("catalog-next").disabled = state.catalogPage * state.catalogPageSize >= state.catalogTotal;
  }
  function renderDeck() {
    const count = quantity();
    $("deck-count").innerHTML = count + ' <small>/ 60</small>';
    const types = { "Pokémon": 0, Trainer: 0, Energy: 0 };
    for (const [id, n] of state.entries) { const type = state.cards.get(id)?.supertype; if (type in types) types[type] += n; }
    $("deck-breakdown").innerHTML = Object.entries(types).map(([type, n]) => '<span>' + n + ' ' + type + '</span>').join("");
    $("deck-list").innerHTML = state.entries.size ? Array.from(state.entries).map(([id]) => '<div class="tcg-deck-row"><button class="tcg-deck-name" type="button" data-inspect="' + attr(id) + '">' + esc(state.cards.get(id)?.name || id) + '</button>' + quantityControls(id, true) + '</div>').join("") : '<div class="tcg-deck-empty">Your next deck starts here.<br>Add cards from the catalog.</div>';
    $("save-deck").disabled = state.busy || count < 1;
    $("use-deck").disabled = state.busy || count !== 60;
  }
  function changeQuantity(id, delta) {
    const card = state.cards.get(id) || {};
    const current = state.entries.get(id) || 0;
    if (delta > 0 && (!cardSupported(card) || quantity() >= 60 || current >= maxAvailable(card))) return;
    const next = Math.max(0, current + delta);
    next ? state.entries.set(id, next) : state.entries.delete(id);
    $("deck-validation").textContent = "";
    renderCatalog(); renderDeck();
    if (state.inspect && state.view === "workshop") inspectCard(state.inspect.card, state.inspect.instance);
  }
  async function saveDeck(use = false) {
    if (state.busy) return;
    state.busy = true; renderDeck();
    $("deck-validation").textContent = "";
    try {
      const body = await request("/api/tcg/decks", { method: "POST", body: { ...(state.deckId ? { id: state.deckId } : {}), name: $("deck-name").value.trim() || "My TCG deck", entries: entriesPayload(), ...(state.lobby ? { lobby_id: state.lobby.id } : {}) } });
      state.deckId = body.deck?.id || body.id || state.deckId;
      await loadDecks();
      if (use) {
        state.busy = false;
        if (await command({ type: "deck", entries: entriesPayload() })) { showView("lobby"); toast("Deck saved and selected. Ready up when you’re set."); }
      } else {
        toast("Deck saved.");
        $("deck-validation").textContent = (body.validation_errors || []).join(' · ');
      }
    } catch (error) { $("deck-validation").textContent = error.message; }
    finally { state.busy = false; renderDeck(); }
  }
  async function starterDeck() {
    if (state.busy) return;
    state.busy = true; renderCurrent();
    try {
      const body = await request("/api/tcg/starter-deck?lobby_id=" + encodeURIComponent(state.lobby.id));
      state.busy = false;
      if (await command({ type: "deck", entries: body.entries })) toast("Starter deck selected. You can edit it before you ready up.");
    } catch (error) { notice(error.message, true); }
    finally { state.busy = false; renderCurrent(); }
  }
  function gameBoard(id) { return state.game?.board?.[id] || {}; }
  function countZone(zone) { return Array.isArray(zone) ? zone.length : Number(zone?.count ?? zone ?? 0); }
  function legalActions() { return state.game?.legal_actions || []; }
  function actionsFor(instance) {
    if (!instance?.uid) return [];
    return legalActions().map((item, index) => ({ ...item, index })).filter(({ action }) => (instance.uid === state.game?.stadium?.uid && action?.type === 'use_stadium') || Object.values(action || {}).some((value) => value === instance.uid || (Array.isArray(value) && value.includes(instance.uid))));
  }
  function boardCard(instance, active = false) {
    if (!instance) return '<div class="tcg-board-slot empty' + (active ? ' is-active' : '') + '">' + (active ? 'Active' : 'Bench') + '</div>';
    if (instance.face_down) return '<div class="tcg-board-slot' + (active ? ' is-active' : '') + '"><div class="tcg-card-back tcg-hidden-pokemon" aria-label="Face-down starting Pokémon"></div></div>';
    const card = getCard(instance);
    remember(card);
    const attachments = instance.attachments || [];
    const maxHp = Number(instance.effective_hp ?? card.hp ?? 0);
    const remainingHp = Number(instance.remaining_hp ?? Math.max(0, maxHp - Number(instance.damage || 0)));
    const canAct = actionsFor(instance).length > 0;
    return '<div class="tcg-board-slot' + (active ? ' is-active' : '') + '"><button class="tcg-board-card' + (canAct ? ' has-actions' : '') + '" type="button" data-instance="' + attr(instance.uid) + '" aria-label="Inspect ' + attr(nameOf(card)) + (instance.damage ? ', ' + Number(instance.damage) + ' damage' : '') + '">' + cardArt(card) + (Number(instance.damage) > 0 ? '<span class="tcg-damage">' + Number(instance.damage) + '</span>' : '') + (attachments.length ? '<span class="tcg-attachments">' + attachments.map((a) => '<span class="tcg-energy-marker' + (getCard(a).supertype === 'Trainer' ? ' tcg-tool-marker' : '') + '" title="' + attr(nameOf(getCard(a))) + '">' + esc((getCard(a).types?.[0] || (getCard(a).supertype === 'Energy' ? 'E' : 'T')).slice(0, 1)) + '</span>').join('') + '</span>' : '') + '</button>' + (maxHp ? '<span class="tcg-hp-label">' + remainingHp + ' / ' + maxHp + ' HP</span>' : '') + (instance.statuses?.length ? '<span class="tcg-statuses">' + instance.statuses.map(esc).join(' · ') + '</span>' : '') + '</div>';
  }
  function renderMat(id, opponent = false) {
    const board = gameBoard(id), player = state.lobby.players.find((p) => String(p.id) === String(id));
    const prizeCount = countZone(board.prizes), bench = board.bench || [];
    const benchMax = Math.max(5, Number(board.bench_limit || 5), bench.length);
    const prizes = Array.from({ length: Math.max(6, prizeCount) }, (_, i) => '<div class="tcg-card-back' + (i >= prizeCount ? ' empty' : '') + '" aria-hidden="true"></div>').join('');
    return '<section class="' + (opponent ? 'tcg-opponent-mat' : 'tcg-self-mat') + '" aria-label="' + (opponent ? 'Opponent' : 'Your') + ' play area"><div class="tcg-player-strip"><span class="tcg-seat-avatar">' + esc((player?.name || 'T').slice(0, 1).toUpperCase()) + '</span><strong>' + esc(player?.name || 'Trainer') + (opponent ? '' : ' · You') + '</strong><span class="tcg-pill">' + prizeCount + ' Prizes left</span></div><div class="tcg-player-mat"><div class="tcg-prize-section"><div class="tcg-prizes" aria-label="' + prizeCount + ' face-down Prizes">' + prizes + '</div><p class="tcg-zone-label">Prizes</p></div><div class="tcg-center-zones">' + boardCard(board.active, true) + '<div class="tcg-bench" aria-label="Bench">' + Array.from({ length: benchMax }, (_, i) => boardCard(bench[i])).join('') + '</div></div><div class="tcg-piles"><div><div class="tcg-card-back" aria-label="' + countZone(board.deck) + ' cards in deck">' + countZone(board.deck) + '</div><p class="tcg-zone-label">Deck</p></div><button class="tcg-pile-button" data-pile="discard" data-player="' + attr(id) + '" type="button" aria-label="Inspect ' + (opponent ? 'opponent' : 'your') + ' discard pile"><span class="tcg-card-back discard">' + countZone(board.discard) + '</span><span class="tcg-zone-label">Discard</span></button>' + (board.lost_zone?.length ? '<button class="tcg-btn tcg-btn-quiet" type="button" data-pile="lost_zone" data-player="' + attr(id) + '">Lost zone ' + board.lost_zone.length + '</button>' : '') + '</div></div></section>';
  }
  function turnText() {
    const game = state.game;
    if (game.phase === 'finished') return 'Game complete';
    if (game.phase === 'choose_start') return String(game.coin_winner) === myId() ? 'You won the coin flip' : 'Choosing who goes first';
    if (game.phase === 'setup') return gameBoard(myId()).setup_ready ? 'Waiting for setup' : 'Set up your Pokémon';
    return String(game.turn_player) === myId() ? 'Your turn' : 'Opponent’s turn';
  }
  function actionButton(item, index) {
    const type = item.action?.type || '';
    const gold = ['attack', 'end_turn', 'setup_ready', 'choose_start', 'start'].includes(type);
    return '<button class="tcg-btn ' + (gold ? 'tcg-btn-gold' : 'tcg-btn-outline') + '" type="button" data-game-action="' + index + '"' + busyAttr() + '>' + esc(item.label || type.replaceAll('_', ' ')) + '</button>';
  }
  function renderChoice() {
    const choice = state.game.pending_choice;
    if (!choice) { state.choiceId = null; state.choiceSelected.clear(); return ''; }
    if (String(choice.player) !== myId()) return '<div class="tcg-choice-panel"><h3>Opponent is choosing</h3><p>' + esc(choice.message || 'The game continues when your opponent makes their choice.') + '</p></div>';
    if (state.choiceId !== choice.id) { state.choiceId = choice.id; state.choiceSelected.clear(); }
    const min = Number(choice.min ?? 1), max = Number(choice.max ?? 1);
    const options = choice.options || [];
    const selectedCount = state.choiceSelected.size;
    return '<div class="tcg-choice-panel"><h3>Your choice</h3><p>' + esc(choice.message || 'Choose an option to continue.') + '</p><p class="tcg-fineprint">' + (min === max ? 'Choose ' + min : 'Choose ' + min + '–' + max) + ' · ' + selectedCount + ' selected</p><div class="tcg-choice-options">' + options.map((option, index) => '<label class="tcg-choice-option"><input type="' + (max === 1 ? 'radio' : 'checkbox') + '" name="game-choice" data-choice-index="' + index + '"' + (state.choiceSelected.has(index) ? ' checked' : '') + (state.busy || (max > 1 && selectedCount >= max && !state.choiceSelected.has(index)) ? ' disabled' : '') + '>' + (option.card && imageOf(getCard(option.card)) ? '<img src="' + attr(imageOf(getCard(option.card))) + '" alt="">' : '') + '<span>' + esc(option.label || String(option.value)) + '</span></label>').join('') + '</div>' + (min === 0 && selectedCount ? '<button class="tcg-btn tcg-btn-quiet" data-do="clear-choice" type="button">Clear selection</button>' : '') + '<button class="tcg-btn tcg-btn-gold tcg-full" data-do="confirm-choice" type="button"' + (state.busy || selectedCount < min || selectedCount > max ? ' disabled' : '') + '>Confirm choice →</button></div>';
  }
  function logMessage(entry) {
    const message = entry.message || entry.text || (typeof entry === 'string' ? entry : 'Game state updated');
    const player = (state.lobby?.players || []).find((p) => message.startsWith(String(p.id) + ' '));
    return player ? player.name + message.slice(String(player.id).length) : message;
  }
  function renderGame() {
    const game = state.game;
    if (!game || !state.lobby) return;
    const you = String(game.you || myId()), opponent = (game.players || []).map(String).find((id) => id !== you);
    const own = gameBoard(you), other = gameBoard(opponent);
    const hand = Array.isArray(own.hand) ? own.hand : [];
    const opponentHand = countZone(other.hand);
    const stadium = game.stadium?.card ? game.stadium : game.stadium ? { card: game.stadium } : null;
    const finished = game.phase === 'finished';
    const result = finished ? '<section class="tcg-result"><p class="tcg-eyebrow">The last card has been played</p><h2>' + (game.winner == null ? 'A drawn game.' : String(game.winner) === you ? 'Victory is yours.' : 'A well-played game.') + '</h2><p>' + esc(game.reason || 'This game has ended.') + '</p><div class="tcg-row"><button class="tcg-btn tcg-btn-gold" data-do="rematch" type="button"' + busyAttr() + '>Play again →</button><button class="tcg-btn tcg-btn-outline" data-do="leave" type="button"' + busyAttr() + '>Leave table</button></div></section>' : '';
    const context = game.phase === 'choose_start' ? 'The coin-flip winner chooses who takes the first turn.' : game.phase === 'setup' ? 'Choose a Basic Pokémon as your Active, add any starting Bench Pokémon, then finish setup. Your opponent’s setup stays hidden until both players finish.' : String(game.turn_player) === you ? 'Choose a highlighted card or a legal action below. Inspect any card to read its text.' : 'Inspect the table while your opponent plays. Your hand stays private.';
    const seen = new Set();
    const actions = legalActions().filter((item) => {
      if (item.action?.type === 'surrender') return false;
      const a = item.action, instance = a.card_uid ? findInstance(a.card_uid) : null;
      const key = JSON.stringify({ ...a, card_uid: instance?.card?.id || a.card_uid });
      if (seen.has(key)) return false;
      seen.add(key); return true;
    });
    const opponentSeat = state.lobby.players.find((p) => String(p.id) !== you);
    const disconnectNotice = !finished && opponentSeat && !opponentSeat.connected ? '<div class="tcg-notice">Your opponent is reconnecting. ' + (opponentSeat.disconnect_claim_in > 0 ? 'They have ' + Number(opponentSeat.disconnect_claim_in) + ' seconds to return.' : '<button class="tcg-btn tcg-btn-outline" data-do="claim-disconnect" type="button">Claim disconnected game</button>') + '</div>' : '';
    $("tcg-game").innerHTML = result + disconnectNotice + '<div class="tcg-match-bar"><div class="tcg-turn-label">' + esc(turnText()) + '<small>Table ' + esc(state.lobby.code) + ' · ' + esc(modeLabel()) + (game.turn_number ? ' · Turn ' + Number(game.turn_number) : '') + '</small></div><div class="tcg-row">' + connectionPill() + (!finished ? '<button class="tcg-btn tcg-btn-quiet" data-do="surrender" type="button"' + busyAttr() + '>Concede</button>' : '') + '</div></div>' + (!state.connected ? '<div class="tcg-notice">Reconnecting to the table. Your game is saved; the disconnect grace period is ' + Math.round(Number(state.lobby.disconnect_grace_seconds || 180) / 60) + ' minutes.</div>' : '') + '<div class="tcg-match-layout"><div class="tcg-tabletop"><div class="tcg-opponent-hand" aria-label="Opponent has ' + opponentHand + ' cards in hand">' + Array.from({ length: Math.min(opponentHand, 15) }, () => '<i class="tcg-card-back" aria-hidden="true"></i>').join('') + '<span>' + opponentHand + ' in hand</span></div>' + renderMat(opponent, true) + '<div class="tcg-midline"><button class="tcg-stadium' + (stadium ? ' occupied' : '') + '" type="button"' + (stadium ? ' data-instance="' + attr(stadium.uid) + '" aria-label="Inspect Stadium: ' + attr(nameOf(stadium.card)) + '"' : ' disabled') + '>' + (stadium ? cardArt(remember(stadium.card)) + '<span>' + esc(nameOf(stadium.card)) + '</span>' : 'STADIUM') + '</button></div>' + renderMat(you) + '<section class="tcg-local-hand" aria-label="Your hand"><div class="tcg-hand-head"><span>YOUR HAND · ' + hand.length + ' CARDS</span><span>Tap to inspect & play</span></div><div class="tcg-hand-cards">' + hand.map((instance) => '<button class="tcg-board-card' + (actionsFor(instance).length ? ' has-actions' : '') + '" type="button" data-instance="' + attr(instance.uid) + '" aria-label="Inspect ' + attr(nameOf(getCard(instance))) + '">' + cardArt(getCard(instance)) + '</button>').join('') + (hand.length ? '' : '<p class="tcg-inline-empty">No cards in your hand.</p>') + '</div></section></div><aside class="tcg-panel tcg-action-panel" aria-label="Game actions"><h3>' + (finished ? 'Game record' : 'At the table') + '<span class="tcg-label">' + (state.busy ? 'Sending…' : 'Live') + '</span></h3><p class="tcg-action-context">' + esc(context) + '</p>' + renderChoice() + '<div class="tcg-action-list">' + (actions.length ? actions.map((item) => actionButton(item, legalActions().indexOf(item))).join('') : '<div class="tcg-inline-empty">' + (finished ? 'Start a rematch to return to the lobby.' : game.pending_choice ? 'Resolve the pending choice to continue.' : 'Waiting for your opponent. The table updates automatically.') + '</div>') + '</div><details class="tcg-log" open><summary>Match log</summary><ol>' + (game.log || []).slice(-40).map((entry) => '<li>' + esc(logMessage(entry)) + '</li>').join('') + '</ol></details></aside></div>';
    const log = $("tcg-game").querySelector('.tcg-log ol');
    if (log) log.scrollTop = log.scrollHeight;
  }
  function findInstance(uid) {
    if (state.game?.stadium?.uid === uid) return state.game.stadium;
    for (const board of Object.values(state.game?.board || {})) {
      const instances = [...(Array.isArray(board.hand) ? board.hand : []), ...(board.discard || []), ...(board.lost_zone || []), ...(board.bench || []), ...(board.active ? [board.active] : [])];
      for (const item of instances) { if (item.uid === uid) return item; for (const a of item.attachments || []) if (a.uid === uid) return a; }
    }
    return null;
  }
  function openDialog(title, html) {
    $("dialog-title").textContent = title;
    $("dialog-body").innerHTML = html;
    if (!$("tcg-dialog").open) $("tcg-dialog").showModal();
  }
  function closeDialog() { $("tcg-dialog").close(); state.inspect = null; }
  function inspectCard(card, instance = null) {
    card = getCard(card);
    state.inspect = { card, instance };
    const actions = instance ? actionsFor(instance) : [];
    const attacks = card.attacks || [];
    const rules = Array.isArray(card.rules) ? card.rules : card.rules ? [card.rules] : [];
    const detail = '<div class="tcg-card-detail"><div class="tcg-card-detail-art">' + cardArt(card) + '</div><div><dl><dt>Printing</dt><dd>' + esc(cardId(card)) + '</dd><dt>Type</dt><dd>' + esc([card.supertype, ...(card.subtypes || [])].filter(Boolean).join(' · ')) + '</dd>' + (card.hp ? '<dt>HP</dt><dd>' + esc(instance?.effective_hp ?? card.hp) + (instance?.effective_hp != null && instance.effective_hp !== card.hp ? ' (' + esc(card.hp) + ' printed)' : '') + (instance?.damage ? ' · ' + Number(instance.damage) + ' damage · ' + Math.max(0, Number(instance.effective_hp ?? card.hp) - Number(instance.damage)) + ' remaining' : '') + '</dd>' : '') + (card.types?.length ? '<dt>Energy type</dt><dd>' + card.types.map(esc).join(', ') + '</dd>' : '') + (card.weaknesses?.length ? '<dt>Weakness</dt><dd>' + card.weaknesses.map((w) => esc(w.type + ' ' + w.value)).join(', ') + '</dd>' : '') + (card.resistances?.length ? '<dt>Resistance</dt><dd>' + card.resistances.map((r) => esc(r.type + ' ' + r.value)).join(', ') + '</dd>' : '') + (card.supertype === 'Pokémon' && (card.retreat_cost || card.retreatCost) ? '<dt>Retreat</dt><dd>' + (instance?.effective_retreat_cost != null ? Number(instance.effective_retreat_cost) + ' Energy' : (card.retreat_cost || card.retreatCost).map(esc).join(' · ') || 'Free') + '</dd>' : '') + '</dl>' + (card.abilities || []).map((ability) => '<div class="tcg-attack"><strong>' + esc(ability.type || 'Ability') + ': ' + esc(ability.name) + '</strong><p>' + esc(ability.text) + '</p></div>').join('') + attacks.map((attack) => '<div class="tcg-attack"><strong><span>' + esc(attack.name) + '</span><span>' + esc(attack.damage || '') + '</span></strong><p>' + (attack.cost || []).map(esc).join(' · ') + '</p><p>' + esc(attack.text || '') + '</p></div>').join('') + rules.map((rule) => '<p class="tcg-muted">' + esc(rule) + '</p>').join('') + (!cardSupported(card) ? '<div class="tcg-notice">' + esc(card.unsupported_reason || (card.unsupported_reasons || []).join(' · ') || 'This card’s effects are not implemented. It cannot enter a match yet.') + '</div>' : '') + (instance?.attachments?.length ? '<h3>Attached cards</h3><div class="tcg-row">' + instance.attachments.map((a) => '<button class="tcg-btn tcg-btn-outline" data-instance="' + attr(a.uid) + '" type="button">' + esc(nameOf(getCard(a))) + '</button>').join('') + '</div>' : '') + '<div class="tcg-inspect-actions">' + actions.map((item) => actionButton(item, item.index)).join('') + '</div>' + (state.view === 'workshop' ? '<div class="tcg-card-footer"><span class="tcg-muted">Copies in your deck</span>' + quantityControls(cardId(card)) + '</div>' : '') + '</div></div>';
    openDialog(nameOf(card), detail);
  }
  function showPile(player, zone) {
    state.inspect = null;
    const pile = gameBoard(player)[zone] || [];
    openDialog(zone === 'discard' ? 'Discard pile' : 'Lost zone', pile.length ? '<div class="tcg-dialog-card-grid">' + pile.map((instance) => '<button class="tcg-card-image-button" type="button" data-instance="' + attr(instance.uid) + '">' + cardArt(getCard(instance)) + '<span>' + esc(nameOf(getCard(instance))) + '</span></button>').join('') + '</div>' : '<p class="tcg-muted">This pile is empty.</p>');
  }
  async function doAction(type) {
    if (type === 'copy-invite') return copyInvite();
    if (type === 'edit-lobby-deck') return openWorkshop();
    if (type === 'starter') return starterDeck();
    if (type === 'ready') { const own = state.lobby.players.find((p) => String(p.id) === myId()); return command({ type: 'ready', ready: !own?.ready }); }
    if (type === 'start') return command({ type: 'start' });
    if (type === 'claim-disconnect') return command({ type: 'claim_disconnect' });
    if (type === 'leave') return command({ type: 'leave' });
    if (type === 'rematch') return command({ type: 'rematch' });
    if (type === 'surrender') { state.inspect = null; openDialog('Concede this game?', '<p class="tcg-muted">Your opponent wins this game. You can play a rematch together afterward.</p><div class="tcg-row"><button class="tcg-btn tcg-btn-danger" type="button" data-do="confirm-surrender">Concede game</button><button class="tcg-btn tcg-btn-outline" type="button" data-do="close-dialog">Keep playing</button></div>'); return; }
    if (type === 'confirm-surrender') { closeDialog(); return command({ type: 'surrender' }); }
    if (type === 'close-dialog') return closeDialog();
    if (type === 'clear-choice') { state.choiceSelected.clear(); renderGame(); return; }
    if (type === 'confirm-choice') {
      const choice = state.game.pending_choice;
      if (!choice || String(choice.player) !== myId()) return;
      return command({ type: 'choose', choice_id: choice.id, selected: Array.from(state.choiceSelected, (index) => choice.options[index].value) });
    }
  }
  document.addEventListener('click', async (event) => {
    const button = event.target.closest('button');
    if (!button || button.disabled) return;
    try {
      if (button.dataset.do) await doAction(button.dataset.do);
      else if (button.dataset.quantity) changeQuantity(button.dataset.card, Number(button.dataset.quantity));
      else if (button.dataset.inspect) inspectCard(state.cards.get(button.dataset.inspect) || { id: button.dataset.inspect, name: button.dataset.inspect });
      else if (button.dataset.instance) { const instance = findInstance(button.dataset.instance); if (instance) inspectCard(instance.card, instance); }
      else if (button.dataset.pile) showPile(button.dataset.player, button.dataset.pile);
      else if (button.dataset.gameAction != null) { const item = legalActions()[Number(button.dataset.gameAction)]; if (item) { closeDialog(); await command(item.action); } }
      else if (button.dataset.resume) { await enterTable(await request('/api/tcg/lobbies/' + encodeURIComponent(button.dataset.resume))); }
    } catch (error) { notice(error.message, true); }
  });
  document.addEventListener('change', async (event) => {
    if (event.target.name === 'source') { $("mixed-row").hidden = event.target.value !== 'owned'; if (event.target.value !== 'owned') $("create-mixed").checked = false; }
    if (event.target.id === 'lobby-source') await command({ type: 'settings', source: event.target.value, mixed: event.target.value === 'owned' ? state.lobby.mixed : false });
    if (event.target.id === 'lobby-mixed') await command({ type: 'settings', source: state.lobby.source, mixed: event.target.checked });
    if (event.target.dataset.choiceIndex != null) {
      const index = Number(event.target.dataset.choiceIndex), choice = state.game?.pending_choice;
      if (!choice) return;
      if (Number(choice.max ?? 1) === 1) state.choiceSelected.clear();
      event.target.checked ? state.choiceSelected.add(index) : state.choiceSelected.delete(index);
      renderGame();
      $("tcg-game").querySelector('[data-choice-index="' + index + '"]')?.focus();
    }
  });
  $("create-form").addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!state.user || state.busy) return;
    const source = new FormData(event.currentTarget).get('source');
    const button = event.currentTarget.querySelector('button[type="submit"]');
    state.busy = true; button.disabled = true;
    try { await enterTable(await request('/api/tcg/lobbies', { method: 'POST', body: { source, mixed: source === 'owned' && $("create-mixed").checked } })); notice(''); }
    catch (error) { notice(error.message, true); }
    finally { state.busy = false; button.disabled = false; renderCurrent(); }
  });
  $("join-form").addEventListener('submit', (event) => { event.preventDefault(); join($("join-code").value); });
  $("refresh-tables").addEventListener('click', loadTables);
  $("open-workshop").addEventListener('click', openWorkshop);
  $("close-workshop").addEventListener('click', () => showView(state.game ? 'game' : state.lobby ? 'lobby' : 'home'));
  $("save-deck").addEventListener('click', () => saveDeck(false));
  $("use-deck").addEventListener('click', () => saveDeck(true));
  $("saved-decks").addEventListener('change', () => {
    const deck = state.decks.find((d) => String(d.id) === $("saved-decks").value);
    state.deckId = deck?.id || null;
    $("deck-name").value = deck?.name || '';
    loadEntries(deck?.entries || []);
    $("deck-validation").textContent = '';
    renderCatalog(); renderDeck();
  });
  let searchTimer;
  $("catalog-search").addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { state.catalogPage = 1; loadCatalog(); }, 250); });
  for (const id of ['catalog-type', 'catalog-supported']) $(id).addEventListener('change', () => { state.catalogPage = 1; loadCatalog(); });
  $("catalog-prev").addEventListener('click', () => { state.catalogPage--; loadCatalog(); });
  $("catalog-next").addEventListener('click', () => { state.catalogPage++; loadCatalog(); });
  $("dialog-close").addEventListener('click', closeDialog);
  $("tcg-dialog").addEventListener('close', () => { state.inspect = null; });
  $("tcg-dialog").addEventListener('click', (event) => { if (event.target === $("tcg-dialog")) { const r = event.target.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) closeDialog(); } });
  $("btn-login").addEventListener('click', () => { location.href = API + '/auth/discord/login?return_to=' + encodeURIComponent(location.href); });
  $("btn-logout").addEventListener('click', async () => { disconnect(); try { await request('/auth/logout', { method: 'POST' }); } catch (_) {} storeToken(''); location.reload(); });
  window.addEventListener('online', () => { if (state.lobby && !state.connected) connect(); });
  window.addEventListener('pagehide', disconnect);
  window.addEventListener('pageshow', (event) => { if (event.persisted && state.lobby) connect(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && state.lobby && !state.connected) connect(); });
  async function boot() {
    const fragment = new URLSearchParams(location.hash.slice(1));
    if (fragment.get('session')) { storeToken(fragment.get('session')); fragment.delete('session'); history.replaceState(null, '', location.pathname + location.search + (fragment.size ? '#' + fragment : '')); }
    let enabled = true;
    try {
      const body = await request('/api/tcg/me');
      state.user = body.user || null;
      if (state.user) state.user.id = String(state.user.id);
    } catch (error) { if (error.status !== 401) { notice(error.message, true); enabled = false; } }
    const signedIn = !!state.user;
    $("sidebar-user").dataset.state = signedIn ? 'signed-in' : 'signed-out';
    $("sidebar-user").querySelector('.sidebar-user-loading').hidden = true;
    $("sidebar-user").querySelector('.sidebar-user-signedout').hidden = signedIn;
    $("sidebar-user").querySelector('.sidebar-user-signedin').hidden = !signedIn;
    document.querySelectorAll('[data-auth]').forEach((button) => { button.disabled = !signedIn; });
    if (signedIn) { $("user-name").textContent = state.user.name || state.user.global_name || state.user.username || 'Trainer'; if (state.user.avatar_url) $("user-avatar").src = safeImage(state.user.avatar_url); else $("user-avatar").hidden = true; }
    else if (enabled) notice('Sign in with Discord to create a table, join a friend, or build a deck.');
    showView('home');
    const params = new URLSearchParams(location.search);
    if (params.get('code')) $("join-code").value = params.get('code');
    if (!signedIn) return;
    if (params.get('code')) { await join(params.get('code')); return; }
    let saved;
    try { saved = sessionStorage.getItem('pokepon-tcg-lobby'); } catch (_) {}
    if (saved) { try { await enterTable(await request('/api/tcg/lobbies/' + encodeURIComponent(saved))); return; } catch (_) { try { sessionStorage.removeItem('pokepon-tcg-lobby'); } catch (_) {} } }
    await loadTables();
  }
  boot().catch((error) => { notice(error.message, true); showView('home'); });
})();
