/* Shared app chrome — sidebar nav, mobile drawer, profile shortcut */
(function () {
  "use strict";

  var BRAND_NAME = "Poké Pon";
  var LOGO_SRC = "/assets/logo.jpg";

  var NAV_SECTIONS = [
    {
      title: "Your cards",
      items: [
        { key: "collection", href: "/collection/", label: "Collection" },
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

  function initSidebar() {
    var shell = document.querySelector(".app-shell");
    var sidebar = document.getElementById("sidebar");
    var toggle = document.getElementById("sidebar-toggle");
    if (!shell || !sidebar) return;

    shell.addEventListener("click", function (e) {
      if (!sidebar.classList.contains("is-open")) return;
      if (sidebar.contains(e.target)) return;
      sidebar.classList.remove("is-open");
      if (toggle) toggle.setAttribute("aria-expanded", "false");
    });

    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape" || !sidebar.classList.contains("is-open")) return;
      sidebar.classList.remove("is-open");
      if (toggle) toggle.setAttribute("aria-expanded", "false");
    });

    if (toggle) {
      toggle.addEventListener("click", function () {
        var open = sidebar.classList.toggle("is-open");
        toggle.setAttribute("aria-expanded", open ? "true" : "false");
      });
    }
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

  function init() {
    applyBrand();
    renderSidebarNav();
    initSidebar();
    initProfileShortcut();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
