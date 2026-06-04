(function () {
  "use strict";

  var API_BASE = (window.POKEPON_API_BASE || "").replace(/\/+$/, "");
  var SESSION_KEY = "pokepon-session";
  var REFRESH_MS = 60000;

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

  function formatRelativeTime(iso) {
    if (!iso) return "";
    var t = Date.parse(iso);
    if (isNaN(t)) return "";
    var diff = Date.now() - t;
    var sec = Math.floor(diff / 1000);
    if (sec < 60) return "just now";
    var min = Math.floor(sec / 60);
    if (min < 60) return min + "m ago";
    var hr = Math.floor(min / 60);
    if (hr < 48) return hr + "h ago";
    var day = Math.floor(hr / 24);
    if (day < 14) return day + "d ago";
    return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  function profileName(profiles, id) {
    if (!id) return "another player";
    var p = profiles && profiles[String(id)];
    return p ? displayName(p) : "Player";
  }

  function formatMoney(n, currency) {
    var v = Number(n) || 0;
    if (v <= 0) return "";
    if (currency === "crystals") return formatCr(v);
    return "₽" + v.toLocaleString();
  }

  var state = {
    authenticated: false,
    me: null,
    feed: null,
    refreshTimer: null,
  };

  var els = {
    sidebarUser: document.getElementById("sidebar-user"),
    userAvatar: document.getElementById("user-avatar"),
    userName: document.getElementById("user-name"),
    btnLogin: document.getElementById("btn-login"),
    btnLogout: document.getElementById("btn-logout"),
    gate: document.getElementById("activity-gate"),
    panel: document.getElementById("activity-panel"),
    luck: document.getElementById("activity-luck"),
    status: document.getElementById("activity-status"),
    feed: document.getElementById("activity-feed"),
    empty: document.getElementById("activity-empty"),
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

  function renderLuck(luck) {
    if (!els.luck) return;
    if (!luck || !luck.label) {
      els.luck.hidden = true;
      els.luck.innerHTML = "";
      return;
    }
    els.luck.hidden = false;
    els.luck.innerHTML = "<p>🍀 <strong>Weekend luck</strong> — " + escapeHtml(luck.label) + "</p>";
  }

  function itemTitle(item) {
    var card = item.card || {};
    var name = card.name || "Card";
    if (item.kind === "drop") return (item.source_label || "Acquired") + ": " + name;
    if (item.kind === "trade") return "Trade completed";
    if (item.kind === "auction_won") return "Won auction: " + name;
    if (item.kind === "auction_sold") return "Sold at auction: " + name;
    if (item.kind === "mission") return "Mission claimed";
    return "Activity";
  }

  function kindLabel(kind) {
    if (kind === "drop") return "Drop / pack";
    if (kind === "trade") return "Trade";
    if (kind === "auction_won") return "Auction win";
    if (kind === "auction_sold") return "Auction sale";
    if (kind === "mission") return "Mission";
    return kind;
  }

  function itemDetail(item, profiles) {
    if (item.kind === "drop") {
      var set = item.card && item.card.set_name;
      var rar = item.card && item.card.rarity && item.card.rarity.display_name;
      var bits = [];
      if (set) bits.push(set);
      if (rar) bits.push(rar);
      if (item.public_id) {
        bits.push(
          '<a href="/collection/?q=' +
            encodeURIComponent(item.public_id) +
            '">' +
            escapeHtml(item.public_id) +
            "</a>"
        );
      }
      return bits.join(" · ") || "";
    }
    if (item.kind === "trade") {
      var partner = profileName(profiles, item.partner_discord_id);
      var parts = ["With " + escapeHtml(partner)];
      if (item.cards_received) parts.push("received " + item.cards_received + " card(s)");
      if (item.cards_sent) parts.push("sent " + item.cards_sent + " card(s)");
      var got =
        formatMoney(item.pokedollars_received, "pokedollars") ||
        formatMoney(item.crystals_received, "crystals");
      var sent =
        formatMoney(item.pokedollars_sent, "pokedollars") ||
        formatMoney(item.crystals_sent, "crystals");
      if (got) parts.push("got " + escapeHtml(got));
      if (sent) parts.push("paid " + escapeHtml(sent));
      return parts.join(" · ");
    }
    if (item.kind === "auction_won" || item.kind === "auction_sold") {
      var who = profileName(profiles, item.counterparty_discord_id);
      var amt = formatMoney(item.amount, item.currency);
      var line =
        item.kind === "auction_won"
          ? "Paid " + escapeHtml(amt) + " to " + escapeHtml(who)
          : "Buyer " + escapeHtml(who) + " · " + escapeHtml(amt);
      if (item.public_id) {
        line +=
          ' · <a href="/auctions/?q=' +
          encodeURIComponent(item.public_id) +
          '">#' +
          escapeHtml(String(item.auction_id)) +
          "</a>";
      }
      return line;
    }
    if (item.kind === "mission") {
      return (
        escapeHtml(item.description || "Mission") +
        " · " +
        escapeHtml(formatCr(item.reward_crystals || 0))
      );
    }
    return "";
  }

  function renderFeed(data) {
    state.feed = data;
    renderLuck(data.luck);
    if (!els.feed) return;
    els.feed.innerHTML = "";
    var items = data.items || [];
    if (!items.length) {
      if (els.empty) els.empty.hidden = false;
      return;
    }
    if (els.empty) els.empty.hidden = true;
    var profiles = data.profiles || {};
    items.forEach(function (item) {
      var li = document.createElement("li");
      li.className = "activity-item";
      var card = item.card || {};
      var thumb = "";
      if (card.image_small_url) {
        thumb =
          '<img class="activity-item-thumb" src="' +
          escapeHtml(card.image_small_url) +
          '" alt="" loading="lazy" />';
      }
      li.innerHTML =
        thumb +
        '<div class="activity-item-body">' +
        '<span class="activity-kind">' +
        escapeHtml(kindLabel(item.kind)) +
        "</span>" +
        '<div class="activity-item-head">' +
        '<p class="activity-item-title">' +
        escapeHtml(itemTitle(item)) +
        "</p>" +
        '<time class="activity-item-time" datetime="' +
        escapeHtml(item.at || "") +
        '">' +
        escapeHtml(formatRelativeTime(item.at)) +
        "</time>" +
        "</div>" +
        '<p class="activity-item-detail">' +
        itemDetail(item, profiles) +
        "</p>" +
        "</div>";
      els.feed.appendChild(li);
    });
  }

  function showSignedOut() {
    state.authenticated = false;
    setSidebarState("signedout");
    if (els.gate) els.gate.hidden = false;
    if (els.panel) els.panel.hidden = true;
    setStatus("");
  }

  function showSignedIn() {
    state.authenticated = true;
    setSidebarState("signedin");
    if (els.gate) els.gate.hidden = true;
    if (els.panel) els.panel.hidden = false;
  }

  function loadFeed() {
    if (!state.authenticated) return Promise.resolve();
    setStatus("Loading…");
    return apiFetch("/api/me/activity?limit=50")
      .then(function (res) {
        if (res.status === 401) {
          showSignedOut();
          return null;
        }
        if (!res.ok) throw new Error("feed_failed");
        return res.json();
      })
      .then(function (data) {
        if (!data) return;
        setStatus("");
        renderFeed(data);
      })
      .catch(function () {
        setStatus("Could not load activity. Try again in a moment.");
      });
  }

  function loadSession() {
    setSidebarState("loading");
    return apiFetch("/api/me")
      .then(function (res) {
        if (!res.ok) {
          showSignedOut();
          return;
        }
        return res.json();
      })
      .then(function (data) {
        if (!data || !data.authenticated) {
          showSignedOut();
          return;
        }
        state.me = data.user;
        updateSidebarUser(data.user);
        showSignedIn();
        return loadFeed();
      })
      .catch(function () {
        showSignedOut();
      });
  }

  function startOAuth() {
    var returnTo = window.location.pathname + window.location.search;
    window.location.href = api("/oauth/discord/start?return_to=" + encodeURIComponent(returnTo));
  }

  function bindLogin(btn) {
    if (!btn) return;
    btn.addEventListener("click", startOAuth);
  }

  function bindLogout() {
    if (!els.btnLogout) return;
    els.btnLogout.addEventListener("click", function () {
      apiFetch("/oauth/logout", { method: "POST" }).finally(function () {
        try {
          localStorage.removeItem(SESSION_KEY);
        } catch (_) {}
        showSignedOut();
      });
    });
  }

  function scheduleRefresh() {
    if (state.refreshTimer) clearInterval(state.refreshTimer);
    state.refreshTimer = setInterval(function () {
      if (state.authenticated) loadFeed();
    }, REFRESH_MS);
  }

  captureSessionFromFragment();
  bindLogin(els.btnLogin);
  bindLogin(els.btnLoginMain);
  bindLogout();
  loadSession();
  scheduleRefresh();

  document.addEventListener("pokepon:session", function () {
    loadSession();
  });
})();
