(function () {
  "use strict";

  var browse = window.PokePonCatalogBrowse;
  if (!browse) {
    console.error("catalog-browse.js must load before market.js");
    return;
  }

  var apiFetch = browse.apiFetch;
  var escapeHtml = browse.escapeHtml;

  var els = {
    portfolio: document.getElementById("market-portfolio"),
    positions: document.getElementById("market-position-list"),
    balance: document.getElementById("market-balance"),
    modal: document.getElementById("market-modal"),
    img: document.getElementById("market-modal-img"),
    set: document.getElementById("market-modal-set"),
    title: document.getElementById("market-modal-title"),
    rarity: document.getElementById("market-modal-rarity"),
    price: document.getElementById("market-modal-price"),
    range: document.getElementById("market-modal-range"),
    chart: document.getElementById("market-chart"),
    hint: document.getElementById("market-chart-hint"),
    form: document.getElementById("market-invest-form"),
    amount: document.getElementById("market-invest-amount"),
    investBtn: document.getElementById("market-invest-btn"),
    msg: document.getElementById("market-invest-msg"),
  };

  var state = { selectedId: null, authenticated: false };

  function formatUsd(n) {
    if (n == null || isNaN(n)) return "—";
    return "$" + Number(n).toFixed(2);
  }

  function formatPd(n) {
    return "₽" + Number(n || 0).toLocaleString();
  }

  function drawChart(history, currentUsd) {
    var canvas = els.chart;
    if (!canvas) return;
    var ctx = canvas.getContext("2d");
    var w = canvas.width;
    var h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    var pts = (history || []).map(function (p) {
      return { x: p.day, y: Number(p.usd) };
    });
    if (!pts.length && currentUsd != null) {
      pts = [
        { x: "now", y: currentUsd },
        { x: "now", y: currentUsd },
      ];
    }
    if (pts.length === 1) pts.push(pts[0]);
    if (!pts.length) return;
    var ys = pts.map(function (p) {
      return p.y;
    });
    var lo = Math.min.apply(null, ys);
    var hi = Math.max.apply(null, ys);
    if (hi <= lo) hi = lo + 1;
    var pad = (hi - lo) * 0.12;
    lo -= pad;
    hi += pad;
    var left = 48;
    var right = 12;
    var top = 16;
    var bottom = 28;
    var pw = w - left - right;
    var ph = h - top - bottom;
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    for (var g = 0; g < 4; g++) {
      var gy = top + (ph * g) / 3;
      ctx.beginPath();
      ctx.moveTo(left, gy);
      ctx.lineTo(w - right, gy);
      ctx.stroke();
    }
    var first = pts[0].y;
    var last = pts[pts.length - 1].y;
    var up = last >= first;
    ctx.strokeStyle = up ? "#4ade80" : "#f87171";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    pts.forEach(function (p, i) {
      var x = left + (i * pw) / Math.max(1, pts.length - 1);
      var y = top + ((hi - p.y) * ph) / (hi - lo);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.fillStyle = "rgba(226,232,240,0.7)";
    ctx.font = "12px DM Sans, sans-serif";
    ctx.fillText(formatUsd(hi), 4, top + 10);
    ctx.fillText(formatUsd(lo), 4, top + ph);
  }

  function closeModal() {
    if (!els.modal) return;
    els.modal.hidden = true;
    els.modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
  }

  function openModal() {
    els.modal.hidden = false;
    els.modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
  }

  function showMsg(text, ok) {
    if (!els.msg) return;
    els.msg.hidden = !text;
    els.msg.textContent = text || "";
    els.msg.className = "modal-grade-msg" + (ok ? " is-ok" : " is-error");
  }

  function openCard(card) {
    var id = card && card.id;
    if (!id) return;
    state.selectedId = id;
    showMsg("", true);
    apiFetch("/api/market/cards/" + encodeURIComponent(id))
      .then(function (r) {
        return r.json().then(function (data) {
          return { ok: r.ok, data: data };
        });
      })
      .then(function (res) {
        if (!res.ok) {
          showMsg((res.data && (res.data.message || res.data.error)) || "No live market.", false);
          openModal();
          return;
        }
        var detail = res.data.card || card || {};
        var quote = res.data.quote || {};
        els.img.src = detail.image_large_url || detail.image_small_url || card.image_small_url || "";
        els.img.alt = detail.name || card.name || "";
        els.set.textContent =
          (detail.set_name || card.set_name || "") +
          " · #" +
          (detail.collector_number || card.collector_number || "?");
        els.title.textContent = detail.name || card.name || "Card";
        els.rarity.textContent =
          (detail.rarity && detail.rarity.display_name) ||
          detail.tcg_rarity ||
          (card.rarity && card.rarity.display_name) ||
          "";
        els.price.textContent = formatUsd(quote.usd) + " TCGPlayer";
        els.range.textContent =
          "Range " + formatUsd(quote.usd_low) + " – " + formatUsd(quote.usd_high);
        var hist = res.data.history || [];
        drawChart(hist, quote.usd);
        els.hint.textContent = hist.length
          ? hist.length + " tracked day(s). New points save when anyone views this card."
          : "First snapshot — history builds as the live price is fetched.";
        if (els.amount) {
          els.amount.min = res.data.invest_min || 100;
          els.amount.max = res.data.invest_max || 100000;
        }
        openModal();
      })
      .catch(function () {
        showMsg("Could not load market.", false);
        openModal();
      });
  }

  function loadPortfolio() {
    apiFetch("/api/me/market")
      .then(function (r) {
        if (r.status === 401) {
          state.authenticated = false;
          els.portfolio.hidden = true;
          return null;
        }
        return r.json();
      })
      .then(function (data) {
        if (!data) return;
        state.authenticated = true;
        var items = data.items || [];
        els.portfolio.hidden = false;
        els.balance.textContent = "Balance " + formatPd(data.balance_pokedollars);
        els.positions.innerHTML = "";
        if (!items.length) {
          els.positions.innerHTML = '<p class="muted">No open positions yet.</p>';
          return;
        }
        items.forEach(function (pos) {
          var card = pos.card || {};
          var row = document.createElement("div");
          row.className = "market-position" + (pos.pnl >= 0 ? " is-up" : " is-down");
          row.innerHTML =
            '<img alt="" src="' +
            escapeHtml(card.image_small_url || "") +
            '" />' +
            "<div><strong>" +
            escapeHtml(card.name) +
            "</strong><span>" +
            formatPd(pos.pokedollars_in) +
            " → " +
            formatPd(pos.current_value) +
            " (" +
            (pos.pnl >= 0 ? "+" : "") +
            Number(pos.pnl_percent).toFixed(1) +
            "%)</span></div>";
          var sell = document.createElement("button");
          sell.type = "button";
          sell.className = "btn btn-ghost";
          sell.textContent = "Sell";
          sell.addEventListener("click", function () {
            sellPosition(pos.id);
          });
          row.appendChild(sell);
          els.positions.appendChild(row);
        });
      })
      .catch(function () {});
  }

  function sellPosition(id) {
    apiFetch("/api/me/market/sell", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ investment_id: id }),
    })
      .then(function (r) {
        return r.json().then(function (data) {
          return { ok: r.ok, data: data };
        });
      })
      .then(function (res) {
        if (!res.ok) return;
        loadPortfolio();
        if (window.PokePonApp && window.PokePonApp.notifyBalancesChanged) {
          window.PokePonApp.notifyBalancesChanged();
        }
      })
      .catch(function () {});
  }

  function bindInvest() {
    if (els.form) {
      els.form.addEventListener("submit", function (e) {
        e.preventDefault();
        if (!state.selectedId) return;
        var amount = parseInt(els.amount.value, 10);
        if (!amount) {
          showMsg("Enter an amount.", false);
          return;
        }
        els.investBtn.disabled = true;
        apiFetch("/api/me/market/buy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ card_id: state.selectedId, amount: amount }),
        })
          .then(function (r) {
            return r.json().then(function (data) {
              return { ok: r.ok, data: data };
            });
          })
          .then(function (res) {
            els.investBtn.disabled = false;
            if (!res.ok) {
              showMsg(
                (res.data && (res.data.message || res.data.error)) || "Could not invest.",
                false
              );
              return;
            }
            showMsg("Invested " + formatPd(amount) + ".", true);
            loadPortfolio();
            if (window.PokePonApp && window.PokePonApp.notifyBalancesChanged) {
              window.PokePonApp.notifyBalancesChanged();
            }
          })
          .catch(function () {
            els.investBtn.disabled = false;
            showMsg("Network error.", false);
          });
      });
    }
    if (els.modal) {
      els.modal.addEventListener("click", function (e) {
        if (e.target && e.target.hasAttribute("data-close")) closeModal();
      });
    }
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeModal();
    });
  }

  function init() {
    bindInvest();
    browse.bindSidebarAuth({
      onAuthenticated: function (ok) {
        state.authenticated = ok;
      },
    });
    browse.mount({
      root: document.getElementById("market-browse"),
      prefix: "market",
      toolbarLabel: "Market catalog filters",
      placeholder: "Search a card to chart…",
      errorMessage: "Could not load the market catalog.",
      onSelect: openCard,
    });
    loadPortfolio();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
