/* Home page — upcoming Discord events from bot API */
(function () {
  "use strict";

  var API_BASE = (window.POKEPON_API_BASE || "").replace(/\/+$/, "");
  var panel = document.getElementById("home-events");
  var listEl = document.getElementById("home-events-list");

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatWhen(isoStart, isoEnd, status) {
    if (!isoStart) return "";
    var start = new Date(isoStart);
    if (Number.isNaN(start.getTime())) return "";
    var opts = {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    };
    var line = start.toLocaleString(undefined, opts);
    if (status === "active") {
      return "Live now · started " + line;
    }
    if (isoEnd) {
      var end = new Date(isoEnd);
      if (!Number.isNaN(end.getTime()) && end.toDateString() !== start.toDateString()) {
        line += " – " + end.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
      }
    }
    return line;
  }

  function render(events) {
    if (!panel || !listEl) return;
    if (!events || !events.length) {
      panel.hidden = true;
      listEl.innerHTML = "";
      return;
    }
    panel.hidden = false;
    listEl.innerHTML = events
      .map(function (ev) {
        var when = formatWhen(ev.start_at, ev.end_at, ev.status);
        var badge =
          ev.status === "active"
            ? '<span class="home-events-badge home-events-badge-live">Live</span>'
            : '<span class="home-events-badge">Upcoming</span>';
        var loc = ev.location
          ? '<p class="home-events-location">' + escapeHtml(ev.location) + "</p>"
          : "";
        var desc = ev.description
          ? '<p class="home-events-desc">' + escapeHtml(ev.description.slice(0, 220)) + (ev.description.length > 220 ? "…" : "") + "</p>"
          : "";
        var img = ev.image_url
          ? '<img class="home-events-cover" src="' + escapeHtml(ev.image_url) + '" alt="" loading="lazy" decoding="async" />'
          : "";
        return (
          '<article class="home-events-card">' +
          img +
          '<div class="home-events-card-body">' +
          '<div class="home-events-card-head">' +
          badge +
          "<h3 class=\"home-events-name\">" +
          escapeHtml(ev.name || "Discord event") +
          "</h3>" +
          "</div>" +
          (when ? '<p class="home-events-when">' + escapeHtml(when) + "</p>" : "") +
          loc +
          desc +
          '<a class="btn btn-primary btn-small home-events-cta" href="' +
          escapeHtml(ev.url || "#") +
          '" target="_blank" rel="noopener noreferrer">Open in Discord</a>' +
          "</div></article>"
        );
      })
      .join("");
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
      .catch(function () {
        if (panel) panel.hidden = true;
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", load);
  } else {
    load();
  }
})();
