/* PokePon shop — Stripe Checkout via bot API */
(function () {
  "use strict";

  var API_BASE = (window.POKEPON_API_BASE || "").replace(/\/+$/, "");
  function api(path) {
    return API_BASE + path;
  }

  var SESSION_KEY = "pokepon-session";

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

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatPd(n) {
    return "₽" + Number(n).toLocaleString();
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

  var state = {
    authenticated: false,
    me: null,
    catalog: null,
    checkoutSku: null,
  };

  var els = {
    sidebarUser: document.getElementById("sidebar-user"),
    userAvatar: document.getElementById("user-avatar"),
    userName: document.getElementById("user-name"),
    btnLogin: document.getElementById("btn-login"),
    btnLogout: document.getElementById("btn-logout"),
    balances: document.getElementById("shop-balances"),
    balancePd: document.getElementById("balance-pd"),
    balanceCr: document.getElementById("balance-cr"),
    status: document.getElementById("shop-status"),
    gridPerks: document.getElementById("shop-grid-perks"),
    gridPd: document.getElementById("shop-grid-pd"),
    gridCr: document.getElementById("shop-grid-cr"),
    bannerSuccess: document.getElementById("shop-banner-success"),
    bannerCancel: document.getElementById("shop-banner-cancel"),
    bannerError: document.getElementById("shop-banner-error"),
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

  function setStatus(text, isError) {
    if (!els.status) return;
    els.status.textContent = text || "";
    els.status.classList.toggle("is-error", !!isError);
  }

  function showQueryBanners() {
    var params = new URLSearchParams(window.location.search);
    if (els.bannerSuccess) els.bannerSuccess.hidden = params.get("success") !== "1";
    if (els.bannerCancel) els.bannerCancel.hidden = params.get("cancel") !== "1";
    if (params.get("success") === "1" || params.get("cancel") === "1") {
      var clean = window.location.pathname;
      window.history.replaceState(null, "", clean);
    }
  }

  function badgeLabel(badge) {
    if (badge === "popular") return "Popular";
    if (badge === "best_value") return "Best value";
    return "";
  }

  function renderShopItem(item, sectionKind) {
    var extraClass =
      (sectionKind === "crystals" ? " shop-pack-crystals" : "") +
      (sectionKind === "perks" ? " shop-pack-perk" : "") +
      (item.badge ? " is-" + item.badge : "") +
      (item.owned ? " is-owned" : "");
    var badge = item.badge
      ? '<span class="shop-pack-badge">' + escapeHtml(badgeLabel(item.badge)) + "</span>"
      : "";
    if (item.one_time) {
      badge +=
        '<span class="shop-pack-badge shop-pack-badge-once">One-time</span>';
    }
    if (item.owned) {
      badge += '<span class="shop-pack-badge shop-pack-badge-owned">Owned</span>';
    }
    var badgeRow = badge
      ? '<div class="shop-pack-badges">' + badge + "</div>"
      : "";
    var disabled = !item.available || item.owned;
    var btnLabel = state.authenticated
      ? item.owned
        ? "Already owned"
        : disabled
          ? "Coming soon"
          : "Buy now"
      : "Sign in to buy";
    var priceHtml = "";
    if (item.price && item.price.display) {
      priceHtml =
        '<p class="shop-pack-price">' + escapeHtml(item.price.display) + "</p>";
    }

    return (
      '<article class="shop-pack' +
      extraClass +
      '">' +
      badgeRow +
      priceHtml +
      '<p class="shop-pack-grant">' +
      escapeHtml(item.grant_label) +
      "</p>" +
      '<h3 class="shop-pack-title">' +
      escapeHtml(item.title) +
      "</h3>" +
      '<p class="shop-pack-desc">' +
      escapeHtml(item.description) +
      "</p>" +
      '<button type="button" class="btn btn-primary shop-buy-btn" data-sku="' +
      escapeHtml(item.id) +
      '"' +
      (disabled || !state.authenticated ? " disabled" : "") +
      ">" +
      btnLabel +
      "</button>" +
      "</article>"
    );
  }

  function renderCatalog(data) {
    if (!data.enabled) {
      setStatus(
        "Shop is not configured on the server yet. Add Stripe Price IDs to the bot environment.",
        true
      );
    }
    if (els.gridPerks) {
      var perks = data.perks || [];
      els.gridPerks.innerHTML = perks.length
        ? perks
            .map(function (item) {
              return renderShopItem(item, "perks");
            })
            .join("")
        : '<p class="shop-grid-empty muted">Perk products are not configured yet (add STRIPE_PRICE_HALF_DROP_COOLDOWN and STRIPE_PRICE_RANDOM_PACK on the bot).</p>';
    }
    if (els.gridPd) {
      els.gridPd.innerHTML = (data.pokedollars || [])
        .map(function (item) {
          return renderShopItem(item, "pokedollars");
        })
        .join("");
    }
    if (els.gridCr) {
      els.gridCr.innerHTML = (data.crystals || [])
        .map(function (item) {
          return renderShopItem(item, "crystals");
        })
        .join("");
    }

    document.querySelectorAll(".shop-buy-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var sku = btn.getAttribute("data-sku");
        if (sku) startCheckout(sku, btn);
      });
    });
  }

  function updateBalances(balances) {
    if (!balances || !els.balances) {
      if (els.balances) els.balances.hidden = true;
      return;
    }
    els.balances.hidden = false;
    if (els.balancePd) els.balancePd.textContent = formatPd(balances.pokedollars);
    if (els.balanceCr) els.balanceCr.textContent = formatCr(balances.crystals);
    if (window.PokePonApp && window.PokePonApp.notifyBalancesChanged) {
      window.PokePonApp.notifyBalancesChanged();
    }
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

  async function loadCatalog() {
    if (!API_BASE) {
      setStatus(
        "API URL is not configured. Set ?api=https://your-bot-host once, or update the meta tag.",
        true
      );
      return;
    }
    setStatus("Loading shop…");
    try {
      var res = await apiFetch("/api/shop/catalog");
      if (!res.ok) throw new Error("catalog");
      var data = await res.json();
      state.catalog = data;
      updateBalances(data.balances);
      renderCatalog(data);
      if (data.enabled) setStatus("");
    } catch (_) {
      setStatus("Could not load the shop. Is the bot API running?", true);
    }
  }

  async function startCheckout(skuId, buttonEl) {
    if (!state.authenticated) {
      if (els.btnLogin) els.btnLogin.click();
      return;
    }
    if (state.checkoutSku) return;
    state.checkoutSku = skuId;
    var orig = buttonEl.textContent;
    buttonEl.disabled = true;
    buttonEl.textContent = "Redirecting…";
    setStatus("");

    try {
      var res = await apiFetch("/api/shop/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sku_id: skuId }),
      });
      var data = {};
      try {
        data = await res.json();
      } catch (_) {}
      if (!res.ok) {
        var msg =
          data.error === "unauthenticated"
            ? "Please sign in first."
            : data.error === "already_purchased"
              ? data.message || "You already own this one-time perk."
              : data.error === "sku_not_configured"
                ? "This item is not configured on the bot (missing STRIPE_PRICE_*)."
                : data.error === "stripe_error"
                  ? data.message ||
                    "Stripe rejected checkout. Use test price IDs with a test secret key from the same sandbox."
                  : data.error === "unknown_sku"
                    ? "Unknown shop item."
                    : "Checkout could not start (" +
                      (data.error || "HTTP " + res.status) +
                      ").";
        setStatus(msg, true);
        if (data.error === "already_purchased") {
          await loadCatalog();
        }
        return;
      }
      if (data.checkout_url) {
        window.location.href = data.checkout_url;
        return;
      }
      setStatus("Stripe did not return a checkout URL.", true);
    } catch (err) {
      var hint =
        "Could not reach the shop API. Confirm the bot is running, you are signed in, and ";
      hint +=
        window.location.origin.indexOf("www.") === 8
          ? "use https://pokepon.org (without www)."
          : "the site is using https://api.pokepon.org.";
      if (API_BASE) hint += " API: " + API_BASE + ".";
      if (err && err.message) hint += " (" + err.message + ")";
      setStatus(hint, true);
    } finally {
      state.checkoutSku = null;
      buttonEl.disabled = false;
      buttonEl.textContent = orig;
    }
  }

  function bindEvents() {
    if (els.btnLogin) {
      els.btnLogin.addEventListener("click", function () {
        if (!API_BASE) return;
        window.location.href =
          api("/auth/discord/login?return_to=") +
          encodeURIComponent(window.location.href);
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
        await loadCatalog();
      });
    }
  }

  async function init() {
    captureSessionFromFragment();
    showQueryBanners();
    bindEvents();
    setSidebarState("loading");
    await loadMe();
    await loadCatalog();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
