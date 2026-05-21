/* Shared app chrome — sidebar nav, mobile drawer, profile shortcut */
(function () {
  "use strict";

  var MAIN_NAV = [
    { key: "collection", href: "/collection/", icon: "▣", label: "Collection" },
    { key: "pokedex", href: "/pokedex/", icon: "◎", label: "Pokédex" },
    { key: "craft", href: "/craft/", icon: "⚗", label: "Crafting" },
    { key: "packs", href: "/packs/", icon: "▥", label: "Packs" },
    { key: "deck", href: "/deck/", icon: "⚔", label: "Deck Editor" },
    { key: "trades", href: "/trades/", icon: "⇄", label: "Trades" },
    { key: "auctions", href: "/auctions/", icon: "⚖", label: "Auctions" },
    { key: "leaderboard", href: "/leaderboard/", icon: "★", label: "Leaderboards" },
    { key: "shop", href: "/shop/", icon: "◆", label: "Shop" },
  ];

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

  function navLinkHtml(item, activeKey) {
    var active = item.key === activeKey;
    return (
      "<li><a class=\"sidebar-link" +
      (active ? " is-active" : "") +
      "\" href=\"" +
      item.href +
      "\"" +
      (active ? ' aria-current="page"' : "") +
      "><span class=\"sidebar-link-icon\" aria-hidden=\"true\">" +
      item.icon +
      '</span><span class="sidebar-link-text">' +
      item.label +
      "</span></a></li>"
    );
  }

  function normalizeSidebarNav() {
    var nav = document.querySelector(".sidebar-nav");
    if (!nav) return;
    var firstUl = nav.querySelector("ul");
    if (!firstUl) return;

    var activeKey = activeNavKey();
    firstUl.innerHTML = MAIN_NAV.map(function (item) {
      return navLinkHtml(item, activeKey);
    }).join("");
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
    normalizeSidebarNav();
    initSidebar();
    initProfileShortcut();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
