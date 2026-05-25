/* App pages — thin fixed Discord event bar at top of viewport */
(function () {
  "use strict";

  var API_BASE = (window.POKEPON_API_BASE || "").replace(/\/+$/, "");
  var BAR_HEIGHT_PX = 36;
  var tickTimer = null;
  var refreshTimer = null;
  var barEl = null;

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function parseIso(iso) {
    if (!iso) return null;
    var d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function formatScheduleShort(isoStart, isoEnd) {
    var start = parseIso(isoStart);
    if (!start) return "";
    var opts = {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    };
    var line = start.toLocaleString(undefined, opts);
    var end = parseIso(isoEnd);
    if (end && end.getTime() > start.getTime()) {
      var endOpts = { hour: "numeric", minute: "2-digit" };
      if (end.toDateString() !== start.toDateString()) {
        endOpts = { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" };
      }
      line += " – " + end.toLocaleString(undefined, endOpts);
    }
    return line;
  }

  function formatCountdownParts(ms) {
    if (ms <= 0) return null;
    var totalSec = Math.floor(ms / 1000);
    var days = Math.floor(totalSec / 86400);
    totalSec %= 86400;
    var hours = Math.floor(totalSec / 3600);
    totalSec %= 3600;
    var minutes = Math.floor(totalSec / 60);
    var seconds = totalSec % 60;
    var parts = [];
    if (days > 0) parts.push(days + "d");
    if (hours > 0 || days > 0) parts.push(hours + "h");
    if (minutes > 0 || hours > 0 || days > 0) parts.push(minutes + "m");
    parts.push(seconds + "s");
    return parts.join(" ");
  }

  function effectiveStatus(status, startAt, endAt, now) {
    if (status === "active") return "active";
    if (startAt && startAt.getTime() <= now) {
      if (!endAt || endAt.getTime() > now) return "active";
    }
    return status === "active" ? "active" : "scheduled";
  }

  function countdownLabel(status, startAt, endAt, now) {
    status = effectiveStatus(status, startAt, endAt, now);
    if (status === "scheduled") {
      if (!startAt) return { text: "Scheduled", done: false, status: status };
      var untilStart = startAt.getTime() - now;
      if (untilStart <= 0) return { text: "Starting soon", done: false, status: status };
      return { text: "Starts in " + formatCountdownParts(untilStart), done: false, status: status };
    }
    if (status === "active") {
      if (!endAt) return { text: "Live now", done: false, status: status };
      var untilEnd = endAt.getTime() - now;
      if (untilEnd <= 0) return { text: "Ending now", done: true, status: status };
      return { text: "Ends in " + formatCountdownParts(untilEnd), done: false, status: status };
    }
    return { text: "", done: false, status: status };
  }

  function setBarVisible(show) {
    document.body.classList.toggle("has-app-events-bar", show);
    document.documentElement.style.setProperty(
      "--app-events-bar-height",
      show ? BAR_HEIGHT_PX + "px" : "0px"
    );
  }

  function ensureBarHost() {
    if (!document.querySelector(".app-main")) return null;
    var el = document.getElementById("app-events-banner");
    if (!el) {
      el = document.createElement("aside");
      el.id = "app-events-banner";
      el.className = "app-events-bar";
      el.hidden = true;
      el.setAttribute("aria-label", "Discord community event");
      document.body.insertBefore(el, document.body.firstChild);
    }
    return el;
  }

  function updateCountdown() {
    if (!barEl || barEl.hidden) return;
    var el = barEl.querySelector(".app-events-bar-countdown");
    if (!el) return;
    var status = el.getAttribute("data-status") || "";
    var startAt = parseIso(el.getAttribute("data-start"));
    var endAt = parseIso(el.getAttribute("data-end"));
    var info = countdownLabel(status, startAt, endAt, Date.now());
    if (info.done && info.status === "active") {
      barEl.hidden = true;
      setBarVisible(false);
      stopTimers();
      return;
    }
    el.textContent = info.text;
    el.classList.toggle("app-events-bar-countdown-live", info.status === "active");
    el.classList.toggle("app-events-bar-countdown-soon", info.status === "scheduled");
  }

  function stopTimers() {
    if (tickTimer) {
      clearInterval(tickTimer);
      tickTimer = null;
    }
    if (refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }
  }

  function startTimers() {
    stopTimers();
    updateCountdown();
    tickTimer = setInterval(updateCountdown, 1000);
    refreshTimer = setInterval(load, 120000);
  }

  function pickPrimaryEvent(events) {
    if (!events || !events.length) return null;
    var sorted = events.slice().sort(function (a, b) {
      var sa = parseIso(a.start_at);
      var sb = parseIso(b.start_at);
      if (a.status === "active" && b.status !== "active") return -1;
      if (b.status === "active" && a.status !== "active") return 1;
      if (!sa && !sb) return 0;
      if (!sa) return 1;
      if (!sb) return -1;
      return sa.getTime() - sb.getTime();
    });
    return sorted[0];
  }

  function render(ev) {
    barEl = ensureBarHost();
    if (!barEl) return;

    if (!ev) {
      barEl.hidden = true;
      barEl.innerHTML = "";
      setBarVisible(false);
      stopTimers();
      return;
    }

    var rawStatus = ev.status === "active" ? "active" : "scheduled";
    var status = effectiveStatus(
      rawStatus,
      parseIso(ev.start_at),
      parseIso(ev.end_at),
      Date.now()
    );
    var badge =
      status === "active"
        ? '<span class="app-events-bar-badge app-events-bar-badge-live">Live</span>'
        : '<span class="app-events-bar-badge">Scheduled</span>';
    var schedule = formatScheduleShort(ev.start_at, ev.end_at);
    var meta = schedule;
    if (ev.location) {
      meta = meta ? meta + " · " + escapeHtml(ev.location) : escapeHtml(ev.location);
    }

    barEl.innerHTML =
      '<a class="app-events-bar-inner" href="' +
      escapeHtml(ev.url || "#") +
      '" target="_blank" rel="noopener noreferrer">' +
      badge +
      '<span class="app-events-bar-title">' +
      escapeHtml(ev.name || "Discord event") +
      "</span>" +
      '<span class="app-events-bar-countdown app-events-bar-countdown-soon" data-status="' +
      escapeHtml(status) +
      '" data-start="' +
      escapeHtml(ev.start_at || "") +
      '" data-end="' +
      escapeHtml(ev.end_at || "") +
      '"></span>' +
      (meta ? '<span class="app-events-bar-meta">' + meta + "</span>" : "") +
      '<span class="app-events-bar-cta">Open in Discord</span>' +
      "</a>";

    barEl.hidden = false;
    setBarVisible(true);
    startTimers();
  }

  function load() {
    if (!API_BASE) return;
    fetch(API_BASE + "/api/events", {
      headers: { "ngrok-skip-browser-warning": "1" },
    })
      .then(function (r) {
        if (!r.ok) throw new Error("events");
        return r.json();
      })
      .then(function (data) {
        var events = data && data.events ? data.events : [];
        render(pickPrimaryEvent(events));
      })
      .catch(function () {
        if (barEl) barEl.hidden = true;
        setBarVisible(false);
        stopTimers();
      });
  }

  function init() {
    if (!document.querySelector(".app-main")) return;
    document.documentElement.style.setProperty("--app-events-bar-height", "0px");
    ensureBarHost();
    load();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
