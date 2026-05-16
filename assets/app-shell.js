/* Shared app chrome — mobile sidebar backdrop dismiss */
(function () {
  "use strict";

  function init() {
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

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
