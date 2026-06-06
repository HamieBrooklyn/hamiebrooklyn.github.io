/* Shared app chrome — sidebar nav, mobile drawer, profile shortcut, balances */
(function () {
  "use strict";

  var BRAND_NAME = "Poké Pon";
  var SESSION_KEY = "pokepon-session";
  var LOGO_SRC = "/assets/logo.jpg";

  var NAV_SECTIONS = [
    {
      title: "Your cards",
      items: [
        { key: "collection", href: "/collection/", label: "Collection" },
        { key: "activity", href: "/activity/", label: "Activity" },
        { key: "missions", href: "/missions/", label: "Missions" },
      ],
    },
    {
      title: "Catalog",
      items: [
        { key: "pokedex", href: "/pokedex/", label: "Pokédex" },
        { key: "packs", href: "/packs/", label: "Packs" },
      ],
    },
    {
      title: "Build & play",
      items: [
        { key: "craft", href: "/craft/", label: "Crafting" },
        { key: "deck", href: "/deck/", label: "Deck editor" },
      ],
    },
    {
      title: "Multiplayer",
      items: [
        { key: "trades", href: "/trades/", label: "Trades" },
        { key: "auctions", href: "/auctions/", label: "Auctions" },
        { key: "leaderboard", href: "/leaderboard/", label: "Leaderboards" },
      ],
    },
    {
      title: "Store",
      items: [{ key: "shop", href: "/shop/", label: "Shop" }],
    },
  ];

  var ACCOUNT_NAV = [{ key: "settings", href: "/settings/", label: "Profile" }];

  var COMMUNITY_NAV = [
    {
      key: "topgg",
      href: "https://top.gg/bot/1496227239803748362/vote",
      label: "Vote on Top.gg",
      external: true,
      linkKey: "topgg-vote",
    },
    {
      key: "invite",
      href: "https://discord.com/oauth2/authorize?client_id=1496227239803748362&permissions=268954721&integration_type=0&scope=bot+applications.commands",
      label: "Add bot to server",
      external: true,
      linkKey: "bot-invite",
    },
    {
      key: "discord",
      href: "https://discord.gg/MaSEAnxTBn",
      label: "Join server",
      external: true,
      linkKey: "server-invite",
    },
  ];

  var HELP_NAV = [
    { key: "guide", href: "/#player-guide", label: "Player guide" },
    { key: "terms", href: "/terms/", label: "Terms" },
    { key: "privacy", href: "/privacy/", label: "Privacy" },
  ];

  /** Compact stroke icons — shape + color class differentiate entries. */
  var NAV_SVG = {
    collection:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>',
    activity:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="12" height="5.5" rx="1.25"/><rect x="5.5" y="10" width="12" height="5.5" rx="1.25"/><rect x="8" y="16" width="12" height="5.5" rx="1.25"/><circle cx="18.5" cy="6.5" r="2"/><path d="M17.5 6.5h2M18.5 5.5v2"/><path d="M20.5 14.5l.9 1.8 2 1-2 1.2.5 2.1-1.9-1.1-1.9 1.1.5-2.1-2-1.2 2-1z"/></svg>',
    missions:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5L18 6v5.5c0 4.8-2.8 7.8-6 8.8-3.2-1-6-4-6-8.8V6l6-2.5z"/><path d="M9.5 12.5l2 2 4.5-4.5"/><path d="M17.5 5.5l.75 1.5 1.65.35-1.2 1.05.35 1.65-1.55-.85-1.55.85.35-1.65-1.2-1.05 1.65-.35z"/></svg>',
    pokedex:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/><path d="M12 4v16M4 12h16"/><circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none"/></svg>',
    packs:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z"/><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5"/></svg>',
    craft:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3h4l1 5h-6l1-5z"/><path d="M8 8h8l2 11H6L8 8z"/><path d="M9 14h6"/></svg>',
    deck:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="4" width="11" height="15" rx="1.5"/><rect x="8" y="6" width="11" height="15" rx="1.5"/><path d="M11 10h5M11 13h5"/></svg>',
    trades:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M7 7h11l-3-3M18 17H7l3 3"/><path d="M4 12h16"/></svg>',
    auctions:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4l-6 9h4l-2 7 7-10h-4l1-6z"/></svg>',
    leaderboard:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M5 20V10M12 20V4M19 20v-6"/></svg>',
    shop:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l2.2 6.8H21l-5.5 4 2.1 6.7L12 17l-5.6 3.5 2.1-6.7L3 9.8h6.8L12 3z"/></svg>',
    settings:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    topgg:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20s-6.5-4.5-6.5-9a6.5 6.5 0 0 1 13 0c0 4.5-6.5 9-6.5 9z"/></svg>',
    invite:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg>',
    discord:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M8 9c1.5-1 3.5-1 4 0M16 9c-1.5-1-3.5-1-4 0"/><path d="M6 10c-1 2-1 5 0 8 1.5 1 4 1.5 6 1.5s4.5-.5 6-1.5c1-3 1-6 0-8"/></svg>',
    guide:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>',
    terms:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M8 4h8l2 3v13H6V7l2-3z"/><path d="M9 12h6M9 16h4"/></svg>',
    privacy:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
  };

  function normalizePath() {
    var path = window.location.pathname || "/";
    path = path.replace(/\.html$/i, "");
    if (path.length > 1 && path.charAt(path.length - 1) === "/") {
      path = path.slice(0, -1);
    }
    return path || "/";
  }

  function activeNavKey() {
    var path = normalizePath();
    if (path === "/collection" || path.indexOf("/collection/") === 0) return "collection";
    if (path === "/activity" || path.indexOf("/activity/") === 0) return "activity";
    if (path === "/missions" || path.indexOf("/missions/") === 0) return "missions";
    if (path === "/pokedex" || path.indexOf("/pokedex/") === 0) return "pokedex";
    if (path === "/craft" || path.indexOf("/craft/") === 0) return "craft";
    if (path === "/packs" || path.indexOf("/packs/") === 0) return "packs";
    if (path === "/deck" || path.indexOf("/deck/") === 0) return "deck";
    if (path === "/trades" || path.indexOf("/trades/") === 0) return "trades";
    if (path === "/auctions" || path.indexOf("/auctions/") === 0) return "auctions";
    if (path === "/leaderboard" || path.indexOf("/leaderboard/") === 0) return "leaderboard";
    if (path === "/shop" || path.indexOf("/shop/") === 0) return "shop";
    if (path === "/settings" || path.indexOf("/settings/") === 0) return "settings";
    return "";
  }

  function iconHtml(key) {
    var svg = NAV_SVG[key] || NAV_SVG.guide;
    return (
      '<span class="sidebar-link-icon nav-icon nav-icon--' +
      key +
      '" aria-hidden="true">' +
      svg +
      "</span>"
    );
  }

  function navLinkHtml(item, activeKey) {
    var active = item.key === activeKey;
    var ext = item.external ? " sidebar-link-external" : "";
    var linkKey = item.linkKey ? ' data-pokepon-link="' + item.linkKey + '"' : "";
    var target = item.external ? ' target="_blank" rel="noopener noreferrer"' : "";
    return (
      "<li><a class=\"sidebar-link" +
      (active ? " is-active" : "") +
      ext +
      '" href="' +
      item.href +
      '"' +
      (active ? ' aria-current="page"' : "") +
      linkKey +
      target +
      ">" +
      iconHtml(item.key) +
      '<span class="sidebar-link-text">' +
      item.label +
      "</span></a></li>"
    );
  }

  function sectionHtml(title, items, activeKey) {
    var html = '<p class="sidebar-section">' + title + "</p><ul>";
    items.forEach(function (item) {
      html += navLinkHtml(item, activeKey);
    });
    html += "</ul>";
    return html;
  }

  function renderSidebarNav() {
    var nav = document.querySelector(".sidebar-nav");
    if (!nav) return;

    var activeKey = activeNavKey();
    var html = "";

    NAV_SECTIONS.forEach(function (section) {
      html += sectionHtml(section.title, section.items, activeKey);
    });

    html += sectionHtml("Account", ACCOUNT_NAV, activeKey);
    html += sectionHtml("Community", COMMUNITY_NAV, activeKey);
    html += sectionHtml("Help", HELP_NAV, activeKey);

    nav.innerHTML = html;
  }

  function applyBrand() {
    document.querySelectorAll(".sidebar-logo").forEach(function (el) {
      el.classList.add("brand-lockup");
      el.innerHTML =
        '<img src="' +
        LOGO_SRC +
        '" alt="" class="brand-logo" width="36" height="36" decoding="async" />' +
        '<span class="brand-name">' +
        BRAND_NAME +
        "</span>";
    });

    document.querySelectorAll("a.logo").forEach(function (el) {
      if (el.classList.contains("sidebar-logo")) return;
      if (!el.closest(".sidebar-top") && el.getAttribute("href") !== "/" && el.getAttribute("href") !== "./") {
        return;
      }
      if (el.querySelector(".brand-logo")) return;
      el.classList.add("brand-lockup");
      el.innerHTML =
        '<img src="' +
        LOGO_SRC +
        '" alt="" class="brand-logo" width="36" height="36" decoding="async" />' +
        '<span class="brand-name">' +
        BRAND_NAME +
        "</span>";
    });

    if (document.title.indexOf("PokePon") !== -1) {
      document.title = document.title.replace(/PokePon/g, BRAND_NAME);
    }
  }

  function setSidebarOpen(sidebar, toggle, open) {
    sidebar.classList.toggle("is-open", open);
    document.body.classList.toggle("sidebar-open", open);
    if (toggle) toggle.setAttribute("aria-expanded", open ? "true" : "false");
  }

  function initSidebar() {
    var shell = document.querySelector(".app-shell");
    var sidebar = document.getElementById("sidebar");
    var toggle = document.getElementById("sidebar-toggle");
    if (!shell || !sidebar) return;

    shell.addEventListener("click", function (e) {
      if (!sidebar.classList.contains("is-open")) return;
      if (sidebar.contains(e.target)) return;
      setSidebarOpen(sidebar, toggle, false);
    });

    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape" || !sidebar.classList.contains("is-open")) return;
      setSidebarOpen(sidebar, toggle, false);
    });

    if (toggle) {
      toggle.addEventListener("click", function () {
        setSidebarOpen(sidebar, toggle, !sidebar.classList.contains("is-open"));
      });
    }
  }

  window.PokePonCopy = {
    copy: function (text, buttonEl) {
      var pid = String(text || "").trim();
      if (!pid || pid === "—") return;
      function flash(ok) {
        if (!buttonEl || !ok) return;
        var orig = buttonEl.textContent;
        buttonEl.textContent = "Copied!";
        setTimeout(function () {
          buttonEl.textContent = orig;
        }, 1500);
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
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(pid).then(function () {
          flash(true);
        }).catch(function () {
          fallbackCopy();
        });
      } else {
        fallbackCopy();
      }
    },
    appendRow: function (parent, publicId, opts) {
      if (!parent) return null;
      opts = opts || {};
      var pid = String(publicId || "").trim();
      if (!pid || pid === "—") return null;
      var row = document.createElement("div");
      row.className = opts.rowClass || "card-id-row";
      var code = document.createElement("code");
      code.className = opts.codeClass || "card-id-code";
      code.textContent = pid;
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = opts.buttonClass || "btn btn-ghost btn-copy-inline";
      btn.textContent = opts.buttonLabel || "Copy";
      btn.setAttribute("aria-label", "Copy Card ID");
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        e.preventDefault();
        window.PokePonCopy.copy(pid, btn);
      });
      row.appendChild(code);
      row.appendChild(btn);
      parent.appendChild(row);
      return row;
    },
  };

  function apiBase() {
    return (window.POKEPON_API_BASE || "").replace(/\/+$/, "");
  }

  function apiFetch(path, options) {
    options = options || {};
    options.credentials = "include";
    var headers = Object.assign({ "ngrok-skip-browser-warning": "1" }, options.headers || {});
    try {
      var token = localStorage.getItem(SESSION_KEY) || "";
      if (token) headers.Authorization = "Bearer " + token;
    } catch (_) {}
    options.headers = headers;
    return fetch(apiBase() + path, options);
  }

  function formatSidebarAmount(n) {
    return Number(n).toLocaleString();
  }

  function sidebarSignedInVisible() {
    var block = document.querySelector(".sidebar-user-signedin");
    return !!(block && !block.hidden);
  }

  function setSidebarBalancesVisible(show) {
    var el = document.getElementById("sidebar-balances");
    if (el) el.hidden = !show;
  }

  function ensureSidebarBalances() {
    document.querySelectorAll(".sidebar-user-signedin").forEach(function (block) {
      if (block.querySelector(".sidebar-user-profile")) return;

      var profile = document.createElement("div");
      profile.className = "sidebar-user-profile";
      while (block.firstChild) {
        profile.appendChild(block.firstChild);
      }
      block.appendChild(profile);

      var bal = document.createElement("div");
      bal.id = "sidebar-balances";
      bal.className = "sidebar-balances";
      bal.setAttribute("aria-label", "Your balances");
      bal.hidden = true;
      bal.innerHTML =
        '<span class="sidebar-balance sidebar-balance--pd" title="Pokedollars">' +
        '<span class="sidebar-balance-icon" aria-hidden="true">₽</span>' +
        '<span class="sidebar-balance-value" id="sidebar-balance-pd">—</span>' +
        "</span>" +
        '<span class="sidebar-balance sidebar-balance--cr" title="Crystals">' +
        '<span class="sidebar-balance-icon" aria-hidden="true">💎</span>' +
        '<span class="sidebar-balance-value" id="sidebar-balance-cr">—</span>' +
        "</span>";
      block.appendChild(bal);
    });
  }

  function refreshSidebarBalances() {
    var bal = document.getElementById("sidebar-balances");
    var pd = document.getElementById("sidebar-balance-pd");
    var cr = document.getElementById("sidebar-balance-cr");
    if (!bal || !sidebarSignedInVisible() || !apiBase()) {
      setSidebarBalancesVisible(false);
      return Promise.resolve();
    }

    return apiFetch("/api/me/balances")
      .then(function (r) {
        if (!r.ok) {
          setSidebarBalancesVisible(false);
          return;
        }
        return r.json();
      })
      .then(function (b) {
        if (!b || b.pokedollars == null) {
          setSidebarBalancesVisible(false);
          return;
        }
        if (pd) pd.textContent = formatSidebarAmount(b.pokedollars);
        if (cr) cr.textContent = formatSidebarAmount(b.crystals);
        setSidebarBalancesVisible(true);
      })
      .catch(function () {
        setSidebarBalancesVisible(false);
      });
  }

  function initSidebarBalances() {
    ensureSidebarBalances();

    var signedIn = document.querySelector(".sidebar-user-signedin");
    if (signedIn) {
      var obs = new MutationObserver(function () {
        if (!signedIn.hidden) refreshSidebarBalances();
        else setSidebarBalancesVisible(false);
      });
      obs.observe(signedIn, { attributes: true, attributeFilter: ["hidden"] });
      if (!signedIn.hidden) refreshSidebarBalances();
    }

    var sidebarUser = document.getElementById("sidebar-user");
    if (sidebarUser) {
      var stateObs = new MutationObserver(function () {
        if (sidebarUser.dataset.state === "signedin") refreshSidebarBalances();
        else if (sidebarUser.dataset.state === "signedout") setSidebarBalancesVisible(false);
      });
      stateObs.observe(sidebarUser, { attributes: true, attributeFilter: ["data-state"] });
      if (sidebarUser.dataset.state === "signedin") refreshSidebarBalances();
    }

    window.addEventListener("pokepon:balances-refresh", function () {
      refreshSidebarBalances();
    });

    window.PokePonApp = window.PokePonApp || {};
    window.PokePonApp.refreshSidebarBalances = refreshSidebarBalances;
    window.PokePonApp.notifyBalancesChanged = function () {
      window.dispatchEvent(new CustomEvent("pokepon:balances-refresh"));
    };
    window.PokePonApp.apiFetch = apiFetch;
  }

  function initProfileShortcut() {
    if (window.location.pathname.indexOf("/settings") === 0) return;

    var go = function () {
      window.location.href = "/settings/";
    };

    var avatar = document.getElementById("user-avatar");
    var name = document.getElementById("user-name");
    var textBlock = document.querySelector(".sidebar-user-signedin .sidebar-user-text");

    if (avatar) {
      avatar.style.cursor = "pointer";
      avatar.title = "Profile & settings";
      avatar.addEventListener("click", go);
    }
    if (name) {
      name.style.cursor = "pointer";
      name.title = "Profile & settings";
      name.addEventListener("click", go);
    }
    if (textBlock) {
      textBlock.addEventListener("click", go);
    }
  }

  function initNotifications() {
    if (!document.querySelector(".app-main") || !apiBase()) return;
    if (document.getElementById("pokepon-notifications-script")) return;
    var s = document.createElement("script");
    s.id = "pokepon-notifications-script";
    s.src = "/assets/notifications.js?v=1";
    s.defer = true;
    document.body.appendChild(s);
  }

  function initAppEventsBanner() {
    if (!document.querySelector(".app-main") || !apiBase()) return;
    if (document.getElementById("app-events-banner-script")) return;
    var s = document.createElement("script");
    s.id = "app-events-banner-script";
    s.src = "/assets/app-events-banner.js?v=3";
    s.defer = true;
    document.body.appendChild(s);
  }

  function initStagingEnvBanner() {
    if (document.getElementById("pokepon-staging-env-script")) return;
    var s = document.createElement("script");
    s.id = "pokepon-staging-env-script";
    s.src = "/assets/staging-env.js?v=1";
    s.defer = true;
    document.body.appendChild(s);
  }

  function init() {
    applyBrand();
    renderSidebarNav();
    initSidebar();
    initSidebarBalances();
    initProfileShortcut();
    initStagingEnvBanner();
    initNotifications();
    initAppEventsBanner();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
