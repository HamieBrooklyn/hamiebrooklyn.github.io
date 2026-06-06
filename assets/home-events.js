/* Home page — Discord events + seasonal set chase from bot API */
(function () {
  "use strict";

  var API_BASE = (window.POKEPON_API_BASE || "").replace(/\/+$/, "");
  var panel = document.getElementById("home-events");
  var listEl = document.getElementById("home-events-list");
  var chasePanel = document.getElementById("home-set-chase");
  var chaseTitle = document.getElementById("home-set-chase-title");
  var chaseLead = document.getElementById("home-set-chase-lead");
  var chaseBars = document.getElementById("home-set-chase-bars");
  var chaseMeta = document.getElementById("home-set-chase-meta");
  var chaseClaim = document.getElementById("home-set-chase-claim");
  var tickTimer = null;
  var refreshTimer = null;
  var lastSetChase = null;

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

  function progressFill(percent) {
    return Math.max(0, Math.min(100, Number(percent) || 0));
  }

  function apiFetch(path, opts) {
    opts = opts || {};
    opts.credentials = "include";
    var headers = { "ngrok-skip-browser-warning": "1" };
    try {
      var tok = localStorage.getItem("pokepon-session") || "";
      if (tok) headers.Authorization = "Bearer " + tok;
    } catch (_) {}
    opts.headers = Object.assign(headers, opts.headers || {});
    return fetch(API_BASE + path, opts);
  }

  function renderSetChase(sc) {
    if (!chasePanel || !sc || !sc.active) {
      if (chasePanel) chasePanel.hidden = true;
      lastSetChase = null;
      return;
    }
    lastSetChase = sc;
    chasePanel.hidden = false;
    if (chaseTitle) chaseTitle.textContent = sc.title || "Set chase";
    if (chaseLead) {
      chaseLead.textContent =
        "Chase " +
        (sc.set_name || sc.set_code) +
        " together. Claim cards from /cd to fill the community bar and your binder.";
    }
    var globalPct = progressFill(sc.global && sc.global.percent);
    var globalClaims = sc.global ? Number(sc.global.claims || 0) : 0;
    var globalTarget = sc.global ? Number(sc.global.target || 0) : 0;
    var bars =
      '<div class="home-set-chase-bar">' +
      '<div class="home-set-chase-bar-label"><span>Community</span><span>' +
      globalClaims.toLocaleString() +
      " / " +
      globalTarget.toLocaleString() +
      " claims</span></div>" +
      '<div class="home-set-chase-track"><div class="home-set-chase-fill" style="width:' +
      globalPct +
      '%"></div></div></div>';
    if (sc.personal) {
      var pPct = progressFill(sc.personal.percent);
      bars +=
        '<div class="home-set-chase-bar">' +
        '<div class="home-set-chase-bar-label"><span>Your binder</span><span>' +
        Number(sc.personal.owned_unique || 0) +
        " / " +
        Number(sc.personal.total_unique || 0) +
        " unique</span></div>" +
        '<div class="home-set-chase-track"><div class="home-set-chase-fill home-set-chase-fill-personal" style="width:' +
        pPct +
        '%"></div></div></div>';
    }
    if (chaseBars) chaseBars.innerHTML = bars;
    if (chaseMeta) {
      var parts = [
        "Drop boost: " + Number(sc.drop_boost_percent || 0) + "% of each /cd card from this set.",
      ];
      var partCr = Number(sc.community_participation_crystals || 0);
      if (sc.community_goal_reached) {
        parts.push(
          "Community goal complete — each participant received " + partCr + " crystals."
        );
      } else if (partCr > 0) {
        parts.push(
          "When the community bar fills, everyone who claimed at least one card from this set earns " +
            partCr +
            " crystals."
        );
      }
      parts.push(
        "Personal reward at " +
          Number(sc.completion_threshold_pct || 80) +
          "%: 💎 " +
          Number(sc.reward_crystals || 0) +
          " + ₽" +
          Number(sc.reward_pokedollars || 0).toLocaleString() +
          "."
      );
      if (sc.personal && sc.personal.community_reward_paid) {
        parts.push("You received the community participation bonus.");
      } else if (sc.personal && sc.personal.participated && !sc.community_goal_reached) {
        parts.push("You are registered for the community bonus.");
      } else if (sc.personal && sc.personal.reward_claimed) {
        parts.push("You already claimed this season's personal reward.");
      } else if (sc.personal && sc.personal.reward_eligible) {
        parts.push("Your personal reward is ready to claim.");
      } else if (!sc.personal) {
        parts.push("Sign in on the web app to track your binder progress.");
      }
      chaseMeta.textContent = parts.join(" ");
    }
    if (chaseClaim) {
      var canClaim = !!(sc.personal && sc.personal.reward_eligible && !sc.personal.reward_claimed);
      chaseClaim.hidden = !canClaim;
      chaseClaim.disabled = false;
      chaseClaim.textContent = "Claim reward";
    }
  }

  function bindClaimButton() {
    if (!chaseClaim || chaseClaim.dataset.bound) return;
    chaseClaim.dataset.bound = "1";
    chaseClaim.addEventListener("click", function () {
      if (!API_BASE) return;
      chaseClaim.disabled = true;
      chaseClaim.textContent = "Claiming…";
      apiFetch("/api/me/set-chase/claim", { method: "POST" })
        .then(function (r) {
          return r.json().then(function (body) {
            return { ok: r.ok, body: body };
          });
        })
        .then(function (res) {
          if (res.ok && res.body && res.body.set_chase) {
            renderSetChase(res.body.set_chase);
            chaseClaim.textContent = "Claimed!";
            return;
          }
          var msg = (res.body && res.body.message) || "Could not claim reward.";
          if (chaseMeta) chaseMeta.textContent = msg;
          chaseClaim.hidden = true;
        })
        .catch(function () {
          if (chaseMeta) chaseMeta.textContent = "Network error while claiming.";
          chaseClaim.disabled = false;
          chaseClaim.textContent = "Claim reward";
        });
    });
  }

  function gameEventDetail(ev) {
    if (!ev) return "";
    if (ev.kind === "luck_boost") {
      return "+" + Number(ev.luck_percent || 0) + "% rarer card pulls";
    }
    if (ev.kind === "double_daily") {
      return "Daily rewards ×" + Number(ev.daily_multiplier || 2);
    }
    if (ev.kind === "free_spotlight") {
      return "Free auction spotlight (no crystal fee)";
    }
    if (ev.kind === "set_spotlight") {
      return "Free spotlight for set " + (ev.set_code || "");
    }
    return ev.kind || "";
  }

  function normalizeGameEvent(ev) {
    var detail = gameEventDetail(ev);
    var desc = detail;
    if (ev.schedule_label) desc = detail + " · " + ev.schedule_label;
    else if (ev.description) desc = ev.description;
    return {
      id: "game-" + ev.id,
      name: ev.title || "Game event",
      description: desc,
      start_at: ev.start_at,
      end_at: ev.end_at,
      status: ev.status === "active" ? "active" : "scheduled",
      url: "/activity/",
      location: "In-game",
      is_game_event: true,
    };
  }

  function mergeEventsPayload(data) {
    var discord = data && data.events ? data.events : [];
    var game = data && data.game_events ? data.game_events : [];
    var normalized = game
      .filter(function (g) {
        return g.status === "active" || g.status === "scheduled";
      })
      .map(normalizeGameEvent);
    return normalized.concat(discord);
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
      var parts = formatCountdownParts(untilStart);
      return { text: "Starts in " + parts, done: false, status: status };
    }
    if (status === "active") {
      if (!endAt) return { text: "Live now", done: false, status: status };
      var untilEnd = endAt.getTime() - now;
      if (untilEnd <= 0) return { text: "Ending now", done: true, status: status };
      var endParts = formatCountdownParts(untilEnd);
      return { text: "Ends in " + endParts, done: false, status: status };
    }
    return { text: "", done: false, status: status };
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
      if (info.done && info.status === "active") {
        card.hidden = true;
        return;
      }
      visible += 1;
      el.textContent = info.text;
      el.classList.toggle("home-events-countdown-live", info.status === "active");
      el.classList.toggle("home-events-countdown-soon", info.status === "scheduled");
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
        var rawStatus = ev.status === "active" ? "active" : "scheduled";
        var status = effectiveStatus(
          rawStatus,
          parseIso(ev.start_at),
          parseIso(ev.end_at),
          Date.now()
        );
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
        var banner = ev.image_url
          ? '<div class="home-events-banner">' +
            '<img class="home-events-cover" src="' +
            escapeHtml(ev.image_url) +
            '" alt="" loading="lazy" decoding="async" />' +
            "</div>"
          : "";
        return (
          '<article class="home-events-card" data-event-id="' +
          escapeHtml(ev.id || "") +
          '">' +
          banner +
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
          '"' +
          (ev.is_game_event ? "" : ' target="_blank" rel="noopener noreferrer"') +
          ">" +
          (ev.is_game_event ? "View activity" : "Open in Discord") +
          "</a>" +
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
        renderSetChase(data && data.set_chase ? data.set_chase : null);
        render(mergeEventsPayload(data || {}));
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
    document.addEventListener("DOMContentLoaded", function () {
      bindClaimButton();
      load();
    });
  } else {
    bindClaimButton();
    load();
  }
})();
