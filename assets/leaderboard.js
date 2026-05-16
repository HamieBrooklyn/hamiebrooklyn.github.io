/* PokePon leaderboards — global rankings from GET /api/leaderboards */
(function () {
  "use strict";

  var API_BASE = (window.POKEPON_API_BASE || "").replace(/\/+$/, "");
  function api(path) {
    return API_BASE + path;
  }

  var SESSION_KEY = "pokepon-session";

  var CATEGORY_META = {
    strongest: {
      lead: "Players ranked by the highest attack damage on any card they own.",
      icon: "⚡",
    },
    tankiest: {
      lead: "Players ranked by the highest HP on any Pokémon they own.",
      icon: "❤",
    },
    rarest: {
      lead: "Players ranked by their rarest owned card (by rarity tier).",
      icon: "✦",
    },
    auction: {
      lead: "Individual completed auction sales, highest final bids first.",
      icon: "₽",
    },
  };

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
    return "data:image/svg+xml," + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect fill="#1e293b" width="64" height="64"/><circle cx="32" cy="24" r="12" fill="#64748b"/><path fill="#64748b" d="M8 58c4-14 16-20 24-20s20 6 24 20z"/></svg>'
    );
  }

  var state = {
    category: "strongest",
    page: 1,
    me: null,
    authenticated: false,
    inflight: null,
  };

  var els = {
    title: document.getElementById("lb-title"),
    lead: document.getElementById("lb-lead"),
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
  };

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

  function syncUrl() {
    var params = new URLSearchParams();
    if (state.category !== "strongest") params.set("category", state.category);
    if (state.page > 1) params.set("page", String(state.page));
    var qs = params.toString();
    var url = window.location.pathname + (qs ? "?" + qs : "");
    window.history.replaceState(null, "", url);
  }

  function readUrl() {
    var params = new URLSearchParams(window.location.search);
    var cat = (params.get("category") || "strongest").toLowerCase();
    if (CATEGORY_META[cat]) state.category = cat;
    var page = parseInt(params.get("page") || "1", 10);
    state.page = isNaN(page) || page < 1 ? 1 : page;
  }

  function setActiveTab() {
    els.tabs.forEach(function (tab) {
      var active = tab.dataset.category === state.category;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-pressed", active ? "true" : "false");
    });
    var meta = CATEGORY_META[state.category];
    if (els.lead && meta) els.lead.textContent = meta.lead;
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
      html +=
        '<article class="lb-podium-card rank-' +
        rank +
        '">' +
        '<div class="lb-podium-medal">' +
        medalForRank(rank) +
        "</div>" +
        '<img class="lb-podium-avatar" src="' +
        (user.avatar_url || defaultAvatar()) +
        '" alt="" loading="lazy" />' +
        '<div class="lb-podium-name">' +
        escapeHtml(displayName(user)) +
        "</div>" +
        '<div class="lb-podium-card-name">' +
        escapeHtml(entry.card_name || "") +
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

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
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
        return (
          '<li class="lb-row' +
          (isViewer ? " is-viewer" : "") +
          '">' +
          '<span class="lb-rank' +
          (entry.rank <= 3 ? " top" : "") +
          '">' +
          entry.rank +
          "</span>" +
          '<div class="lb-user">' +
          '<img class="lb-avatar" src="' +
          (user.avatar_url || defaultAvatar()) +
          '" alt="" loading="lazy" />' +
          '<div class="lb-user-text">' +
          '<div class="lb-display-name">' +
          escapeHtml(displayName(user)) +
          "</div>" +
          '<div class="lb-card-name">' +
          escapeHtml(entry.card_name || "") +
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
      els.viewerRank.innerHTML =
        "Your global rank: <strong>#" +
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

  function render(data) {
    if (els.title && data.title) els.title.textContent = data.title;
    renderViewerRank(data);
    renderPodium(data.entries || []);
    renderList(data.entries || []);
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

    var path =
      "/api/leaderboards?category=" +
      encodeURIComponent(state.category) +
      "&page=" +
      encodeURIComponent(String(state.page)) +
      "&limit=25";

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
  }

  async function init() {
    captureSessionFromFragment();
    readUrl();
    setActiveTab();
    bindEvents();
    setSidebarState("loading");
    await loadMe();
    await loadLeaderboard();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
