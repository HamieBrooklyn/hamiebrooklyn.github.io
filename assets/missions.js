(function () {
  "use strict";

  var API_BASE = (window.POKEPON_API_BASE || "").replace(/\/+$/, "");
  var SESSION_KEY = "pokepon-session";
  var REFRESH_MS = 45000;

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

  function captureSessionFromFragment() {
    if (!window.location.hash) return;
    var params = new URLSearchParams(window.location.hash.slice(1));
    var token = params.get("session");
    if (!token) return;
    try {
      localStorage.setItem(SESSION_KEY, token);
    } catch (_) {}
    params.delete("session");
    var nextHash = params.toString();
    window.history.replaceState(
      null,
      "",
      window.location.pathname + window.location.search + (nextHash ? "#" + nextHash : "")
    );
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
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatCr(n) {
    return "💎 " + Number(n).toLocaleString();
  }

  function defaultAvatar() {
    return (
      "data:image/svg+xml," +
      encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect fill="#1e293b" width="64" height="64"/><circle cx="32" cy="24" r="12" fill="#64748b"/><path fill="#64748b" d="M8 58c4-14 16-20 24-20s20 6 24 20z"/></svg>'
      )
    );
  }

  function displayName(user) {
    if (!user) return "Player";
    return user.global_name || user.username || "Player";
  }

  function statusLabel(status) {
    if (status === "claimed") return { text: "Claimed", cls: "mission-badge-claimed" };
    if (status === "ready") return { text: "Ready", cls: "mission-badge-ready" };
    return { text: "In progress", cls: "mission-badge-progress" };
  }

  var state = {
    authenticated: false,
    me: null,
    board: null,
    claimingId: null,
    refreshTimer: null,
  };

  var els = {
    sidebarUser: document.getElementById("sidebar-user"),
    userAvatar: document.getElementById("user-avatar"),
    userName: document.getElementById("user-name"),
    btnLogin: document.getElementById("btn-login"),
    btnLogout: document.getElementById("btn-logout"),
    gate: document.getElementById("missions-gate"),
    panel: document.getElementById("missions-panel"),
    balance: document.getElementById("missions-balance"),
    summaryMeta: document.getElementById("missions-summary-meta"),
    status: document.getElementById("missions-status"),
    dailyMeta: document.getElementById("missions-daily-meta"),
    weeklyMeta: document.getElementById("missions-weekly-meta"),
    dailyList: document.getElementById("missions-daily-list"),
    weeklyList: document.getElementById("missions-weekly-list"),
    btnLoginMain: document.getElementById("btn-login-main"),
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

  function setStatus(msg) {
    if (els.status) els.status.textContent = msg || "";
  }

  function progressPercent(m) {
    var target = Math.max(1, Number(m.target) || 1);
    return Math.min(100, Math.round((Number(m.progress) / target) * 100));
  }

  function renderMissionCard(m) {
    var badge = statusLabel(m.status);
    var card = document.createElement("article");
    card.className = "mission-card";
    if (m.status === "ready") card.classList.add("is-ready");
    if (m.status === "claimed") card.classList.add("is-claimed");

    var claimBtn =
      m.status === "ready"
        ? '<button class="btn btn-primary btn-small mission-claim" type="button" data-mission-id="' +
          escapeHtml(String(m.id)) +
          '">Claim ' +
          escapeHtml(formatCr(m.reward_crystals)) +
          "</button>"
        : "";

    card.innerHTML =
      '<div class="mission-card-head">' +
      '<p class="mission-card-title">' +
      escapeHtml(m.description) +
      "</p>" +
      '<span class="mission-badge ' +
      badge.cls +
      '">' +
      escapeHtml(badge.text) +
      "</span>" +
      "</div>" +
      '<div class="mission-progress" aria-hidden="true"><div class="mission-progress-fill" style="width:' +
      progressPercent(m) +
      '%"></div></div>' +
      '<div class="mission-card-foot">' +
      '<span class="mission-reward">' +
      escapeHtml(String(m.progress)) +
      " / " +
      escapeHtml(String(m.target)) +
      " · " +
      escapeHtml(formatCr(m.reward_crystals)) +
      "</span>" +
      claimBtn +
      "</div>";

    return card;
  }

  function renderList(container, missions) {
    if (!container) return;
    container.innerHTML = "";
    if (!missions || !missions.length) {
      container.innerHTML = '<p class="mission-empty">No missions loaded.</p>';
      return;
    }
    missions.forEach(function (m) {
      container.appendChild(renderMissionCard(m));
    });
  }

  function renderBoard(board) {
    if (!board) return;
    state.board = board;
    if (els.balance) els.balance.textContent = formatCr(board.crystal_balance || 0);
    if (els.summaryMeta) {
      var claimable = Number(board.claimable_count) || 0;
      els.summaryMeta.textContent =
        claimable > 0
          ? claimable + " mission" + (claimable === 1 ? "" : "s") + " ready to claim."
          : "Keep playing in Discord — you'll get a DM when a mission completes.";
    }
    if (els.dailyMeta) {
      els.dailyMeta.textContent = "Resets at UTC midnight · period " + (board.daily_period_key || "");
    }
    if (els.weeklyMeta) {
      els.weeklyMeta.textContent = "Resets Monday UTC · period " + (board.weekly_period_key || "");
    }
    renderList(els.dailyList, board.daily || []);
    renderList(els.weeklyList, board.weekly || []);
  }

  function showPanel(show) {
    if (els.gate) els.gate.hidden = !!show;
    if (els.panel) els.panel.hidden = !show;
  }

  async function loadMe() {
    if (!API_BASE) return false;
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
      return state.authenticated;
    } catch (_) {
      setSidebarState("signedout");
      state.authenticated = false;
      state.me = null;
      return false;
    }
  }

  async function loadMissions() {
    if (!state.authenticated) {
      showPanel(false);
      return;
    }
    showPanel(true);
    setStatus("Loading missions…");
    try {
      var res = await apiFetch("/api/me/missions");
      if (res.status === 401) {
        showPanel(false);
        setSidebarState("signedout");
        return;
      }
      if (!res.ok) throw new Error("load failed");
      var board = await res.json();
      renderBoard(board);
      setStatus("");
    } catch (_) {
      setStatus("Could not load missions. Try again in a moment.");
    }
  }

  function claimMission(id) {
    if (state.claimingId) return;
    state.claimingId = id;
    setStatus("Claiming reward…");
    apiFetch("/api/me/missions/" + encodeURIComponent(String(id)) + "/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    })
      .then(function (res) {
        return res.json().then(function (body) {
          return { ok: res.ok, body: body };
        });
      })
      .then(function (result) {
        if (!result.ok) {
          setStatus(result.body && result.body.error ? result.body.error : "Claim failed.");
          return;
        }
        renderBoard(result.body.missions);
        setStatus(
          "Claimed " +
            formatCr(result.body.claimed_crystals) +
            ". Balance: " +
            formatCr(result.body.crystal_balance) +
            "."
        );
        if (window.PokePonApp && window.PokePonApp.notifyBalancesChanged) {
          window.PokePonApp.notifyBalancesChanged();
        }
      })
      .catch(function () {
        setStatus("Claim failed — try again.");
      })
      .finally(function () {
        state.claimingId = null;
      });
  }

  function bindEvents() {
    var login = function () {
      if (!API_BASE) return;
      window.location.href =
        api("/auth/discord/login?return_to=") + encodeURIComponent(window.location.href);
    };
    if (els.btnLogin) els.btnLogin.addEventListener("click", login);
    if (els.btnLoginMain) els.btnLoginMain.addEventListener("click", login);
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
        showPanel(false);
        setSidebarState("signedout");
        if (state.refreshTimer) {
          clearInterval(state.refreshTimer);
          state.refreshTimer = null;
        }
      });
    }
    document.addEventListener("click", function (ev) {
      var btn = ev.target.closest(".mission-claim");
      if (!btn) return;
      var mid = btn.getAttribute("data-mission-id");
      if (mid) claimMission(mid);
    });
  }

  async function init() {
    captureSessionFromFragment();
    bindEvents();
    setSidebarState("loading");
    var authed = await loadMe();
    if (authed) {
      await loadMissions();
      if (!state.refreshTimer) {
        state.refreshTimer = setInterval(loadMissions, REFRESH_MS);
      }
    } else {
      showPanel(false);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
