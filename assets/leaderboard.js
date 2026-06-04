/* PokePon leaderboards — global rankings from GET /api/leaderboards */
(function () {
  "use strict";

  var API_BASE = (window.POKEPON_API_BASE || "").replace(/\/+$/, "");
  function api(path) {
    return API_BASE + path;
  }

  var SESSION_KEY = "pokepon-session";
  var TOPGG_VOTE_URL =
    (window.POKEPON_LINKS && window.POKEPON_LINKS.topggVote) ||
    "https://top.gg/bot/1496227239803748362/vote";

  var CATEGORY_META = {
    strongest: {
      lead: "Players ranked by the highest attack damage on any card they own. Tap a player to preview their card.",
      icon: "⚡",
    },
    tankiest: {
      lead: "Players ranked by the highest HP on any Pokémon they own. Tap a player to preview their card.",
      icon: "❤",
    },
    rarest: {
      lead: "Players ranked by their rarest owned card. Tap a player to preview that card.",
      icon: "✦",
    },
    auction: {
      lead: "Completed auction sales — tap a seller to preview the card that sold.",
      icon: "₽",
    },
    graded: {
      lead: "Players ranked by their highest graded slab (PSA-style 1–10). Tap a player to preview that copy.",
      icon: "🏆",
    },
    packs: {
      lead: "Members who opened the most `/cd` and booster packs in this server.",
      icon: "📦",
      serverOnly: true,
    },
    traders: {
      lead: "Members with the most completed trades in this server.",
      icon: "⇄",
      serverOnly: true,
    },
    collectors: {
      lead: "Members with the largest unique-card collections (all servers, members in this server).",
      icon: "▣",
      serverOnly: true,
    },
  };

  var GLOBAL_CATEGORIES = ["strongest", "tankiest", "rarest", "auction", "graded"];
  var SERVER_ONLY_CATEGORIES = ["packs", "traders", "collectors"];

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

  function displayName(user) {
    if (!user) return "Unknown player";
    return user.global_name || user.username || "Player #" + (user.id || "?");
  }

  function avatarFrameClass(user) {
    var f = user && user.leaderboard_frame;
    if (!f) return "";
    return " lb-avatar-framed lb-frame-" + String(f);
  }

  function rarityClass(label) {
    var n = (label || "").toLowerCase();
    if (n.indexOf("secret") >= 0) return "rarity-secret";
    if (n.indexOf("hyper") >= 0 || n.indexOf("illustration") >= 0) return "rarity-hyper";
    if (n.indexOf("ultra") >= 0) return "rarity-ultra";
    if (n.indexOf("rare") >= 0) return "rarity-rare";
    if (n.indexOf("uncommon") >= 0) return "rarity-uncommon";
    return "rarity-common";
  }

  function defaultAvatar() {
    return (
      "data:image/svg+xml," +
      encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect fill="#1e293b" width="64" height="64"/><circle cx="32" cy="24" r="12" fill="#64748b"/><path fill="#64748b" d="M8 58c4-14 16-20 24-20s20 6 24 20z"/></svg>'
      )
    );
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  var state = {
    category: "strongest",
    scope: "global",
    guildId: null,
    guilds: [],
    page: 1,
    me: null,
    authenticated: false,
    inflight: null,
    entriesByRank: {},
  };

  var els = {
    title: document.getElementById("lb-title"),
    lead: document.getElementById("lb-lead"),
    previewHint: document.getElementById("lb-preview-hint"),
    viewerRank: document.getElementById("lb-viewer-rank"),
    status: document.getElementById("lb-status"),
    podium: document.getElementById("lb-podium"),
    list: document.getElementById("lb-list"),
    pager: document.getElementById("lb-pager"),
    pagerInfo: document.getElementById("lb-pager-info"),
    prev: document.getElementById("lb-prev"),
    next: document.getElementById("lb-next"),
    tabs: document.querySelectorAll(".lb-tab"),
    sidebarUser: document.getElementById("sidebar-user"),
    userAvatar: document.getElementById("user-avatar"),
    userName: document.getElementById("user-name"),
    btnLogin: document.getElementById("btn-login"),
    btnLogout: document.getElementById("btn-logout"),
    cardModal: document.getElementById("lb-card-modal"),
    modalImg: document.getElementById("lb-modal-img"),
    modalSet: document.getElementById("lb-modal-set"),
    modalTitle: document.getElementById("lb-modal-title"),
    modalRarity: document.getElementById("lb-modal-rarity"),
    modalPlayer: document.getElementById("lb-modal-player"),
    modalHp: document.getElementById("lb-modal-hp"),
    modalStat: document.getElementById("lb-modal-stat"),
    scopeGlobal: document.getElementById("lb-scope-global"),
    scopeServer: document.getElementById("lb-scope-server"),
    guildPicker: document.getElementById("lb-guild-picker"),
    guildSelect: document.getElementById("lb-guild-select"),
    milestonePanel: document.getElementById("lb-milestone-panel"),
    milestoneTitle: document.getElementById("lb-milestone-title"),
    milestoneLead: document.getElementById("lb-milestone-lead"),
    milestoneBar: document.getElementById("lb-milestone-bar"),
    milestoneMeta: document.getElementById("lb-milestone-meta"),
  };

  function hasCardPreview(entry) {
    return !!(entry && entry.card && (entry.card.image_large_url || entry.card.image_small_url));
  }

  function userBlockHtml(user, extraClass) {
    var cls = "lb-user" + (extraClass ? " " + extraClass : "");
    return (
      '<div class="' +
      cls +
      '">' +
      '<img class="lb-avatar" src="' +
      (user.avatar_url || defaultAvatar()) +
      '" alt="" loading="lazy" />' +
      '<div class="lb-user-text">' +
      '<div class="lb-display-name">' +
      escapeHtml(displayName(user)) +
      "</div>" +
      "</div>" +
      "</div>"
    );
  }

  function setSidebarState(mode) {
    if (!els.sidebarUser) return;
    els.sidebarUser.dataset.state = mode;
    var loading = els.sidebarUser.querySelector(".sidebar-user-loading");
    var out = els.sidebarUser.querySelector(".sidebar-user-signedout");
    var inn = els.sidebarUser.querySelector(".sidebar-user-signedin");
    if (loading) loading.hidden = mode !== "loading";
    if (out) out.hidden = mode !== "signedout";
    if (inn) inn.hidden = mode !== "signedin";
  }

  function updateSidebarUser(user) {
    if (!user) return;
    if (els.userName) els.userName.textContent = displayName(user);
    if (els.userAvatar) {
      els.userAvatar.src = user.avatar_url || defaultAvatar();
      els.userAvatar.alt = displayName(user);
    }
  }

  function isServerCategory(cat) {
    return SERVER_ONLY_CATEGORIES.indexOf(cat) >= 0;
  }

  function syncUrl() {
    var params = new URLSearchParams();
    if (state.category !== "strongest") params.set("category", state.category);
    if (state.scope === "server") params.set("scope", "server");
    if (state.scope === "server" && state.guildId) params.set("guild_id", state.guildId);
    if (state.page > 1) params.set("page", String(state.page));
    var qs = params.toString();
    var url = window.location.pathname + (qs ? "?" + qs : "");
    window.history.replaceState(null, "", url);
  }

  function readUrl() {
    var params = new URLSearchParams(window.location.search);
    var cat = (params.get("category") || "strongest").toLowerCase();
    if (CATEGORY_META[cat]) state.category = cat;
    var scope = (params.get("scope") || "global").toLowerCase();
    if (scope === "server") state.scope = "server";
    else state.scope = "global";
    var gid = params.get("guild_id");
    if (gid) state.guildId = gid;
    var page = parseInt(params.get("page") || "1", 10);
    state.page = isNaN(page) || page < 1 ? 1 : page;
  }

  function updateScopeUi() {
    if (els.scopeGlobal) {
      els.scopeGlobal.classList.toggle("is-active", state.scope === "global");
    }
    if (els.scopeServer) {
      els.scopeServer.classList.toggle("is-active", state.scope === "server");
    }
    if (els.guildPicker) {
      els.guildPicker.hidden = state.scope !== "server";
    }
    els.tabs.forEach(function (tab) {
      var serverOnly = tab.getAttribute("data-server-only") === "true";
      if (serverOnly) {
        tab.hidden = state.scope !== "server";
      }
    });
    if (state.scope === "global" && isServerCategory(state.category)) {
      state.category = "strongest";
    }
  }

  function setActiveTab() {
    updateScopeUi();
    els.tabs.forEach(function (tab) {
      if (tab.hidden) return;
      var active = tab.dataset.category === state.category;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-pressed", active ? "true" : "false");
    });
    var meta = CATEGORY_META[state.category];
    if (els.lead && meta) {
      var scopeNote =
        state.scope === "server" && state.guildName
          ? " Rankings for **" + state.guildName + "**."
          : state.scope === "server"
            ? " Pick a server you share with the bot."
            : "";
      els.lead.textContent = meta.lead + scopeNote;
    }
    if (els.previewHint) {
      els.previewHint.hidden = isServerCategory(state.category);
    }
    if (els.title) {
      var title = (meta && meta.icon ? meta.icon + " " : "") + (state.apiTitle || "Leaderboards");
      if (state.scope === "server" && state.guildName) {
        title += " — " + state.guildName;
      }
      els.title.textContent = title;
    }
  }

  function populateGuildSelect() {
    if (!els.guildSelect) return;
    els.guildSelect.innerHTML = "";
    if (!state.guilds.length) {
      var opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "Sign in to list servers";
      els.guildSelect.appendChild(opt);
      return;
    }
    state.guilds.forEach(function (g) {
      var o = document.createElement("option");
      o.value = g.id;
      o.textContent = g.name;
      els.guildSelect.appendChild(o);
    });
    if (state.guildId) {
      els.guildSelect.value = state.guildId;
    } else if (state.guilds[0]) {
      state.guildId = state.guilds[0].id;
      els.guildSelect.value = state.guildId;
    }
  }

  async function loadGuilds() {
    if (!state.authenticated) {
      state.guilds = [];
      populateGuildSelect();
      return;
    }
    try {
      var res = await apiFetch("/api/me/guilds");
      if (!res.ok) return;
      var data = await res.json();
      state.guilds = data.guilds || [];
      populateGuildSelect();
    } catch (_) {}
  }

  async function loadMilestones() {
    if (!els.milestonePanel) return;
    if (state.scope !== "server" || !state.guildId) {
      els.milestonePanel.hidden = true;
      return;
    }
    try {
      var res = await apiFetch(
        "/api/guild-milestones?guild_id=" + encodeURIComponent(state.guildId)
      );
      if (!res.ok) {
        els.milestonePanel.hidden = true;
        return;
      }
      var data = await res.json();
      var m = data.milestones || {};
      els.milestonePanel.hidden = false;
      if (els.milestoneTitle) {
        els.milestoneTitle.textContent =
          "Server milestones — " + (data.guild_name || "Server");
      }
      if (els.milestoneLead) {
        if (m.next_tier != null) {
          els.milestoneLead.textContent =
            (m.packs_opened || 0).toLocaleString() +
            " packs opened · next goal: " +
            m.next_tier.toLocaleString();
        } else {
          els.milestoneLead.textContent =
            (m.packs_opened || 0).toLocaleString() +
            " packs opened — all community milestones complete!";
        }
      }
      if (els.milestoneBar) {
        els.milestoneBar.textContent = m.progress_bar || "";
      }
      if (els.milestoneMeta) {
        els.milestoneMeta.textContent =
          (m.trades_completed || 0).toLocaleString() +
          " trades completed in this server.";
      }
    } catch (_) {
      els.milestonePanel.hidden = true;
    }
  }

  function setStatus(text, isError) {
    if (!els.status) return;
    els.status.textContent = text || "";
    els.status.classList.toggle("is-error", !!isError);
  }

  function medalForRank(rank) {
    if (rank === 1) return "🥇";
    if (rank === 2) return "🥈";
    if (rank === 3) return "🥉";
    return "#" + rank;
  }

  function statClass(entry) {
    if (!entry.stat) return "";
    if (entry.stat.kind === "rarity") return rarityClass(entry.stat.label);
    return "";
  }

  function clickableAttrs(entry) {
    if (!hasCardPreview(entry)) return "";
    return (
      ' data-lb-rank="' +
      entry.rank +
      '" tabindex="0" role="button" aria-label="View ' +
      escapeHtml(entry.card_name || "card") +
      '"'
    );
  }

  function renderPodium(entries) {
    if (!els.podium) return;
    var top = entries.filter(function (e) {
      return e.rank >= 1 && e.rank <= 3;
    });
    if (!top.length || state.page !== 1) {
      els.podium.hidden = true;
      els.podium.innerHTML = "";
      return;
    }
    var order = [2, 1, 3];
    var html = "";
    order.forEach(function (rank) {
      var entry = top.find(function (e) {
        return e.rank === rank;
      });
      if (!entry) return;
      var user = entry.user || {};
      var sc = statClass(entry);
      var clickCls = hasCardPreview(entry) ? " lb-user-clickable" : "";
      html +=
        '<article class="lb-podium-card rank-' +
        rank +
        clickCls +
        '"' +
        clickableAttrs(entry) +
        ">" +
        '<div class="lb-podium-medal">' +
        medalForRank(rank) +
        "</div>" +
        '<img class="lb-podium-avatar' +
        avatarFrameClass(user) +
        '" src="' +
        (user.avatar_url || defaultAvatar()) +
        '" alt="" loading="lazy" />' +
        '<div class="lb-podium-name">' +
        escapeHtml(displayName(user)) +
        "</div>" +
        '<div class="lb-podium-card-name">' +
        escapeHtml(entry.card_name || (entry.stat && entry.stat.label) || "") +
        "</div>" +
        '<div class="lb-podium-stat ' +
        sc +
        '">' +
        escapeHtml((entry.stat && entry.stat.label) || "") +
        "</div>" +
        "</article>";
    });
    els.podium.innerHTML = html;
    els.podium.hidden = !html;
  }

  function renderList(entries) {
    if (!els.list) return;
    var meId = state.me && state.me.id ? String(state.me.id) : "";
    var listEntries = entries.filter(function (e) {
      return state.page !== 1 || e.rank > 3;
    });

    if (!listEntries.length && !entries.length) {
      els.list.innerHTML =
        '<li class="lb-row"><span class="lb-rank">—</span><span class="lb-user-text">No rankings yet.</span></li>';
      return;
    }

    els.list.innerHTML = listEntries
      .map(function (entry) {
        var user = entry.user || {};
        var isViewer = meId && String(user.id) === meId;
        var sc = statClass(entry);
        var clickCls = hasCardPreview(entry) ? " lb-user-clickable" : "";
        return (
          '<li class="lb-row' +
          (isViewer ? " is-viewer" : "") +
          '">' +
          '<span class="lb-rank' +
          (entry.rank <= 3 ? " top" : "") +
          '">' +
          entry.rank +
          "</span>" +
          '<div class="lb-user' +
          clickCls +
          '"' +
          clickableAttrs(entry) +
          ">" +
          '<img class="lb-avatar' +
          avatarFrameClass(user) +
          '" src="' +
          (user.avatar_url || defaultAvatar()) +
          '" alt="" loading="lazy" />' +
          '<div class="lb-user-text">' +
          '<div class="lb-display-name">' +
          escapeHtml(displayName(user)) +
          "</div>" +
          '<div class="lb-card-name">' +
          escapeHtml(
            entry.card_name ||
              (isServerCategory(state.category) && entry.stat ? entry.stat.label : "")
          ) +
          "</div>" +
          "</div>" +
          "</div>" +
          '<div class="lb-stat ' +
          sc +
          '">' +
          escapeHtml((entry.stat && entry.stat.label) || "") +
          "</div>" +
          "</li>"
        );
      })
      .join("");
  }

  function renderPager(data) {
    if (!els.pager) return;
    var show = data.total_pages > 1;
    els.pager.hidden = !show;
    if (els.pagerInfo) {
      els.pagerInfo.textContent =
        "Page " + data.page + " of " + data.total_pages + " · " + data.total + " entries";
    }
    if (els.prev) els.prev.disabled = data.page <= 1;
    if (els.next) els.next.disabled = data.page >= data.total_pages;
  }

  function renderViewerRank(data) {
    if (!els.viewerRank) return;
    if (!state.authenticated) {
      els.viewerRank.hidden = true;
      return;
    }
    if (data.viewer_rank != null) {
      els.viewerRank.hidden = false;
      var scopeLabel = state.scope === "server" ? "server" : "global";
      els.viewerRank.innerHTML =
        "Your " +
        scopeLabel +
        " rank: <strong>#" +
        data.viewer_rank +
        "</strong> in " +
        escapeHtml(data.title || state.category) +
        ".";
    } else {
      els.viewerRank.hidden = false;
      els.viewerRank.textContent =
        "You are not on this leaderboard yet — keep collecting!";
    }
  }

  function indexEntries(entries) {
    state.entriesByRank = {};
    (entries || []).forEach(function (e) {
      state.entriesByRank[e.rank] = e;
    });
  }

  function openCardModal(entry) {
    if (!els.cardModal || !entry || !entry.card) return;
    var card = entry.card;
    var img =
      card.image_large_url || card.image_small_url || "";
    if (els.modalImg) {
      els.modalImg.src = img;
      els.modalImg.alt = card.name || "Card";
    }
    if (els.modalSet) {
      var setBits = [card.set_name, card.set_code, card.collector_number]
        .filter(Boolean)
        .join(" · ");
      els.modalSet.textContent = setBits || "";
      els.modalSet.hidden = !setBits;
    }
    if (els.modalTitle) els.modalTitle.textContent = card.name || entry.card_name || "—";
    if (els.modalRarity) {
      var rLabel = card.rarity_display || card.tcg_rarity || "";
      els.modalRarity.textContent = rLabel;
      els.modalRarity.className = "modal-rarity " + rarityClass(rLabel);
      els.modalRarity.hidden = !rLabel;
    }
    if (els.modalPlayer) {
      var label =
        state.category === "auction"
          ? "Sold by " + displayName(entry.user)
          : "Leading card for " + displayName(entry.user);
      els.modalPlayer.textContent = label;
    }
    if (els.modalHp) els.modalHp.textContent = card.hp || "—";
    if (els.modalStat) {
      var statLabel = (entry.stat && entry.stat.label) || "—";
      if (card.grade != null) {
        statLabel +=
          " · Slab " +
          String(card.grade) +
          (card.grade_label ? " (" + card.grade_label + ")" : "");
      }
      els.modalStat.textContent = statLabel;
    }
    els.cardModal.hidden = false;
    els.cardModal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
  }

  function closeCardModal() {
    if (!els.cardModal) return;
    els.cardModal.hidden = true;
    els.cardModal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
  }

  function onEntryActivate(rank) {
    var entry = state.entriesByRank[rank];
    if (entry && hasCardPreview(entry)) openCardModal(entry);
  }

  function bindEntryClicks(root) {
    if (!root) return;
    root.querySelectorAll("[data-lb-rank]").forEach(function (node) {
      node.addEventListener("click", function () {
        onEntryActivate(parseInt(node.getAttribute("data-lb-rank"), 10));
      });
      node.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onEntryActivate(parseInt(node.getAttribute("data-lb-rank"), 10));
        }
      });
    });
  }

  function render(data) {
    state.apiTitle = data.title || "Leaderboards";
    state.guildName = data.guild_name || state.guildName || null;
    setActiveTab();
    indexEntries(data.entries || []);
    renderViewerRank(data);
    renderPodium(data.entries || []);
    renderList(data.entries || []);
    bindEntryClicks(els.podium);
    bindEntryClicks(els.list);
    renderPager(data);
    if (!data.total) {
      setStatus(
        state.category === "auction"
          ? "No completed auction sales yet."
          : "No ranked players yet."
      );
    } else {
      setStatus("");
    }
  }

  async function loadMe() {
    if (!API_BASE) {
      setSidebarState("signedout");
      return;
    }
    try {
      var res = await apiFetch("/api/me");
      if (!res.ok) throw new Error("me");
      var data = await res.json();
      state.authenticated = !!data.authenticated;
      state.me = data.user || null;
      if (state.authenticated && state.me) {
        setSidebarState("signedin");
        updateSidebarUser(state.me);
      } else {
        setSidebarState("signedout");
      }
    } catch (_) {
      setSidebarState("signedout");
      state.authenticated = false;
      state.me = null;
    }
  }

  async function loadLeaderboard() {
    if (!API_BASE) {
      setStatus(
        "API URL is not configured. Set ?api=https://your-bot-host once, or update the meta tag.",
        true
      );
      return;
    }

    setStatus("Loading rankings…");
    setActiveTab();
    syncUrl();
    closeCardModal();

    if (state.scope === "server") {
      if (!state.guildId) {
        setStatus("Choose a Discord server you share with the bot.", true);
        return;
      }
      await loadMilestones();
    } else if (els.milestonePanel) {
      els.milestonePanel.hidden = true;
    }

    var path =
      "/api/leaderboards?category=" +
      encodeURIComponent(state.category) +
      "&page=" +
      encodeURIComponent(String(state.page)) +
      "&limit=25";
    if (state.scope === "server") {
      path += "&scope=server&guild_id=" + encodeURIComponent(state.guildId);
    }

    if (state.inflight) state.inflight.abort();
    var controller = new AbortController();
    state.inflight = controller;

    try {
      var res = await apiFetch(path, { signal: controller.signal });
      if (!res.ok) {
        var errBody = {};
        try {
          errBody = await res.json();
        } catch (_) {}
        throw new Error(errBody.error || "http_" + res.status);
      }
      var data = await res.json();
      if (controller.signal.aborted) return;
      render(data);
    } catch (e) {
      if (e && e.name === "AbortError") return;
      setStatus("Could not load leaderboard. Try again in a moment.", true);
      if (els.podium) {
        els.podium.hidden = true;
        els.podium.innerHTML = "";
      }
      if (els.list) els.list.innerHTML = "";
      if (els.pager) els.pager.hidden = true;
    } finally {
      if (state.inflight === controller) state.inflight = null;
    }
  }

  function bindEvents() {
    if (els.scopeGlobal) {
      els.scopeGlobal.addEventListener("click", function () {
        if (state.scope === "global") return;
        state.scope = "global";
        state.page = 1;
        loadLeaderboard();
      });
    }
    if (els.scopeServer) {
      els.scopeServer.addEventListener("click", function () {
        if (state.scope === "server") return;
        state.scope = "server";
        state.page = 1;
        if (!state.guildId && state.guilds[0]) state.guildId = state.guilds[0].id;
        loadLeaderboard();
      });
    }
    if (els.guildSelect) {
      els.guildSelect.addEventListener("change", function () {
        state.guildId = els.guildSelect.value || null;
        state.page = 1;
        loadLeaderboard();
      });
    }
    els.tabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        var cat = tab.dataset.category;
        if (!cat || cat === state.category) return;
        state.category = cat;
        state.page = 1;
        loadLeaderboard();
      });
    });

    if (els.prev) {
      els.prev.addEventListener("click", function () {
        if (state.page <= 1) return;
        state.page -= 1;
        loadLeaderboard();
      });
    }
    if (els.next) {
      els.next.addEventListener("click", function () {
        state.page += 1;
        loadLeaderboard();
      });
    }

    if (els.btnLogin) {
      els.btnLogin.addEventListener("click", function () {
        if (!API_BASE) return;
        var returnTo = window.location.href;
        window.location.href =
          api("/auth/discord/login?return_to=") + encodeURIComponent(returnTo);
      });
    }

    if (els.btnLogout) {
      els.btnLogout.addEventListener("click", async function () {
        try {
          await apiFetch("/auth/logout", { method: "POST" });
        } catch (_) {}
        try {
          localStorage.removeItem(SESSION_KEY);
        } catch (_) {}
        state.authenticated = false;
        state.me = null;
        setSidebarState("signedout");
        loadLeaderboard();
      });
    }

    if (els.cardModal) {
      els.cardModal.querySelectorAll("[data-lb-close]").forEach(function (node) {
        node.addEventListener("click", closeCardModal);
      });
    }

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && els.cardModal && !els.cardModal.hidden) {
        closeCardModal();
      }
    });
  }

  async function init() {
    captureSessionFromFragment();
    readUrl();
    setActiveTab();
    bindEvents();
    setSidebarState("loading");
    await loadMe();
    await loadGuilds();
    if (state.scope === "server" && !state.guildId && state.guilds[0]) {
      state.guildId = state.guilds[0].id;
      populateGuildSelect();
    }
    await loadLeaderboard();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
