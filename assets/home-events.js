/* Home page — upcoming Discord events from bot API */
(function () {
  "use strict";

  var API_BASE = (window.POKEPON_API_BASE || "").replace(/\/+$/, "");
  var panel = document.getElementById("home-events");
  var listEl = document.getElementById("home-events-list");
  var tickTimer = null;
  var refreshTimer = null;

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
      var parts = formatCountdownParts(untilStart);
      return { text: "Starts in " + parts, done: false };
    }
    if (status === "active") {
      if (!endAt) return { text: "Live now", done: false };
      var untilEnd = endAt.getTime() - now;
      if (untilEnd <= 0) return { text: "Ending now", done: true };
      var endParts = formatCountdownParts(untilEnd);
      return { text: "Ends in " + endParts, done: false };
    }
    return { text: "", done: false };
  }

  function updateCountdowns() {
    if (!listEl) return;
    var now = Date.now();
    var cards = listEl.querySelectorAll(".home-events-card");
    var visible = 0;
    cards.forEach(function (card) {
      var el = card.querySelector(".home-events-countdown");
      if (!el) return;
      var status = el.getAttribute("data-status") || "";
      var startAt = parseIso(el.getAttribute("data-start"));
      var endAt = parseIso(el.getAttribute("data-end"));
      var info = countdownLabel(status, startAt, endAt, now);
      if (info.done && status === "active") {
        card.hidden = true;
        return;
      }
      visible += 1;
      el.textContent = info.text;
      el.classList.toggle("home-events-countdown-live", status === "active");
      el.classList.toggle("home-events-countdown-soon", status === "scheduled");
    });
    if (panel && cards.length > 0 && visible === 0) {
      panel.hidden = true;
    }
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
    updateCountdowns();
    tickTimer = setInterval(updateCountdowns, 1000);
    refreshTimer = setInterval(load, 120000);
  }

  function render(events) {
    if (!panel || !listEl) return;
    if (!events || !events.length) {
      panel.hidden = true;
      listEl.innerHTML = "";
      stopTimers();
      return;
    }
    panel.hidden = false;
    listEl.innerHTML = events
      .map(function (ev) {
        var status = ev.status === "active" ? "active" : "scheduled";
        var badge =
          status === "active"
            ? '<span class="home-events-badge home-events-badge-live">Live</span>'
            : '<span class="home-events-badge">Scheduled</span>';
        var schedule = formatScheduleLine(ev.start_at, ev.end_at);
        var loc = ev.location
          ? '<p class="home-events-location">' + escapeHtml(ev.location) + "</p>"
          : "";
        var desc = ev.description
          ? '<p class="home-events-desc">' +
            escapeHtml(ev.description.slice(0, 220)) +
            (ev.description.length > 220 ? "…" : "") +
            "</p>"
          : "";
        var img = ev.image_url
          ? '<img class="home-events-cover" src="' +
            escapeHtml(ev.image_url) +
            '" alt="" loading="lazy" decoding="async" />'
          : "";
        return (
          '<article class="home-events-card" data-event-id="' +
          escapeHtml(ev.id || "") +
          '">' +
          img +
          '<div class="home-events-card-body">' +
          '<div class="home-events-card-head">' +
          badge +
          '<h3 class="home-events-name">' +
          escapeHtml(ev.name || "Discord event") +
          "</h3>" +
          "</div>" +
          '<p class="home-events-countdown home-events-countdown-soon" data-status="' +
          escapeHtml(status) +
          '" data-start="' +
          escapeHtml(ev.start_at || "") +
          '" data-end="' +
          escapeHtml(ev.end_at || "") +
          '"></p>' +
          (schedule
            ? '<p class="home-events-when">' + escapeHtml(schedule) + "</p>"
            : "") +
          loc +
          desc +
          '<a class="btn btn-primary btn-small home-events-cta" href="' +
          escapeHtml(ev.url || "#") +
          '" target="_blank" rel="noopener noreferrer">Open in Discord</a>' +
          "</div></article>"
        );
      })
      .join("");
    startTimers();
  }

  function load() {
    if (!API_BASE || !panel) return;
    fetch(API_BASE + "/api/events", {
      headers: { "ngrok-skip-browser-warning": "1" },
    })
      .then(function (r) {
        if (!r.ok) throw new Error("events");
        return r.json();
      })
      .then(function (data) {
        render(data && data.events ? data.events : []);
      })
      .catch(function (err) {
        if (panel) panel.hidden = true;
        stopTimers();
        if (typeof console !== "undefined" && console.debug) {
          console.debug("Poké Pon events: could not load /api/events", err);
        }
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", load);
  } else {
    load();
  }
})();
