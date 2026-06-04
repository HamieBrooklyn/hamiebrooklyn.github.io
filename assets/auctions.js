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
    pickerEvolvable: false,
    pickerNonEvolvable: false,
    pickerDuplicates: false,
    pickerCraftRole: "",
    pickerPage: 1,
    modalItem: null,
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
    pickerFilterEvolvable: document.getElementById("auction-picker-filter-evolvable"),
    pickerFilterNonEvolvable: document.getElementById("auction-picker-filter-non-evolvable"),
    pickerFilterDuplicates: document.getElementById("auction-picker-filter-duplicates"),
    pickerResults: document.getElementById("auction-picker-results"),
    modal: document.getElementById("card-modal"),
    modalImg: document.getElementById("modal-img"),
    modalTitle: document.getElementById("modal-title"),
    modalSet: document.getElementById("modal-set"),
    modalRarity: document.getElementById("modal-rarity"),
    modalHp: document.getElementById("modal-hp"),
    modalDamage: document.getElementById("modal-damage"),
    modalTypes: document.getElementById("modal-types"),
    modalPid: document.getElementById("modal-pid"),
    modalCopyId: document.getElementById("modal-copy-id"),
    modalAttacksSection: document.getElementById("modal-attacks-section"),
    modalAttacks: document.getElementById("modal-attacks"),
    modalObtained: document.getElementById("modal-obtained"),
    modalEvolveSection: document.getElementById("modal-evolve-section"),
    modalEvoStages: document.getElementById("modal-evo-stages"),
    modalEvoBlock: document.getElementById("modal-evo-block"),
    modalEvoTargets: document.getElementById("modal-evo-targets"),
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

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function plainDiscordMsg(s) {
    return String(s == null ? "" : s).replace(/\*\*/g, "").replace(/`/g, "");
  }

  function rarityClassFor(displayName) {
    var v = (displayName || "").toLowerCase();
    if (!v) return "rarity-unknown";
    if (v.indexOf("common") !== -1) return "rarity-common";
    if (v.indexOf("uncommon") !== -1) return "rarity-uncommon";
    if (v.indexOf("ultra") !== -1) return "rarity-ultra";
    if (v.indexOf("hyper") !== -1) return "rarity-hyper";
    if (v.indexOf("secret") !== -1) return "rarity-secret";
    if (v.indexOf("special") !== -1) return "rarity-special";
    if (v.indexOf("rare") !== -1) return "rarity-rare";
    return "rarity-unknown";
  }

  function copyCardId(text, btn) {
    var pid = String(text || "").trim();
    if (!pid || pid === "—") return;
    function flash(ok) {
      if (!btn) return;
      var prev = btn.textContent;
      btn.textContent = ok ? "Copied" : "Failed";
      setTimeout(function () {
        btn.textContent = prev;
      }, 1200);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(pid).then(function () { flash(true); }).catch(function () { flash(false); });
      return;
    }
    try {
      var ta = document.createElement("textarea");
      ta.value = pid;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      flash(true);
    } catch (_) {
      flash(false);
    }
  }

  var CRAFT_TRAINER_SUBTYPES = ["Supporter", "Stadium"];

  function subtypeList(card) {
    var subs = card && card.tcg_subtypes;
    return Array.isArray(subs) ? subs : [];
  }

  function hasSubtype(subs, label) {
    var want = label.toLowerCase();
    return subs.some(function (s) {
      return String(s).toLowerCase() === want;
    });
  }

  function nameLooksLikeItem(name) {
    var n = String(name || "").toLowerCase();
    return /\b(energy|ball|potion|medicine|ticket|fossil|stone|orb|capsule|case|box|pass|map|rod|scope|finder|charm|bell|mulch|compost|core|module|part|fragment|shard|dust|incense|lure|module|patch|scarf|band|coat|belt|glasses|helmet|mask|plate|rock|scale|shell|fang|claw|wing|feather|leaf|root|mushroom|honey|berry|sweet|sour|dry|bitter|spicy|fresh|big|tiny|pretty|strange|nugget|pearl|stardust|star\s*piece|thunder|fire|water|leaf|moon|sun|dawn|dusk|shiny|oval|ever|kings|metal|heart|soul|plume|reveal|escape|switch|focus|heavy|float|light|quick|smooth|repeat|exp|lucky|master|safari|net|dive|nest|repeat|timer|luxury|premier|heal|hyper|max|full|revive|ether|elixir|antidote|awakening|burn|ice|paralyze|full\s*heal|lava|old\s*amber|helix|dome|root|claw)\b/.test(n);
  }

  function effectiveCraftRole(item) {
    var role = item.craft_role;
    var card = item.card || {};
    var st = (card.supertype || "").trim();
    var subs = subtypeList(card);
    if (st === "Energy") return "item";
    if (st !== "Trainer") return role || "other";
    if (hasSubtype(subs, "Item")) return "item";
    if (hasSubtype(subs, "Pokémon Tool")) return "item";
    if (CRAFT_TRAINER_SUBTYPES.some(function (label) {
      return hasSubtype(subs, label);
    })) {
      return "craft_trainer";
    }
    if (nameLooksLikeItem(card.name)) return "item";
    if (role === "item") return "item";
    return "other";
  }

  function filterPickerRowsForCraftChip(rows) {
    var role = state.pickerCraftRole;
    if (!role) return rows;
    if (role === "item") {
      return rows.filter(function (it) {
        return effectiveCraftRole(it) === "item";
      });
    }
    if (role === "craft_trainer") {
      return rows.filter(function (it) {
        return effectiveCraftRole(it) === "craft_trainer";
      });
    }
    return rows;
  }

  function appendPickerCollectionQuery(qs) {
    if (state.pickerQuery) qs.set("q", state.pickerQuery);
    if (state.pickerFavoritedOnly) qs.set("favorited", "1");
    if (state.pickerEvolvable) qs.set("evolvable", "1");
    if (state.pickerNonEvolvable) qs.set("non_evolvable", "1");
    if (state.pickerDuplicates) qs.set("duplicates", "1");
    if (state.pickerCraftRole === "craft_trainer") {
      qs.set("supertype", "Trainer");
    } else if (state.pickerCraftRole) {
      qs.set("craft_role", state.pickerCraftRole);
    }
  }

  function syncPickerEvolvableChips() {
    if (els.pickerFilterEvolvable) {
      els.pickerFilterEvolvable.classList.toggle("is-active", !!state.pickerEvolvable);
      els.pickerFilterEvolvable.setAttribute("aria-pressed", state.pickerEvolvable ? "true" : "false");
    }
    if (els.pickerFilterNonEvolvable) {
      els.pickerFilterNonEvolvable.classList.toggle("is-active", !!state.pickerNonEvolvable);
      els.pickerFilterNonEvolvable.setAttribute("aria-pressed", state.pickerNonEvolvable ? "true" : "false");
    }
  }

  function applyModalCardFields(item) {
    var card = item.card || {};
    var rarity = card.rarity || {};
    els.modalImg.src = card.image_large_url || card.image_small_url || "";
    els.modalImg.alt = card.name || "Card";
    els.modalTitle.textContent = card.name || "Card";
    els.modalSet.textContent =
      (card.set_name || card.set_code || "") + " · #" + (card.collector_number || "?");
    els.modalRarity.textContent = rarity.display_name || card.tcg_rarity || "Unknown rarity";
    els.modalRarity.className = "modal-rarity " + rarityClassFor(rarity.display_name);
    els.modalHp.textContent = card.hp ? String(card.hp) : "—";
    els.modalDamage.textContent = card.max_damage ? String(card.max_damage) : "—";
    var types = Array.isArray(card.types) && card.types.length ? card.types.join(" · ") : "—";
    els.modalTypes.textContent = types;
    els.modalPid.textContent = item.public_id || "—";
    if (item.obtained_at) {
      var d = new Date(item.obtained_at);
      els.modalObtained.textContent =
        "Obtained " + d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
    } else {
      els.modalObtained.textContent = "";
    }
    var attacks = Array.isArray(card.attacks) ? card.attacks : [];
    if (attacks.length === 0) {
      els.modalAttacksSection.hidden = true;
      els.modalAttacks.innerHTML = "";
    } else {
      els.modalAttacksSection.hidden = false;
      els.modalAttacks.innerHTML = attacks
        .map(function (atk) {
          var name = escapeHtml(atk.name || "Attack");
          var dmg = atk.damage ? '<span class="atk-dmg">' + escapeHtml(atk.damage) + "</span>" : "";
          var cost = Array.isArray(atk.cost) && atk.cost.length
            ? '<span class="atk-cost">' + atk.cost.map(escapeHtml).join(" · ") + "</span>"
            : "";
          var text = atk.text ? '<p class="atk-text">' + escapeHtml(atk.text) + "</p>" : "";
          return (
            "<li>" +
            '<div class="atk-row"><span class="atk-name">' +
            name +
            "</span>" +
            cost +
            dmg +
            "</div>" +
            text +
            "</li>"
          );
        })
        .join("");
    }
  }

  function renderEvolutionUi(item) {
    var evo = item && item.evolution;
    if (!els.modalEvolveSection || !evo || !evo.targets || !evo.targets.length) {
      if (els.modalEvolveSection) els.modalEvolveSection.hidden = true;
      return;
    }
    els.modalEvolveSection.hidden = false;
    if (els.modalEvoStages) {
      var stages = Number(evo.evolution_stages) || 0;
      els.modalEvoStages.textContent = stages
        ? "Times evolved on this copy: " + stages
        : "Not evolved yet on this copy.";
    }
    if (els.modalEvoBlock) {
      if (evo.blocked_reason) {
        els.modalEvoBlock.hidden = false;
        els.modalEvoBlock.textContent = plainDiscordMsg(evo.blocked_reason);
      } else {
        els.modalEvoBlock.hidden = true;
        els.modalEvoBlock.textContent = "";
      }
    }
    if (els.modalEvoTargets && window.PokeponEvoFocus) {
      PokeponEvoFocus.renderTargetRows(els.modalEvoTargets, evo.targets, {
        readonly: true,
        canEvolve: false,
        selectedId: null,
        fmtCost: function (n) {
          return "₽" + Number(n || 0).toLocaleString();
        },
      });
    }
  }

  function openPickerCardModalWithItem(item) {
    if (!item || !els.modal) return;
    state.modalItem = item;
    applyModalCardFields(item);
    renderEvolutionUi(item);
    els.modal.hidden = false;
    els.modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
  }

  function openPickerCardModal(c) {
    if (!c || !c.public_id) return;
    if (c._raw) {
      openPickerCardModalWithItem(c._raw);
      return;
    }
    apiFetch("/api/me/cards/" + encodeURIComponent(c.public_id))
      .then(function (r) {
        if (!r.ok) return null;
        return r.json();
      })
      .then(function (detail) {
        if (detail) openPickerCardModalWithItem(detail);
      })
      .catch(function () {});
  }

  function closePickerCardModal() {
    if (!els.modal) return;
    if (window.PokeponEvoFocus) PokeponEvoFocus.close();
    state.modalItem = null;
    els.modal.hidden = true;
    els.modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
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
      if (window.PokePonApp && window.PokePonApp.notifyBalancesChanged) {
        window.PokePonApp.notifyBalancesChanged();
      }
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
    var gradeBadge =
      a.card && a.card.grade != null
        ? '<span class="card-tile-grade" title="' +
          escapeHtml(a.card.grade_label || "Graded") +
          '">' +
          escapeHtml(String(a.card.grade)) +
          "</span>"
        : "";
    el.innerHTML =
      '<img src="' +
      img +
      '" alt="" loading="lazy" />' +
      gradeBadge +
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
    appendPickerCollectionQuery(qs);
    return "/api/me/collection?" + qs.toString();
  }

  function buildPickerEvolutionSectionsPath() {
    var qs = new URLSearchParams();
    qs.set("page_size", String(PICKER_PAGE_SIZE));
    qs.set("sort", "newest");
    qs.set("q", state.pickerQuery);
    if (state.pickerFavoritedOnly) qs.set("favorited", "1");
    if (state.pickerDuplicates) qs.set("duplicates", "1");
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
          craft_role: c.craft_role,
          card: c.card,
          blocked_reason: c.sell && c.sell.blocked_reason ? c.sell.blocked_reason : null,
          _raw: c,
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
      craft_role: c.craft_role,
      card: c.card,
      blocked_reason: c.sell && c.sell.blocked_reason ? c.sell.blocked_reason : null,
      _raw: c,
    };
  }

  function appendPickerCard(parent, c) {
    var el = document.createElement("div");
    el.className = "picker-card";
    if (state.selectedPublicId && c.public_id === state.selectedPublicId) {
      el.classList.add("is-selected");
    }
    if (c.is_favorite) el.classList.add("is-favorite");
    if (c.blocked_reason) {
      el.classList.add("is-disabled");
      el.title = plainDiscordMsg(c.blocked_reason);
    }
    var hit = document.createElement("button");
    hit.type = "button";
    hit.className = "picker-card-hit";
    var img = c.image_small_url ? '<img src="' + escapeHtml(c.image_small_url) + '" alt="" loading="lazy" />' : "";
    var favMark = c.is_favorite ? '<span class="picker-fav" title="Favorited">⭐</span>' : "";
    hit.innerHTML = img + "<div>" + escapeHtml(c.name || "Card") + favMark + "</div>";
    hit.onclick = function () {
      if (c.blocked_reason) return;
      selectPickerCard(c);
    };
    var viewBtn = document.createElement("button");
    viewBtn.type = "button";
    viewBtn.className = "picker-card-view btn btn-ghost btn-small";
    viewBtn.textContent = "View";
    viewBtn.onclick = function (ev) {
      ev.stopPropagation();
      openPickerCardModal(c);
    };
    el.appendChild(hit);
    el.appendChild(viewBtn);
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
    var visible = filterPickerRowsForCraftChip(state.pickerCards);
    if (!state.pickerCards.length && !pickerHasEvoSections()) {
      var emptyMsg = "";
      if (state.pickerFavoritedOnly) {
        emptyMsg = state.pickerQuery
          ? 'No favorited copies match "' + escapeHtml(state.pickerQuery) + '"'
          : "You have no favorited copies.";
      } else if (state.pickerEvolvable) {
        emptyMsg = state.pickerQuery
          ? 'No evolvable cards match "' + escapeHtml(state.pickerQuery) + '"'
          : "You have no evolvable cards in your collection.";
      } else if (state.pickerNonEvolvable) {
        emptyMsg = state.pickerQuery
          ? 'No non-evolvable cards match "' + escapeHtml(state.pickerQuery) + '"'
          : "You have no non-evolvable cards in your collection.";
      } else if (state.pickerQuery) {
        emptyMsg = 'No cards match "' + escapeHtml(state.pickerQuery) + '"';
      }
      if (emptyMsg) {
        els.pickerResults.innerHTML = '<div class="auction-muted">' + emptyMsg + "</div>";
      }
      renderPickerEvoSections();
      return;
    }
    visible.forEach(function (c) {
      appendPickerCard(els.pickerResults, c);
    });
    if (!visible.length && state.pickerCards.length) {
      els.pickerResults.innerHTML =
        '<div class="auction-muted">No cards match the selected type filter on this page.</div>';
    }
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
    if (els.pickerFilterEvolvable) {
      els.pickerFilterEvolvable.addEventListener("click", function () {
        state.pickerEvolvable = !state.pickerEvolvable;
        if (state.pickerEvolvable) state.pickerNonEvolvable = false;
        syncPickerEvolvableChips();
        state.pickerPage = 1;
        loadPickerCollection();
      });
    }
    if (els.pickerFilterNonEvolvable) {
      els.pickerFilterNonEvolvable.addEventListener("click", function () {
        state.pickerNonEvolvable = !state.pickerNonEvolvable;
        if (state.pickerNonEvolvable) state.pickerEvolvable = false;
        syncPickerEvolvableChips();
        state.pickerPage = 1;
        loadPickerCollection();
      });
    }
    if (els.pickerFilterDuplicates) {
      els.pickerFilterDuplicates.addEventListener("click", function () {
        state.pickerDuplicates = !state.pickerDuplicates;
        var on = state.pickerDuplicates;
        els.pickerFilterDuplicates.classList.toggle("is-active", on);
        els.pickerFilterDuplicates.setAttribute("aria-pressed", on ? "true" : "false");
        state.pickerPage = 1;
        loadPickerCollection();
      });
    }
    var pickerCraftChips = Array.prototype.slice.call(
      document.querySelectorAll(".chip[data-auction-picker-craft-role]")
    );
    pickerCraftChips.forEach(function (chip) {
      chip.addEventListener("click", function () {
        var role = chip.getAttribute("data-auction-picker-craft-role") || "";
        state.pickerCraftRole = role;
        pickerCraftChips.forEach(function (c) {
          var on = (c.getAttribute("data-auction-picker-craft-role") || "") === role;
          c.classList.toggle("is-active", on);
          c.setAttribute("aria-pressed", on ? "true" : "false");
        });
        state.pickerPage = 1;
        loadPickerCollection();
      });
    });
    document.addEventListener("click", function (e) {
      var t = e.target;
      if (t && t.dataset && t.dataset.close !== undefined) closePickerCardModal();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      var evoModal = document.getElementById("evo-focus-modal");
      if (evoModal && !evoModal.hidden) return;
      if (els.modal && !els.modal.hidden) closePickerCardModal();
    });
    if (els.modalCopyId && els.modalPid) {
      els.modalCopyId.addEventListener("click", function () {
        copyCardId(els.modalPid.textContent, els.modalCopyId);
      });
    }
    if (window.PokeponEvoFocus) {
      PokeponEvoFocus.mount({ fmtCost: function (n) { return "₽" + Number(n || 0).toLocaleString(); }, rarityClassFor: rarityClassFor });
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
