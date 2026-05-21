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

  var state = {
    me: null,
    detailId: null,
    authenticated: false,
    pickerQuery: "",
    pickerFavoritedOnly: false,
    pickerPage: 1,
    pickerTotal: 0,
    pickerSections: [],
    pickerSectionsInflight: null,
    pickerDebounce: 0,
    pickerInflight: null,
    pickerCards: [],
    selectedPublicId: "",
  };

  var PICKER_PAGE_SIZE = 60;

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
    detailSeller: document.getElementById("detail-seller"),
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
    pickerSearch: document.getElementById("auction-picker-search"),
    pickerFilterFavorited: document.getElementById("auction-picker-filter-favorited"),
    pickerResults: document.getElementById("auction-picker-results"),
    pickerEvoSections: document.getElementById("auction-picker-evo-sections"),
    pickerSelected: document.getElementById("auction-picker-selected"),
    btnBid: document.getElementById("btn-bid"),
    btnClose: document.getElementById("auction-close"),
    sidebarToggle: document.getElementById("sidebar-toggle"),
    sidebar: document.getElementById("sidebar"),
  };

  function profileUser(u, fallbackId) {
    if (u && (u.username || u.global_name || u.avatar_url)) return u;
    if (u && u.id) return u;
    if (fallbackId != null) {
      return { id: String(fallbackId), username: null, global_name: null, avatar_url: null };
    }
    return null;
  }

  function buildUserChip(u, extraClass) {
    var chip = document.createElement("div");
    chip.className = "pokepon-user-chip" + (extraClass ? " " + extraClass : "");
    var display =
      (u && u.global_name) || (u && u.username) || (u && u.id ? "User " + u.id : "Unknown user");
    if (u && u.avatar_url) {
      var img = document.createElement("img");
      img.className = "pokepon-user-chip-avatar";
      img.src = u.avatar_url;
      img.alt = "";
      chip.appendChild(img);
    } else {
      var ph = document.createElement("span");
      ph.className = "pokepon-user-chip-avatar pokepon-user-chip-avatar--ph";
      ph.textContent = (display.charAt(0) || "?").toUpperCase();
      chip.appendChild(ph);
    }
    var text = document.createElement("span");
    text.className = "pokepon-user-chip-text";
    var nm = document.createElement("span");
    nm.className = "pokepon-user-chip-name";
    nm.textContent = display;
    text.appendChild(nm);
    if (u && u.username) {
      var hn = document.createElement("span");
      hn.className = "pokepon-user-chip-handle";
      hn.textContent = "@" + u.username;
      text.appendChild(hn);
    }
    chip.appendChild(text);
    return chip;
  }

  function sym(cur) {
    return cur === "crystals" ? "💎" : "₽";
  }

  function fmtAmt(n, cur) {
    if (n == null) return "—";
    var s = Number(n).toLocaleString();
    return cur === "crystals" ? s + " 💎" : "₽" + s;
  }

  function fmtDate(iso) {
    if (!iso) return "—";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    });
  }

  function fmtEndsAt(iso) {
    if (!iso) return "—";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    var now = Date.now();
    var diff = d.getTime() - now;
    var countdown = "";
    if (diff > 0) {
      var secs = Math.floor(diff / 1000);
      var mins = Math.floor(secs / 60);
      var hrs = Math.floor(mins / 60);
      var days = Math.floor(hrs / 24);
      if (days > 0) {
        countdown = days + "d " + (hrs % 24) + "h left";
      } else if (hrs > 0) {
        countdown = hrs + "h " + (mins % 60) + "m left";
      } else if (mins > 0) {
        countdown = mins + "m left";
      } else {
        countdown = "<1m left";
      }
    } else {
      countdown = "ended";
    }
    return fmtDate(iso) + " (" + countdown + ")";
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
    loadPickerCollection();
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
          "Could not reach the Poké Pon API. Check the pokepon-api-base meta tag and that the bot's web server is online.";
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
    if (a.ends_at) el.dataset.endsAt = a.ends_at;
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
      fmtEndsAt(a.ends_at) +
      "</div>" +
      "</div>";
    var meta = el.querySelector(".auction-tile-meta");
    if (meta) {
      var sellerRow = document.createElement("div");
      sellerRow.className = "auction-tile-seller";
      sellerRow.appendChild(
        buildUserChip(profileUser(a.seller, a.seller_discord_id), "pokepon-user-chip--sm")
      );
      meta.appendChild(sellerRow);
    }
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
      if (els.detailSeller) {
        els.detailSeller.innerHTML = "";
        var sellerLabel = document.createElement("div");
        sellerLabel.className = "auction-muted";
        sellerLabel.style.marginBottom = "0.35rem";
        sellerLabel.textContent = "Listed by";
        els.detailSeller.appendChild(sellerLabel);
        els.detailSeller.appendChild(
          buildUserChip(profileUser(a.seller, a.seller_discord_id))
        );
      }
      els.detailSub.textContent =
        (a.card && a.card.set_name + " #" + a.card.collector_number) +
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
        fmtEndsAt(a.ends_at) +
        "</div>" +
        '<div class="auction-muted" style="margin-top:0.35rem">' +
        (a.bid_count || 0) +
        " total bids logged</div>";

      els.detailBids.innerHTML = "";
      (a.bids || []).forEach(function (b) {
        var li = document.createElement("li");
        var row = document.createElement("div");
        row.className = "auction-bid-row";
        var left = document.createElement("div");
        left.appendChild(
          buildUserChip(profileUser(b.bidder, b.bidder_discord_id), "pokepon-user-chip--sm")
        );
        var right = document.createElement("div");
        right.className = "auction-muted";
        right.style.textAlign = "right";
        right.innerHTML =
          "<div>" +
          (b.display || fmtAmt(b.amount, b.currency || cur)) +
          "</div>" +
          (b.created_at ? "<div>" + fmtDate(b.created_at) + "</div>" : "");
        row.appendChild(left);
        row.appendChild(right);
        li.appendChild(row);
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

  function buildPickerPath() {
    var qs = new URLSearchParams();
    qs.set("page", String(state.pickerPage));
    qs.set("page_size", String(PICKER_PAGE_SIZE));
    qs.set("sort", "newest");
    if (state.pickerQuery) qs.set("q", state.pickerQuery);
    if (state.pickerFavoritedOnly) qs.set("favorited", "1");
    return "/api/me/collection?" + qs.toString();
  }

  function buildPickerEvolutionSectionsPath() {
    var qs = new URLSearchParams();
    qs.set("page_size", String(PICKER_PAGE_SIZE));
    qs.set("sort", "newest");
    qs.set("q", state.pickerQuery);
    if (state.pickerFavoritedOnly) qs.set("favorited", "1");
    return "/api/me/collection/evolution-sections?" + qs.toString();
  }

  async function loadPickerEvolutionSections() {
    if (!state.pickerQuery || state.pickerPage !== 1) {
      state.pickerSections = [];
      renderPickerEvoSections();
      return;
    }
    if (state.pickerSectionsInflight) state.pickerSectionsInflight.abort();
    var ctrl = new AbortController();
    state.pickerSectionsInflight = ctrl;
    try {
      var r = await apiFetch(buildPickerEvolutionSectionsPath(), { signal: ctrl.signal });
      if (!r.ok) return;
      var j = await r.json();
      state.pickerSectionsInflight = null;
      if (
        (j.query || "").toLowerCase() !== (state.pickerQuery || "").toLowerCase() ||
        state.pickerPage !== 1
      ) {
        return;
      }
      state.pickerSections = Array.isArray(j.sections) ? j.sections : [];
      renderPickerEvoSections();
    } catch (e) {
      if (e.name === "AbortError") return;
      state.pickerSectionsInflight = null;
    }
  }

  function updatePickerSelectedHint(card) {
    if (!els.pickerSelected) return;
    if (!state.selectedPublicId) {
      els.pickerSelected.hidden = true;
      els.pickerSelected.textContent = "";
      return;
    }
    var label = state.selectedPublicId;
    if (card && card.name) {
      label = card.name + " · " + state.selectedPublicId;
    }
    els.pickerSelected.hidden = false;
    els.pickerSelected.textContent = "Selected: " + label;
  }

  function selectPickerCard(c) {
    if (!c || !c.public_id || c.blocked_reason) return;
    state.selectedPublicId = c.public_id;
    if (els.createPid) els.createPid.value = c.public_id;
    updatePickerSelectedHint(c);
    renderPicker();
  }

  async function loadPickerCollection() {
    if (!state.authenticated) return;
    if (state.pickerInflight) state.pickerInflight.abort();
    if (state.pickerSectionsInflight) {
      state.pickerSectionsInflight.abort();
      state.pickerSectionsInflight = null;
    }
    var ctrl = new AbortController();
    state.pickerInflight = ctrl;
    try {
      var r = await apiFetch(buildPickerPath(), { signal: ctrl.signal });
      if (!r.ok) return;
      var j = await r.json();
      state.pickerInflight = null;
      state.pickerCards = (j.items || []).map(function (c) {
        return {
          instance_id: c.instance_id,
          public_id: c.public_id,
          name: c.card ? c.card.name : "Card",
          image_small_url: c.card ? c.card.image_small_url : null,
          is_favorite: !!c.is_favorite,
          blocked_reason: c.sell && c.sell.blocked_reason ? c.sell.blocked_reason : null,
        };
      });
      state.pickerTotal = Number(j.total) || 0;
      state.pickerSections = [];
      renderPicker();
      loadPickerEvolutionSections();
    } catch (e) {
      if (e.name === "AbortError") return;
      state.pickerInflight = null;
    }
  }

  function pickerSearchChanged() {
    if (!els.pickerSearch) return;
    var value = (els.pickerSearch.value || "").trim();
    clearTimeout(state.pickerDebounce);
    state.pickerDebounce = setTimeout(function () {
      if (value === state.pickerQuery) return;
      state.pickerQuery = value.toLowerCase();
      state.pickerPage = 1;
      loadPickerCollection();
    }, 200);
  }

  function pickerHasEvoSections() {
    return !!(
      state.pickerQuery &&
      state.pickerPage === 1 &&
      state.pickerSections &&
      state.pickerSections.length
    );
  }

  function mapPickerCard(c) {
    return {
      instance_id: c.instance_id,
      public_id: c.public_id,
      name: c.card ? c.card.name : "Card",
      image_small_url: c.card ? c.card.image_small_url : null,
      is_favorite: !!c.is_favorite,
      blocked_reason: c.sell && c.sell.blocked_reason ? c.sell.blocked_reason : null,
    };
  }

  function appendPickerCard(parent, c) {
    var el = document.createElement("motion");
    el.className = "picker-card";
    if (state.selectedPublicId && c.public_id === state.selectedPublicId) {
      el.classList.add("is-selected");
    }
    if (c.is_favorite) el.classList.add("is-favorite");
    if (c.blocked_reason) {
      el.classList.add("is-disabled");
      el.title = c.blocked_reason;
    }
    var img = c.image_small_url ? '<img src="' + c.image_small_url + '" alt="" loading="lazy" />' : "";
    var favMark = c.is_favorite ? '<span class="picker-fav" title="Favorited">⭐</span>' : "";
    el.innerHTML = img + "<div>" + (c.name || "Card") + favMark + "</div>";
    el.onclick = function () {
      selectPickerCard(c);
    };
    parent.appendChild(el);
  }

  function renderPickerEvoSections() {
    if (!els.pickerEvoSections) return;
    els.pickerEvoSections.innerHTML = "";
    if (!pickerHasEvoSections()) {
      els.pickerEvoSections.hidden = true;
      return;
    }
    els.pickerEvoSections.hidden = false;
    state.pickerSections.forEach(function (sec) {
      var items = Array.isArray(sec.items) ? sec.items : [];
      if (!items.length) return;
      var block = document.createElement("section");
      block.className = "picker-evo-section";
      var heading = document.createElement("h3");
      heading.className = "picker-evo-heading";
      heading.textContent = sec.label || "Evolution line";
      var grid = document.createElement("div");
      grid.className = "picker-grid picker-evo-grid";
      items.forEach(function (raw) {
        appendPickerCard(grid, mapPickerCard(raw));
      });
      block.appendChild(heading);
      block.appendChild(grid);
      els.pickerEvoSections.appendChild(block);
    });
  }

  function renderPicker() {
    if (!els.pickerResults) return;
    els.pickerResults.innerHTML = "";
    if (els.pickerEvoSections) {
      els.pickerEvoSections.innerHTML = "";
      els.pickerEvoSections.hidden = true;
    }
    if (!state.pickerCards.length) {
      if (state.pickerFavoritedOnly) {
        if (!pickerHasEvoSections()) {
          els.pickerResults.innerHTML =
            '<div class="auction-muted">' +
            (state.pickerQuery
              ? 'No favorited copies match "' + state.pickerQuery + '"'
              : "You have no favorited copies.") +
            "</div>";
        }
      } else if (state.pickerQuery) {
        if (!pickerHasEvoSections()) {
          els.pickerResults.innerHTML =
            '<div class="auction-muted">No cards match "' + state.pickerQuery + '"</div>';
        }
      }
      renderPickerEvoSections();
      return;
    }
    state.pickerCards.forEach(function (c) {
      appendPickerCard(els.pickerResults, c);
    });
    var totalPages = Math.max(1, Math.ceil(state.pickerTotal / PICKER_PAGE_SIZE));
    if (totalPages > 1) {
      var nav = document.createElement("div");
      nav.className = "picker-pager";
      var prev = document.createElement("button");
      prev.type = "button";
      prev.className = "btn btn-ghost btn-small";
      prev.textContent = "← Prev";
      prev.disabled = state.pickerPage <= 1;
      prev.onclick = function () {
        if (state.pickerPage > 1) {
          state.pickerPage--;
          loadPickerCollection();
        }
      };
      var info = document.createElement("span");
      info.className = "auction-muted";
      info.textContent = " Page " + state.pickerPage + " of " + totalPages + " ";
      var next = document.createElement("button");
      next.type = "button";
      next.className = "btn btn-ghost btn-small";
      next.textContent = "Next →";
      next.disabled = state.pickerPage >= totalPages;
      next.onclick = function () {
        if (state.pickerPage < totalPages) {
          state.pickerPage++;
          loadPickerCollection();
        }
      };
      nav.appendChild(prev);
      nav.appendChild(info);
      nav.appendChild(next);
      els.pickerResults.appendChild(nav);
    }
    renderPickerEvoSections();
  }

  function init() {
    if (els.btnClose) els.btnClose.addEventListener("click", closeDetail);
    if (els.overlay) {
      els.overlay.addEventListener("click", function (ev) {
        if (ev.target === els.overlay) closeDetail();
      });
    }

    if (els.btnRefresh) els.btnRefresh.addEventListener("click", loadList);
    if (els.pickerSearch) els.pickerSearch.addEventListener("input", pickerSearchChanged);
    if (els.pickerFilterFavorited) {
      els.pickerFilterFavorited.addEventListener("click", function () {
        state.pickerFavoritedOnly = !state.pickerFavoritedOnly;
        var on = state.pickerFavoritedOnly;
        els.pickerFilterFavorited.classList.toggle("is-active", on);
        els.pickerFilterFavorited.setAttribute("aria-pressed", on ? "true" : "false");
        state.pickerPage = 1;
        loadPickerCollection();
      });
    }
    if (els.createPid) {
      els.createPid.addEventListener("input", function () {
        state.selectedPublicId = (els.createPid.value || "").trim();
        var match = null;
        state.pickerCards.forEach(function (c) {
          if (c.public_id === state.selectedPublicId) match = c;
        });
        updatePickerSelectedHint(match);
        renderPicker();
      });
    }
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

    setInterval(function () {
      pruneEndedTiles();
    }, 15000);

    setInterval(function () {
      loadList();
    }, 60000);
  }

  function pruneEndedTiles() {
    if (!els.grid) return;
    var grace = 60000;
    var now = Date.now();
    var tiles = els.grid.querySelectorAll(".auction-tile[data-ends-at]");
    tiles.forEach(function (tile) {
      var end = new Date(tile.dataset.endsAt).getTime();
      if (isNaN(end) || end + grace > now) return;
      tile.classList.add("auction-tile-ended");
      setTimeout(function () {
        if (tile.parentNode) tile.parentNode.removeChild(tile);
      }, 600);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
