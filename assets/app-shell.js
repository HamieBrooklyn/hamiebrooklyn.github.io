/* Shared app chrome — mobile sidebar + profile shortcut from avatar */
(function () {
  "use strict";

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
    initSidebar();
    initProfileShortcut();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
