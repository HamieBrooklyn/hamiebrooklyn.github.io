/* App pages — Discord event strip at top of .app-main */
(function () {
  "use strict";

  var API_BASE = (window.POKEPON_API_BASE || "").replace(/\/+$/, "");
  var tickTimer = null;
  var refreshTimer = null;
  var bannerEl = null;

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

  function formatScheduleLine(isoStart, isoEnd) {
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

  function countdownLabel(status, startAt, endAt, now) {
    if (status === "scheduled") {
      if (!startAt) return { text: "Scheduled", done: false };
      var untilStart = startAt.getTime() - now;
      if (untilStart <= 0) return { text: "Starting soon", done: false };
      return { text: "Starts in " + formatCountdownParts(untilStart), done: false };
    }
    if (status === "active") {
      if (!endAt) return { text: "Live now", done: false };
      var untilEnd = endAt.getTime() - now;
      if (untilEnd <= 0) return { text: "Ending now", done: true };
      return { text: "Ends in " + formatCountdownParts(untilEnd), done: false };
    }
    return { text: "", done: false };
  }

  function ensureBannerHost() {
    var main = document.querySelector(".app-main");
    if (!main) return null;
    var el = document.getElementById("app-events-banner");
    if (!el) {
      el = document.createElement("aside");
      el.id = "app-events-banner";
      el.className = "app-events-banner";
      el.hidden = true;
      el.setAttribute("aria-label", "Discord community event");
      main.insertBefore(el, main.firstChild);
    }
    return el;
  }

  function updateCountdown() {
    if (!bannerEl || bannerEl.hidden) return;
    var el = bannerEl.querySelector(".app-events-banner-countdown");
    if (!el) return;
    var status = el.getAttribute("data-status") || "";
    var startAt = parseIso(el.getAttribute("data-start"));
    var endAt = parseIso(el.getAttribute("data-end"));
    var info = countdownLabel(status, startAt, endAt, Date.now());
    if (info.done && status === "active") {
      bannerEl.hidden = true;
      stopTimers();
      return;
    }
    el.textContent = info.text;
    el.classList.toggle("app-events-banner-countdown-live", status === "active");
    el.classList.toggle("app-events-banner-countdown-soon", status === "scheduled");
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
    bannerEl = ensureBannerHost();
    if (!bannerEl) return;

    if (!ev) {
      bannerEl.hidden = true;
      bannerEl.innerHTML = "";
      stopTimers();
      return;
    }

    var status = ev.status === "active" ? "active" : "scheduled";
    var badge =
      status === "active"
        ? '<span class="app-events-banner-badge app-events-banner-badge-live">Live</span>'
        : '<span class="app-events-banner-badge">Scheduled</span>';
    var schedule = formatScheduleLine(ev.start_at, ev.end_at);
    var loc = ev.location
      ? '<span class="app-events-banner-location">' + escapeHtml(ev.location) + "</span>"
      : "";
    var desc = ev.description
      ? '<p class="app-events-banner-desc">' +
        escapeHtml(ev.description.slice(0, 160)) +
        (ev.description.length > 160 ? "…" : "") +
        "</p>"
      : "";
    var media = ev.image_url
      ? '<a class="app-events-banner-media" href="' +
        escapeHtml(ev.url || "#") +
        '" target="_blank" rel="noopener noreferrer">' +
        '<img class="app-events-banner-cover" src="' +
        escapeHtml(ev.image_url) +
        '" alt="" loading="lazy" decoding="async" />' +
        "</a>"
      : "";

    bannerEl.innerHTML =
      '<div class="app-events-banner-inner">' +
      media +
      '<div class="app-events-banner-body">' +
      '<p class="app-events-banner-kicker">Discord event</p>' +
      '<div class="app-events-banner-head">' +
      badge +
      '<h2 class="app-events-banner-title">' +
      escapeHtml(ev.name || "Community event") +
      "</h2>" +
      "</div>" +
      '<p class="app-events-banner-countdown app-events-banner-countdown-soon" data-status="' +
      escapeHtml(status) +
      '" data-start="' +
      escapeHtml(ev.start_at || "") +
      '" data-end="' +
      escapeHtml(ev.end_at || "") +
      '"></p>' +
      (schedule
        ? '<p class="app-events-banner-when">' +
          escapeHtml(schedule) +
          (loc ? " · " + loc : "") +
          "</p>"
        : loc
          ? '<p class="app-events-banner-when">' + loc + "</p>"
          : "") +
      desc +
      "</div>" +
      '<a class="btn btn-primary btn-small app-events-banner-cta" href="' +
      escapeHtml(ev.url || "#") +
      '" target="_blank" rel="noopener noreferrer">Open in Discord</a>' +
      "</div>";

    bannerEl.hidden = false;
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
        if (bannerEl) bannerEl.hidden = true;
        stopTimers();
      });
  }

  function init() {
    if (!document.querySelector(".app-main")) return;
    ensureBannerHost();
    load();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
