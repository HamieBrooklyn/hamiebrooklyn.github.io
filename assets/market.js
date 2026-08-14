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

  var state = { selectedId: null, authenticated: false, quoteReq: 0, quoteAbort: null };

  function formatUsd(n) {
    if (n == null || isNaN(n)) return "—";
    return "$" + Number(n).toFixed(2);
  }

  function formatPd(n) {
    return "₽" + Number(n || 0).toLocaleString();
  }

  function chartCtx() {
    var canvas = els.chart;
    if (!canvas) return null;
    return { canvas: canvas, ctx: canvas.getContext("2d"), w: canvas.width, h: canvas.height };
  }

  function clearChart() {
    var c = chartCtx();
    if (!c) return;
    c.ctx.clearRect(0, 0, c.w, c.h);
  }

  function axisBox() {
    return { left: 48, right: 12, top: 16, bottom: 28 };
  }

  function drawGrid(ctx, w, h, lo, hi) {
    var box = axisBox();
    var ph = h - box.top - box.bottom;
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    ctx.fillStyle = "rgba(226,232,240,0.7)";
    ctx.font = "12px DM Sans, sans-serif";
    for (var g = 0; g < 4; g++) {
      var gy = box.top + (ph * g) / 3;
      ctx.beginPath();
      ctx.moveTo(box.left, gy);
      ctx.lineTo(w - box.right, gy);
      ctx.stroke();
    }
    ctx.fillText(formatUsd(hi), 4, box.top + 10);
    ctx.fillText(formatUsd(lo), 4, box.top + ph);
  }

  function yScale(h, lo, hi, value) {
    var box = axisBox();
    var ph = h - box.top - box.bottom;
    return box.top + ((hi - value) * ph) / (hi - lo);
  }

  function padRange(values) {
    var lo = Math.min.apply(null, values);
    var hi = Math.max.apply(null, values);
    if (hi <= lo) hi = lo + 1;
    var pad = (hi - lo) * 0.12;
    return { lo: lo - pad, hi: hi + pad };
  }

  function saneBook(quote) {
    var market = Number(quote && quote.usd);
    if (isNaN(market)) return null;
    var low = quote.usd_low == null ? null : Number(quote.usd_low);
    var mid = quote.usd_mid == null ? null : Number(quote.usd_mid);
    var high = quote.usd_high == null ? null : Number(quote.usd_high);
    var ceiling = Math.max(market, mid || 0, 0.01) * 4;
    if (high != null && high > ceiling) high = null;
    if (low != null && (low <= 0 || low > market)) low = null;
    return { market: market, low: low, mid: mid, high: high };
  }

  function historyHasMove(history) {
    var pts = (history || [])
      .map(function (p) {
        return Number(p.usd);
      })
      .filter(function (n) {
        return !isNaN(n);
      });
    if (pts.length < 2) return false;
    var first = pts[0];
    return pts.some(function (n) {
      return n !== first;
    });
  }

  function drawSeries(history) {
    var c = chartCtx();
    if (!c) return;
    var pts = history.map(function (p) {
      return { x: p.day, y: Number(p.usd) };
    });
    var range = padRange(
      pts.map(function (p) {
        return p.y;
      })
    );
    var box = axisBox();
    var pw = c.w - box.left - box.right;
    drawGrid(c.ctx, c.w, c.h, range.lo, range.hi);
    var first = pts[0].y;
    var last = pts[pts.length - 1].y;
    c.ctx.strokeStyle = last >= first ? "#4ade80" : "#f87171";
    c.ctx.lineWidth = 2.5;
    c.ctx.beginPath();
    pts.forEach(function (p, i) {
      var x = box.left + (i * pw) / Math.max(1, pts.length - 1);
      var y = yScale(c.h, range.lo, range.hi, p.y);
      if (i === 0) c.ctx.moveTo(x, y);
      else c.ctx.lineTo(x, y);
    });
    c.ctx.stroke();
  }

  function drawBook(quote) {
    var c = chartCtx();
    var book = saneBook(quote);
    if (!c || !book) return;
    var values = [book.market];
    if (book.low != null) values.push(book.low);
    if (book.mid != null) values.push(book.mid);
    if (book.high != null) values.push(book.high);
    var range = padRange(values);
    var box = axisBox();
    var pw = c.w - box.left - box.right;
    drawGrid(c.ctx, c.w, c.h, range.lo, range.hi);
    var x0 = box.left + pw * 0.22;
    var x1 = box.left + pw * 0.78;
    var bandLo = book.low != null ? book.low : book.market;
    var bandHi = book.high != null ? book.high : book.mid != null ? book.mid : book.market;
    var yHi = yScale(c.h, range.lo, range.hi, Math.max(bandLo, bandHi));
    var yLo = yScale(c.h, range.lo, range.hi, Math.min(bandLo, bandHi));
    if (yLo - yHi < 10) {
      yHi -= 14;
      yLo += 14;
    }
    c.ctx.fillStyle = "rgba(91,140,255,0.18)";
    c.ctx.strokeStyle = "#5b8cff";
    c.ctx.lineWidth = 2;
    c.ctx.beginPath();
    c.ctx.roundRect ? c.ctx.roundRect(x0, yHi, x1 - x0, yLo - yHi, 10) : c.ctx.rect(x0, yHi, x1 - x0, yLo - yHi);
    c.ctx.fill();
    c.ctx.stroke();
    if (book.mid != null) {
      var ym = yScale(c.h, range.lo, range.hi, book.mid);
      c.ctx.strokeStyle = "#facc15";
      c.ctx.lineWidth = 2;
      c.ctx.setLineDash([6, 4]);
      c.ctx.beginPath();
      c.ctx.moveTo(x0, ym);
      c.ctx.lineTo(x1, ym);
      c.ctx.stroke();
      c.ctx.setLineDash([]);
      c.ctx.fillStyle = "#facc15";
      c.ctx.fillText("Mid " + formatUsd(book.mid), x1 + 6, ym + 4);
    }
    var yM = yScale(c.h, range.lo, range.hi, book.market);
    c.ctx.strokeStyle = "#4ade80";
    c.ctx.lineWidth = 3;
    c.ctx.beginPath();
    c.ctx.moveTo(box.left, yM);
    c.ctx.lineTo(c.w - box.right, yM);
    c.ctx.stroke();
    c.ctx.fillStyle = "#4ade80";
    c.ctx.beginPath();
    c.ctx.arc(box.left + pw / 2, yM, 5, 0, Math.PI * 2);
    c.ctx.fill();
  }

  function drawChart(history, quote) {
    clearChart();
    if (historyHasMove(history)) drawSeries(history);
    else drawBook(quote);
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

  function paintCardShell(card) {
    els.img.src = card.image_large_url || card.image_small_url || "";
    els.img.alt = card.name || "";
    els.set.textContent =
      (card.set_name || card.set_code || "") + " · #" + (card.collector_number || "?");
    els.title.textContent = card.name || "Card";
    els.rarity.textContent = (card.rarity && card.rarity.display_name) || card.tcg_rarity || "";
    els.price.textContent = "Loading TCGPlayer…";
    els.range.textContent = "";
    if (els.hint) els.hint.textContent = "Fetching live quote…";
    clearChart();
    showMsg("", true);
    openModal();
  }

  function openCard(card) {
    var id = card && card.id;
    if (!id) return;
    state.selectedId = id;
    var req = ++state.quoteReq;
    if (state.quoteAbort) {
      try {
        state.quoteAbort.abort();
      } catch (_) {}
    }
    state.quoteAbort = typeof AbortController !== "undefined" ? new AbortController() : null;
    paintCardShell(card);
    apiFetch("/api/market/cards/" + encodeURIComponent(id), state.quoteAbort ? { signal: state.quoteAbort.signal } : {})
      .then(function (r) {
        return r.json().then(function (data) {
          return { ok: r.ok, data: data };
        });
      })
      .then(function (res) {
        if (req !== state.quoteReq || state.selectedId !== id) return;
        if (!res.ok) {
          showMsg((res.data && (res.data.message || res.data.error)) || "No live market.", false);
          els.price.textContent = "—";
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
        drawChart(hist, quote);
        els.hint.textContent = historyHasMove(hist)
          ? hist.length + " tracked day(s) of TCGPlayer closes."
          : "Today's TCGPlayer book (low / mid / market). Daily history fills in as this printing is viewed.";
        if (els.amount) {
          els.amount.min = res.data.invest_min || 100;
          els.amount.max = res.data.invest_max || 100000;
        }
      })
      .catch(function (err) {
        if (err && err.name === "AbortError") return;
        if (req !== state.quoteReq || state.selectedId !== id) return;
        showMsg("Could not load market.", false);
        els.price.textContent = "—";
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
