(function () {
  "use strict";

  var POLL_MS = 45000;
  var state = {
    unread: 0,
    notifyBrowser: false,
    lastSeenId: 0,
    open: false,
    items: [],
    pollTimer: null,
  };

  function apiFetch(path, options) {
    if (window.PokePonApp && window.PokePonApp.apiFetch) {
      return window.PokePonApp.apiFetch(path, options);
    }
    return Promise.reject(new Error("no api"));
  }

  function signedIn() {
    var block = document.querySelector(".sidebar-user-signedin");
    return !!(block && !block.hidden);
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function relativeTime(iso) {
    if (!iso) return "";
    var t = Date.parse(iso);
    if (isNaN(t)) return "";
    var diff = Date.now() - t;
    var min = Math.floor(diff / 60000);
    if (min < 1) return "just now";
    if (min < 60) return min + "m ago";
    var hr = Math.floor(min / 60);
    if (hr < 48) return hr + "h ago";
    return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  function ensureBell() {
    if (document.getElementById("sidebar-notify-wrap")) return;
    var profile = document.querySelector(".sidebar-user-signedin .sidebar-user-profile");
    if (!profile) return;
    var wrap = document.createElement("div");
    wrap.id = "sidebar-notify-wrap";
    wrap.className = "sidebar-notify-wrap";
    wrap.innerHTML =
      '<button type="button" class="sidebar-notify-btn" id="sidebar-notify-btn" aria-expanded="false" aria-controls="sidebar-notify-panel" title="Notifications">' +
      '<span class="sidebar-notify-icon" aria-hidden="true">🔔</span>' +
      '<span class="sidebar-notify-badge" id="sidebar-notify-badge" hidden>0</span>' +
      "</button>" +
      '<div class="sidebar-notify-panel" id="sidebar-notify-panel" hidden role="dialog" aria-label="Notifications">' +
      '<div class="sidebar-notify-head">' +
      "<strong>Notifications</strong>" +
      '<button type="button" class="btn-link sidebar-notify-mark" id="sidebar-notify-mark">Mark all read</button>' +
      "</div>" +
      '<ul class="sidebar-notify-list" id="sidebar-notify-list"></ul>' +
      '<p class="sidebar-notify-empty" id="sidebar-notify-empty" hidden>No notifications yet.</p>' +
      '<p class="sidebar-notify-foot"><a href="/settings/#notifications">Notification settings</a></p>' +
      "</div>";
    profile.appendChild(wrap);

    document.getElementById("sidebar-notify-btn").addEventListener("click", togglePanel);
    document.getElementById("sidebar-notify-mark").addEventListener("click", markAllRead);
    document.addEventListener("click", function (e) {
      if (!state.open) return;
      if (wrap.contains(e.target)) return;
      closePanel();
    });
  }

  function updateBadge() {
    var badge = document.getElementById("sidebar-notify-badge");
    if (!badge) return;
    if (state.unread > 0) {
      badge.hidden = false;
      badge.textContent = state.unread > 99 ? "99+" : String(state.unread);
    } else {
      badge.hidden = true;
    }
  }

  function renderList() {
    var list = document.getElementById("sidebar-notify-list");
    var empty = document.getElementById("sidebar-notify-empty");
    if (!list) return;
    list.innerHTML = "";
    if (!state.items.length) {
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;
    state.items.forEach(function (n) {
      var li = document.createElement("li");
      li.className = "sidebar-notify-item" + (n.read ? " is-read" : "");
      var inner =
        '<div class="sidebar-notify-item-head">' +
        "<span class=\"sidebar-notify-item-title\">" +
        escapeHtml(n.title) +
        "</span>" +
        '<time class="sidebar-notify-item-time">' +
        escapeHtml(relativeTime(n.created_at)) +
        "</time>" +
        "</div>" +
        '<p class="sidebar-notify-item-body">' +
        escapeHtml(n.body) +
        "</p>";
      if (n.href) {
        li.innerHTML =
          '<a class="sidebar-notify-item-link" href="' +
          escapeHtml(n.href) +
          '" data-id="' +
          escapeHtml(String(n.id)) +
          '">' +
          inner +
          "</a>";
      } else {
        li.innerHTML = inner;
      }
      list.appendChild(li);
    });
    list.querySelectorAll(".sidebar-notify-item-link").forEach(function (a) {
      a.addEventListener("click", function () {
        var id = parseInt(a.getAttribute("data-id"), 10);
        if (id) markRead([id]);
      });
    });
  }

  function maybeBrowserAlert(items) {
    if (!state.notifyBrowser || !window.Notification || Notification.permission !== "granted") {
      return;
    }
    items.forEach(function (n) {
      if (n.read || n.id <= state.lastSeenId) return;
      try {
        var note = new Notification(n.title, {
          body: n.body,
          tag: "pokepon-" + n.id,
        });
        if (n.href) {
          note.onclick = function () {
            window.focus();
            window.location.href = n.href;
          };
        }
      } catch (_) {}
      if (n.id > state.lastSeenId) state.lastSeenId = n.id;
    });
  }

  function refreshNotifications() {
    if (!signedIn()) return Promise.resolve();
    return apiFetch("/api/me/notifications/summary")
      .then(function (r) {
        if (!r.ok) return null;
        return r.json();
      })
      .then(function (summary) {
        if (!summary) return;
        state.unread = Number(summary.unread_count) || 0;
        state.notifyBrowser = !!summary.notify_browser;
        updateBadge();
        if (state.open) return loadList(true);
      })
      .catch(function () {});
  }

  function loadList(showBrowser) {
    return apiFetch("/api/me/notifications?limit=20")
      .then(function (r) {
        if (!r.ok) return null;
        return r.json();
      })
      .then(function (data) {
        if (!data) return;
        state.items = data.notifications || [];
        renderList();
        if (showBrowser) maybeBrowserAlert(state.items);
      });
  }

  function markRead(ids) {
    return apiFetch("/api/me/notifications/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: ids }),
    }).then(function () {
      return refreshNotifications();
    });
  }

  function markAllRead() {
    return apiFetch("/api/me/notifications/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    }).then(function () {
      state.unread = 0;
      updateBadge();
      return loadList(false);
    });
  }

  function togglePanel() {
    state.open = !state.open;
    var panel = document.getElementById("sidebar-notify-panel");
    var btn = document.getElementById("sidebar-notify-btn");
    if (panel) panel.hidden = !state.open;
    if (btn) btn.setAttribute("aria-expanded", state.open ? "true" : "false");
    if (state.open) loadList(false);
  }

  function closePanel() {
    state.open = false;
    var panel = document.getElementById("sidebar-notify-panel");
    var btn = document.getElementById("sidebar-notify-btn");
    if (panel) panel.hidden = true;
    if (btn) btn.setAttribute("aria-expanded", "false");
  }

  function schedulePoll() {
    if (state.pollTimer) clearInterval(state.pollTimer);
    state.pollTimer = setInterval(function () {
      if (signedIn()) refreshNotifications();
    }, POLL_MS);
  }

  function init() {
    ensureBell();
    if (!signedIn()) return;
    ensureBell();
    refreshNotifications().then(function () {
      return loadList(true);
    });
    schedulePoll();
    var signedInEl = document.querySelector(".sidebar-user-signedin");
    if (signedInEl) {
      new MutationObserver(function () {
        if (!signedInEl.hidden) {
          ensureBell();
          refreshNotifications();
        }
      }).observe(signedInEl, { attributes: true, attributeFilter: ["hidden"] });
    }
  }

  window.PokePonApp = window.PokePonApp || {};
  window.PokePonApp.refreshNotifications = refreshNotifications;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
