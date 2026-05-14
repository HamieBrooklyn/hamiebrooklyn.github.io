/* PokePon auctions — uses the same API auth pattern as collection.js */
(function () {
  "use strict";

  var API_BASE = (window.POKEPON_API_BASE || "").replace(/\/+$/, "");
  function api(path) {
    return API_BASE + path;
  }

  var SESSION_KEY = "pokepon-session";

  function readSessionToken() {
    try {
      return localStorage.getItem(SESSION_KEY) || "";
    } catch (_) {
      return "";
    }
  }

  function storeSessionToken(token) {
    try {
      localStorage.setItem(SESSION_KEY, token);
    } catch (_) {}
  }

  function captureSessionFromFragment() {
    if (!window.location.hash) return;
    var params = new URLSearchParams(window.location.hash.slice(1));
    var token = params.get("session");
    if (!token) return;
    storeSessionToken(token);
    params.delete("session");
    var nextHash = params.toString();
    var cleanUrl =
      window.location.pathname +
      window.location.search +
      (nextHash ? "#" + nextHash : "");
    window.history.replaceState(null, "", cleanUrl);
  }

  function apiHeaders() {
    var headers = { "ngrok-skip-browser-warning": "1" };
    var token = readSessionToken();
    if (token) headers.Authorization = "Bearer " + token;
    return headers;
  }

  function apiFetch(path, options) {
    options = options || {};
    options.credentials = "include";
    var headers = Object.assign({}, apiHeaders(), options.headers || {});
    options.headers = headers;
    return fetch(api(path), options);
  }

  var state = { me: null, detailId: null, authenticated: false };

  var els = {
    sidebarUser: document.getElementById("sidebar-user"),
    userAvatar: document.getElementById("user-avatar"),
    userName: document.getElementById("user-name"),
    btnLogin: document.getElementById("btn-login"),
    btnLogout: document.getElementById("btn-logout"),
    balances: document.getElementById("auction-balances"),
    createSection: document.getElementById("auction-create"),
    listError: document.getElementById("auction-list-error"),
    grid: document.getElementById("auction-grid"),
    overlay: document.getElementById("auction-overlay"),
    detailTitle: document.getElementById("detail-title"),
    detailSub: document.getElementById("detail-sub"),
    detailStats: document.getElementById("detail-stats"),
    detailBids: document.getElementById("detail-bids"),
    detailImg: document.getElementById("detail-img"),
    detailError: document.getElementById("detail-error"),
    bidBox: document.getElementById("bid-box"),
    bidAmt: document.getElementById("bid-amt"),
    bidMsg: document.getElementById("bid-msg"),
    q: document.getElementById("auction-q"),
    seller: document.getElementById("auction-seller"),
    sort: document.getElementById("auction-sort"),
    page: document.getElementById("auction-page"),
    btnRefresh: document.getElementById("btn-refresh"),
    btnCreate: document.getElementById("btn-create"),
    createPid: document.getElementById("c-pid"),
    createCur: document.getElementById("c-cur"),
    createStart: document.getElementById("c-start"),
    createDur: document.getElementById("c-dur"),
    createMsg: document.getElementById("create-msg"),
    btnBid: document.getElementById("btn-bid"),
    btnClose: document.getElementById("auction-close"),
    sidebarToggle: document.getElementById("sidebar-toggle"),
    sidebar: document.getElementById("sidebar"),
  };

  function sym(cur) {
    return cur === "crystals" ? "💎" : "₽";
  }

  function fmtAmt(n, cur) {
    if (n == null) return "—";
    var s = Number(n).toLocaleString();
    return cur === "crystals" ? s + " 💎" : "₽" + s;
  }

  function showLoadingUser() {
    if (!els.sidebarUser) return;
    els.sidebarUser.dataset.state = "loading";
    els.sidebarUser.querySelector(".sidebar-user-loading").hidden = false;
    els.sidebarUser.querySelector(".sidebar-user-signedout").hidden = true;
    els.sidebarUser.querySelector(".sidebar-user-signedin").hidden = true;
  }

  function showSignedOut() {
    if (!els.sidebarUser) return;
    els.sidebarUser.dataset.state = "signed-out";
    els.sidebarUser.querySelector(".sidebar-user-loading").hidden = true;
    els.sidebarUser.querySelector(".sidebar-user-signedout").hidden = false;
    els.sidebarUser.querySelector(".sidebar-user-signedin").hidden = true;
    if (els.balances) els.balances.hidden = true;
    if (els.createSection) els.createSection.hidden = true;
  }

  function showSignedIn(user) {
    if (!els.sidebarUser) return;
    els.sidebarUser.dataset.state = "signed-in";
    els.sidebarUser.querySelector(".sidebar-user-loading").hidden = true;
    els.sidebarUser.querySelector(".sidebar-user-signedout").hidden = true;
    els.sidebarUser.querySelector(".sidebar-user-signedin").hidden = false;
    var label = user.global_name || user.username || "Trainer";
    els.userName.textContent = label;
    if (user.avatar_url) {
      els.userAvatar.src = user.avatar_url;
      els.userAvatar.alt = label;
    } else {
      els.userAvatar.removeAttribute("src");
      els.userAvatar.alt = "";
    }
    if (els.createSection) els.createSection.hidden = false;
  }

  function loginUrl() {
    return api("/auth/discord/login?return_to=" + encodeURIComponent(window.location.href));
  }

  async function refreshBalances() {
    if (!els.balances || !state.authenticated) return;
    try {
      var r = await apiFetch("/api/me/balances");
      if (!r.ok) {
        els.balances.hidden = true;
        return;
      }
      var b = await r.json();
      els.balances.hidden = false;
      els.balances.innerHTML =
        "<div><span>₽</span> " +
        Number(b.pokedollars).toLocaleString() +
        "</div>" +
        "<div><span>💎</span> " +
        Number(b.crystals).toLocaleString() +
        "</div>";
    } catch (_) {
      if (els.balances) els.balances.hidden = true;
    }
  }

  async function bootAuth() {
    showLoadingUser();
    try {
      var r = await apiFetch("/api/me");
      if (!r.ok) throw new Error("HTTP " + r.status);
      var j = await r.json();
      if (j && j.authenticated && j.user) {
        state.authenticated = true;
        state.me = j.user;
        showSignedIn(j.user);
        await refreshBalances();
      } else {
        state.authenticated = false;
        state.me = null;
        showSignedOut();
      }
    } catch (_) {
      state.authenticated = false;
      state.me = null;
      showSignedOut();
      if (els.listError) {
        els.listError.hidden = false;
        els.listError.textContent =
          "Could not reach the PokePon API. Check the pokepon-api-base meta tag and that the bot's web server is online.";
      }
    }

    if (els.btnLogin) els.btnLogin.onclick = function () {
      window.location.href = loginUrl();
    };
    if (els.btnLogout) {
      els.btnLogout.onclick = async function () {
        await apiFetch("/auth/logout", { method: "POST" });
        state.authenticated = false;
        state.me = null;
        showSignedOut();
        await loadList();
      };
    }
  }

  function renderTile(a) {
    var el = document.createElement("article");
    el.className = "auction-tile";
    el.dataset.id = String(a.id);
    var img = (a.card && a.card.image_small_url) || "";
    var cur = a.bid_currency || "pokedollars";
    var high =
      a.high_bid != null
        ? fmtAmt(a.high_bid, cur)
        : "min " + fmtAmt(a.starting_bid, cur);
    el.innerHTML =
      '<img src="' +
      img +
      '" alt="" loading="lazy" />' +
      '<div class="auction-tile-meta">' +
      '<span class="auction-pill">' +
      sym(cur) +
      " #" +
      a.id +
      "</span>" +
      "<h3>" +
      ((a.card && a.card.name) || "Card") +
      "</h3>" +
      '<div class="auction-muted">' +
      (a.bid_count || 0) +
      " bid(s) · " +
      high +
      "</div>" +
      '<div class="auction-muted" style="margin-top:0.35rem">Ends ' +
      new Date(a.ends_at).toLocaleString() +
      "</div>" +
      "</div>";
    el.addEventListener("click", function () {
      openDetail(a.id);
    });
    return el;
  }

  async function loadList() {
    if (!els.listError || !els.grid) return;
    els.listError.hidden = true;
    var q = (els.q && els.q.value.trim()) || "";
    var seller = (els.seller && els.seller.value.trim()) || "";
    var sort = (els.sort && els.sort.value) || "popular";
    var page = Math.max(1, parseInt((els.page && els.page.value) || "1", 10) || 1);
    var params = new URLSearchParams();
    params.set("sort", sort);
    params.set("page", String(page));
    params.set("limit", "24");
    if (q) params.set("q", q);
    if (seller) params.set("seller_id", seller);
    try {
      if (!API_BASE) throw new Error("Set pokepon-api-base (meta tag or ?api=).");
      var r = await apiFetch("/api/auctions?" + params.toString());
      var j = await r.json();
      if (!r.ok) throw new Error(j.error || "load failed");
      els.grid.innerHTML = "";
      (j.auctions || []).forEach(function (a) {
        els.grid.appendChild(renderTile(a));
      });
    } catch (e) {
      els.listError.hidden = false;
      els.listError.textContent = String(e.message || e);
    }
  }

  async function openDetail(id) {
    state.detailId = id;
    if (!els.overlay) return;
    els.overlay.classList.add("is-open");
    if (els.detailError) {
      els.detailError.hidden = true;
    }
    try {
      var r = await apiFetch("/api/auctions/" + id);
      var a = await r.json();
      if (!r.ok) throw new Error(a.error || "not found");
      var cur = a.bid_currency || "pokedollars";
      els.detailTitle.textContent = (a.card && a.card.name) || "Auction";
      els.detailSub.textContent =
        (a.card && a.card.set_name + " #" + a.card.collector_number) +
        " · seller " +
        a.seller_discord_id +
        " · Card ID " +
        (a.card && a.card.public_id);
      var img =
        (a.card && a.card.image_large_url) ||
        (a.card && a.card.image_small_url) ||
        "";
      els.detailImg.src = img;
      els.detailImg.alt = els.detailTitle.textContent;
      var minNext = a.min_next_bid;
      els.detailStats.innerHTML =
        "<div><strong>Currency</strong> " +
        sym(cur) +
        " " +
        cur +
        "</div>" +
        "<div><strong>High bid</strong> " +
        fmtAmt(a.high_bid, cur) +
        "</div>" +
        "<div><strong>Minimum next bid</strong> " +
        (minNext != null ? fmtAmt(minNext, cur) : "—") +
        "</div>" +
        "<div><strong>Ends</strong> " +
        new Date(a.ends_at).toLocaleString() +
        "</div>" +
        '<div class="auction-muted" style="margin-top:0.35rem">' +
        (a.bid_count || 0) +
        " total bids logged</div>";

      els.detailBids.innerHTML = "";
      (a.bids || []).forEach(function (b) {
        var li = document.createElement("li");
        li.innerHTML =
          "<span>" +
          (b.display || fmtAmt(b.amount, b.currency || cur)) +
          "</span>" +
          '<span class="auction-muted">' +
          (b.created_at ? new Date(b.created_at).toLocaleString() : "") +
          "<br/>bidder " +
          b.bidder_discord_id +
          "</span>";
        els.detailBids.appendChild(li);
      });

      if (els.bidMsg) els.bidMsg.innerHTML = "";
      if (els.bidBox) {
        if (state.me && String(state.me.id) !== String(a.seller_discord_id)) {
          els.bidBox.hidden = false;
          els.bidAmt.value = minNext != null ? String(minNext) : "";
        } else {
          els.bidBox.hidden = true;
        }
      }
    } catch (e) {
      if (els.detailError) {
        els.detailError.hidden = false;
        els.detailError.textContent = String(e.message || e);
      }
    }
  }

  function closeDetail() {
    if (els.overlay) els.overlay.classList.remove("is-open");
    state.detailId = null;
  }

  function init() {
    if (els.btnClose) els.btnClose.addEventListener("click", closeDetail);
    if (els.overlay) {
      els.overlay.addEventListener("click", function (ev) {
        if (ev.target === els.overlay) closeDetail();
      });
    }

    if (els.btnRefresh) els.btnRefresh.addEventListener("click", loadList);
    ["auction-q", "auction-seller", "auction-sort", "auction-page"].forEach(function (id) {
      var n = document.getElementById(id);
      if (n) n.addEventListener("change", loadList);
    });

    if (els.btnCreate) {
      els.btnCreate.addEventListener("click", async function () {
        if (els.createMsg) els.createMsg.innerHTML = "";
        try {
          var body = {
            card_public_id: els.createPid.value.trim(),
            currency: els.createCur.value,
            starting_bid: parseInt(els.createStart.value, 10),
            duration: els.createDur.value.trim(),
          };
          var r = await apiFetch("/api/auctions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          var j = await r.json();
          if (!r.ok) throw new Error(j.message || j.error || "Create failed");
          if (els.createMsg) {
            els.createMsg.innerHTML =
              '<div class="auction-msg-ok">Listed as auction #' + j.auction_id + "</div>";
          }
          await loadList();
        } catch (e) {
          if (els.createMsg) {
            els.createMsg.innerHTML =
              '<div class="auction-msg-err">' + String(e.message || e) + "</div>";
          }
        }
      });
    }

    if (els.btnBid) {
      els.btnBid.addEventListener("click", async function () {
        if (els.bidMsg) els.bidMsg.innerHTML = "";
        if (!state.detailId) return;
        try {
          var amt = parseInt(els.bidAmt.value, 10);
          var r = await apiFetch("/api/auctions/" + state.detailId + "/bid", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ amount: amt }),
          });
          var j = await r.json();
          if (!r.ok) throw new Error(j.message || j.error || "Bid rejected");
          if (els.bidMsg) {
            els.bidMsg.innerHTML = '<div class="auction-msg-ok">Bid placed.</div>';
          }
          await refreshBalances();
          await openDetail(state.detailId);
          await loadList();
        } catch (e) {
          if (els.bidMsg) {
            els.bidMsg.innerHTML =
              '<div class="auction-msg-err">' + String(e.message || e) + "</div>";
          }
        }
      });
    }

    if (els.sidebarToggle && els.sidebar) {
      els.sidebarToggle.addEventListener("click", function () {
        var open = els.sidebar.classList.toggle("is-open");
        els.sidebarToggle.setAttribute("aria-expanded", open ? "true" : "false");
      });
    }

    captureSessionFromFragment();
    bootAuth().then(loadList);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
