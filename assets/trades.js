/* PokePon trades — interactive two-sided trade sessions */
(function () {
  "use strict";

  var API_BASE = (window.POKEPON_API_BASE || "").replace(/\/+$/, "");
  function api(path) { return API_BASE + path; }

  var SESSION_KEY = "pokepon-session";
  function readSessionToken() { try { return localStorage.getItem(SESSION_KEY) || ""; } catch (_) { return ""; } }
  function storeSessionToken(t) { try { localStorage.setItem(SESSION_KEY, t); } catch (_) {} }
  function tradeIdFromQuery() {
    var raw = new URLSearchParams(window.location.search).get("trade");
    if (!raw) return null;
    var n = parseInt(raw, 10);
    return isFinite(n) && n > 0 ? n : null;
  }

  async function openTradeFromQuery() {
    var id = tradeIdFromQuery();
    if (!id || !state.authenticated) return;
    try {
      var r = await apiFetch("/api/me/trades/" + id);
      if (!r.ok) return;
      var t = await r.json();
      if (t.status === "active") {
        await enterRoom(id);
      } else {
        await loadList();
      }
    } catch (e) {
      /* invite may still appear in list */
    }
  }

  function captureSessionFromFragment() {
    if (!window.location.hash) return;
    var p = new URLSearchParams(window.location.hash.slice(1));
    var t = p.get("session"); if (!t) return;
    storeSessionToken(t); p.delete("session");
    var h = p.toString();
    window.history.replaceState(null, "", window.location.pathname + window.location.search + (h ? "#" + h : ""));
  }
  function apiHeaders() {
    var h = { "ngrok-skip-browser-warning": "1" };
    var t = readSessionToken(); if (t) h.Authorization = "Bearer " + t;
    return h;
  }
  function apiFetch(path, opts) {
    opts = opts || {}; opts.credentials = "include";
    opts.headers = Object.assign({}, apiHeaders(), opts.headers || {});
    return fetch(api(path), opts);
  }

  var state = {
    me: null, authenticated: false,
    activeTrade: null,
    myCards: [],
    selectedCardIds: [],
    pollTimer: null,
    listTimer: null,
    tradeWs: null,
    tradeWsConnected: false,
    pickerQuery: "",
    pickerFavoritedOnly: false,
    pickerEvolvable: false,
    pickerNonEvolvable: false,
    pickerDuplicates: false,
    pickerCraftRole: "",
    pickerPage: 1,
    pickerTotal: 0,
    pickerSections: [],
    pickerSectionsInflight: null,
    pickerDebounce: 0,
    pickerInflight: null,
    selectedPartnerId: null,
    inviteSearchDebounce: 0,
    inviteSearchInFlight: null,
    inviteSearchCache: {},
    modalItem: null,
    modalAllowEvolve: false,
    evoSelectedTargetId: null,
    evoInFlight: false,
    serverPd: 0,
    serverCr: 0,
    currencyDirty: false,
    currencySaveTimer: null,
  };

  var els = {
    sidebarUser: document.getElementById("sidebar-user"),
    userAvatar: document.getElementById("user-avatar"),
    userName: document.getElementById("user-name"),
    btnLogin: document.getElementById("btn-login"),
    btnLogout: document.getElementById("btn-logout"),
    inviteSection: document.getElementById("trade-invite-section"),
    inviteInput: document.getElementById("invite-input"),
    inviteSuggestions: document.getElementById("invite-suggestions"),
    btnInvite: document.getElementById("btn-invite"),
    inviteMsg: document.getElementById("invite-msg"),
    listSection: document.getElementById("trade-list-section"),
    listError: document.getElementById("trade-list-error"),
    tradeList: document.getElementById("trade-list"),
    listEmpty: document.getElementById("trade-list-empty"),
    room: document.getElementById("trade-room"),
    roomTitle: document.getElementById("trade-room-title"),
    roomPartner: document.getElementById("trade-room-partner"),
    roomMsg: document.getElementById("trade-room-msg"),
    btnReady: document.getElementById("btn-ready"),
    btnCancelTrade: document.getElementById("btn-cancel-trade"),
    btnLeaveTrade: document.getElementById("btn-leave-trade"),
    sideMineCards: document.getElementById("side-mine-cards"),
    sideTheirsCards: document.getElementById("side-theirs-cards"),
    sideMineLabel: document.getElementById("side-mine-label"),
    sideTheirsLabel: document.getElementById("side-theirs-label"),
    myPd: document.getElementById("my-pd"),
    myCr: document.getElementById("my-cr"),
    myBalanceHint: document.getElementById("my-balance-hint"),
    myBalancePd: document.getElementById("my-balance-pd"),
    myBalanceCr: document.getElementById("my-balance-cr"),
    btnSaveSide: document.getElementById("btn-save-side"),
    theirPd: document.getElementById("their-pd"),
    theirCr: document.getElementById("their-cr"),
    theirReadyStatus: document.getElementById("their-ready-status"),
    pickerSearch: document.getElementById("picker-search"),
    pickerFilterFavorited: document.getElementById("picker-filter-favorited"),
    pickerFilterEvolvable: document.getElementById("picker-filter-evolvable"),
    pickerFilterNonEvolvable: document.getElementById("picker-filter-non-evolvable"),
    pickerFilterDuplicates: document.getElementById("picker-filter-duplicates"),
    tradeLiveHint: document.getElementById("trade-live-hint"),
    pickerResults: document.getElementById("picker-results"),
    pickerEvoSections: document.getElementById("picker-evo-sections"),
    sidebarToggle: document.getElementById("sidebar-toggle"),
    sidebar: document.getElementById("sidebar"),
    modal: document.getElementById("card-modal"),
    modalImg: document.getElementById("modal-img"),
    modalTitle: document.getElementById("modal-title"),
    modalSet: document.getElementById("modal-set"),
    modalRarity: document.getElementById("modal-rarity"),
    modalHp: document.getElementById("modal-hp"),
    modalDamage: document.getElementById("modal-damage"),
    modalTypes: document.getElementById("modal-types"),
    modalPid: document.getElementById("modal-pid"),
    modalAttacksSection: document.getElementById("modal-attacks-section"),
    modalAttacks: document.getElementById("modal-attacks"),
    modalObtained: document.getElementById("modal-obtained"),
    modalCopyId: document.getElementById("modal-copy-id"),
    modalEvolveSection: document.getElementById("modal-evolve-section"),
    modalEvoDesc: document.getElementById("modal-evo-desc"),
    modalEvoStages: document.getElementById("modal-evo-stages"),
    modalEvoBlock: document.getElementById("modal-evo-block"),
    modalEvoTargets: document.getElementById("modal-evo-targets"),
    modalEvoActions: document.getElementById("modal-evo-actions"),
    modalEvoBtn: document.getElementById("modal-evo-btn"),
    modalEvoMsg: document.getElementById("modal-evo-msg"),
  };

  function fmtPd(n) { return "₽" + Number(n || 0).toLocaleString(); }
  function fmtCr(n) { return "💎 " + Number(n || 0).toLocaleString(); }

  function parseCurrencyInput(el) {
    if (!el) return 0;
    var raw = String(el.value || "").trim();
    if (raw === "") return 0;
    var n = parseInt(raw, 10);
    return isNaN(n) || n < 0 ? 0 : n;
  }

  function currencyInputsLocked() {
    if (!els.myPd || !els.myCr) return false;
    var ae = document.activeElement;
    if (ae === els.myPd || ae === els.myCr) return true;
    if (state.currencyDirty) return true;
    return false;
  }

  function syncCurrencyInputsFromServer(mySide) {
    var pd = mySide.pokedollars || 0;
    var cr = mySide.crystals || 0;
    state.serverPd = pd;
    state.serverCr = cr;
    if (!currencyInputsLocked()) {
      els.myPd.value = String(pd);
      els.myCr.value = String(cr);
      state.currencyDirty = false;
    }
  }

  function renderViewerBalance(balance) {
    if (!balance || !els.myBalanceHint) return;
    if (els.myBalancePd) els.myBalancePd.textContent = fmtPd(balance.pokedollars);
    if (els.myBalanceCr) els.myBalanceCr.textContent = fmtCr(balance.crystals);
    els.myBalanceHint.hidden = false;
    if (window.PokePonApp && window.PokePonApp.notifyBalancesChanged) {
      window.PokePonApp.notifyBalancesChanged();
    }
  }

  function scheduleCurrencySave() {
    state.currencyDirty = true;
    if (state.currencySaveTimer) clearTimeout(state.currencySaveTimer);
    state.currencySaveTimer = setTimeout(function () {
      state.currencySaveTimer = null;
      saveSide();
    }, 700);
  }

  function clearCurrencySaveTimer() {
    if (state.currencySaveTimer) {
      clearTimeout(state.currencySaveTimer);
      state.currencySaveTimer = null;
    }
  }

  function profileUser(u) {
    if (!u) return null;
    if (u.username || u.global_name || u.avatar_url) return u;
    if (u.id) return u;
    return null;
  }

  function buildUserChip(u, extraClass) {
    u = profileUser(u);
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

  function copyCardId(text, buttonEl) {
    var pid = (text || "").trim();
    if (!pid) return;
    var flash = function (ok) {
      if (!buttonEl || !ok) return;
      var orig = buttonEl.textContent;
      buttonEl.textContent = "Copied!";
      setTimeout(function () {
        buttonEl.textContent = orig;
      }, 1500);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(pid).then(function () { flash(true); }).catch(function () { fallbackCopy(); });
    } else {
      fallbackCopy();
    }
    function fallbackCopy() {
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
  }

  /** Build collection-shaped item for the card modal from a trade-side card entry. */
  function tradeModalItemFromSide(c) {
    if (!c || c.missing) return null;
    if (c.card) {
      return {
        public_id: c.public_id,
        obtained_at: c.obtained_at,
        evolution: c.evolution,
        card: c.card,
      };
    }
    return {
      public_id: c.public_id,
      obtained_at: c.obtained_at,
      evolution: c.evolution,
      card: {
        name: c.name,
        set_name: c.set_name,
        collector_number: c.collector_number,
        image_small_url: c.image_small_url,
        image_large_url: c.image_large_url,
      },
    };
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

  function updateEvoButton(item) {
    if (!els.modalEvoBtn) return;
    var evo = item && item.evolution;
    if (!evo || !evo.can_evolve || state.evoInFlight) {
      els.modalEvoBtn.disabled = true;
      if (state.evoInFlight) els.modalEvoBtn.textContent = "Evolving…";
      return;
    }
    var targets = evo.targets || [];
    var sel = state.evoSelectedTargetId;
    var picked = null;
    targets.forEach(function (t) {
      if (t.card_id === sel) picked = t;
    });
    if (!picked) {
      els.modalEvoBtn.disabled = true;
      els.modalEvoBtn.textContent = targets.length > 1 ? "Pick an evolution" : "Evolve";
      return;
    }
    els.modalEvoBtn.disabled = false;
    els.modalEvoBtn.textContent =
      picked.cost_pokedollars != null
        ? "Evolve for " + fmtPd(picked.cost_pokedollars)
        : "Evolve into " + (picked.name || "card");
  }

  function renderEvolutionUi(item, opts) {
    opts = opts || {};
    var readonly = !!opts.readonly;
    var evo = item && item.evolution;
    state.evoSelectedTargetId = null;
    if (els.modalEvoMsg) {
      els.modalEvoMsg.hidden = true;
      els.modalEvoMsg.textContent = "";
      els.modalEvoMsg.className = "modal-evolve-msg";
    }
    if (els.modalEvoDesc) {
      els.modalEvoDesc.textContent = readonly
        ? "Possible evolutions for this printing (view only)."
        : "Same catalog branches and costs as Discord /cevolve.";
    }
    if (!els.modalEvolveSection || !evo || !evo.targets || !evo.targets.length) {
      if (els.modalEvolveSection) els.modalEvolveSection.hidden = true;
      if (els.modalEvoActions) els.modalEvoActions.hidden = true;
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
        readonly: readonly,
        canEvolve: evo.can_evolve,
        selectedId: state.evoSelectedTargetId,
        fmtCost: fmtPd,
        onSelect: function (cardId) {
          state.evoSelectedTargetId = cardId;
          updateEvoButton(state.modalItem);
        },
      });
      if (!readonly && evo.can_evolve && evo.targets.length === 1) {
        state.evoSelectedTargetId = evo.targets[0].card_id;
        PokeponEvoFocus.syncSelection(els.modalEvoTargets, state.evoSelectedTargetId);
      }
    }
    if (els.modalEvoActions) {
      els.modalEvoActions.hidden = readonly || !evo.can_evolve;
    }
    if (els.modalEvoBtn) {
      els.modalEvoBtn.hidden = readonly || !evo.can_evolve;
      updateEvoButton(item);
    }
  }

  function refreshTradeModalDetail(item) {
    var pid = item && item.public_id;
    if (!pid || !state.authenticated || !state.modalAllowEvolve) return;
    apiFetch("/api/me/cards/" + encodeURIComponent(pid))
      .then(function (r) {
        if (r.status === 401) return null;
        if (!r.ok) return null;
        return r.json();
      })
      .then(function (detail) {
        if (!detail || detail.public_id !== pid) return;
        if (!els.modal || els.modal.hidden) return;
        state.modalItem = detail;
        applyModalCardFields(detail);
        renderEvolutionUi(detail, { readonly: false });
      })
      .catch(function () {});
  }

  function tradeChipThumbUrl(c) {
    if (!c || c.missing) return "";
    if (c.card && c.card.image_small_url) return c.card.image_small_url;
    return c.image_small_url || "";
  }

  function tradeChipLabel(c) {
    if (!c || c.missing) return "Missing";
    if (c.card && c.card.name) return c.card.name;
    return c.name || "Card";
  }

  function openTradeCardModal(item, opts) {
    if (!item || !els.modal) return;
    opts = opts || {};
    var allowEvolve = !!opts.allowEvolve;
    state.modalItem = item;
    state.modalAllowEvolve = allowEvolve;
    state.evoInFlight = false;
    state.evoSelectedTargetId = null;
    applyModalCardFields(item);
    renderEvolutionUi(item, { readonly: !allowEvolve });
    if (allowEvolve) refreshTradeModalDetail(item);
    els.modal.hidden = false;
    els.modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
  }

  function closeTradeCardModal() {
    if (!els.modal) return;
    if (window.PokeponEvoFocus) PokeponEvoFocus.close();
    state.modalItem = null;
    state.modalAllowEvolve = false;
    state.evoSelectedTargetId = null;
    state.evoInFlight = false;
    if (els.modalEvolveSection) els.modalEvolveSection.hidden = true;
    if (els.modalEvoActions) els.modalEvoActions.hidden = true;
    els.modal.hidden = true;
    els.modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
  }

  function commitEvolve() {
    var item = state.modalItem;
    var evo = item && item.evolution;
    if (!item || !evo || !evo.can_evolve || state.evoInFlight || !state.modalAllowEvolve) return;
    var targets = evo.targets || [];
    var picked = null;
    targets.forEach(function (t) {
      if (t.card_id === state.evoSelectedTargetId) picked = t;
    });
    if (!picked || picked.cost_pokedollars == null) return;
    var pid = item.public_id;
    state.evoInFlight = true;
    updateEvoButton(item);
    if (els.modalEvoMsg) els.modalEvoMsg.hidden = true;
    apiFetch("/api/me/cards/" + encodeURIComponent(pid) + "/evolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        target_card_id: picked.card_id,
        expected_cost: picked.cost_pokedollars,
      }),
    })
      .then(function (r) {
        return r.json().then(function (data) {
          return { ok: r.ok, status: r.status, data: data };
        });
      })
      .then(function (res) {
        state.evoInFlight = false;
        var d = res.data || {};
        if (res.ok && d.ok && d.card) {
          state.modalItem = d.card;
          applyModalCardFields(d.card);
          renderEvolutionUi(d.card, { readonly: false });
          if (els.modalEvoMsg) {
            els.modalEvoMsg.hidden = false;
            els.modalEvoMsg.className = "modal-evolve-msg is-ok";
            els.modalEvoMsg.textContent =
              "Evolved " +
              (d.before_name || "card") +
              " → " +
              (d.card_name || (d.card.card && d.card.card.name) || "card") +
              " for " +
              fmtPd(d.cost_pokedollars) +
              ". Balance: " +
              fmtPd(d.new_balance_pokedollars);
          }
          if (state.activeTrade && state.activeTrade.id) {
            loadTradeState(state.activeTrade.id);
          }
          return;
        }
        if (res.status === 409 && d.cost_pokedollars != null) {
          refreshTradeModalDetail(state.modalItem);
          if (els.modalEvoMsg) {
            els.modalEvoMsg.hidden = false;
            els.modalEvoMsg.className = "modal-evolve-msg is-error";
            els.modalEvoMsg.textContent =
              (d.message || "Cost updated.") + " New cost: " + fmtPd(d.cost_pokedollars);
          }
          return;
        }
        if (els.modalEvoMsg) {
          els.modalEvoMsg.hidden = false;
          els.modalEvoMsg.className = "modal-evolve-msg is-error";
          els.modalEvoMsg.textContent = plainDiscordMsg(
            d.reason || d.message || d.error || "Could not evolve."
          );
        }
        updateEvoButton(state.modalItem);
      })
      .catch(function () {
        state.evoInFlight = false;
        if (els.modalEvoMsg) {
          els.modalEvoMsg.hidden = false;
          els.modalEvoMsg.className = "modal-evolve-msg is-error";
          els.modalEvoMsg.textContent = "Network error — try again.";
        }
        updateEvoButton(state.modalItem);
      });
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
    if (els.inviteSection) els.inviteSection.hidden = true;
  }
  function showSignedIn(user) {
    if (!els.sidebarUser) return;
    els.sidebarUser.dataset.state = "signed-in";
    els.sidebarUser.querySelector(".sidebar-user-loading").hidden = true;
    els.sidebarUser.querySelector(".sidebar-user-signedout").hidden = true;
    els.sidebarUser.querySelector(".sidebar-user-signedin").hidden = false;
    els.userName.textContent = user.global_name || user.username || "Trainer";
    if (user.avatar_url) { els.userAvatar.src = user.avatar_url; els.userAvatar.alt = els.userName.textContent; }
    if (els.inviteSection) els.inviteSection.hidden = false;
  }
  function loginUrl() { return api("/auth/discord/login?return_to=" + encodeURIComponent(window.location.href)); }

  async function bootAuth() {
    showLoadingUser();
    try {
      var r = await apiFetch("/api/me");
      if (!r.ok) throw new Error();
      var j = await r.json();
      if (j && j.authenticated && j.user) {
        state.authenticated = true; state.me = j.user;
        showSignedIn(j.user);
      } else { showSignedOut(); }
    } catch (_) { showSignedOut(); }
    if (els.btnLogin) els.btnLogin.onclick = function () { window.location.href = loginUrl(); };
    if (els.btnLogout) els.btnLogout.onclick = async function () {
      await apiFetch("/auth/logout", { method: "POST" });
      state.authenticated = false; state.me = null; showSignedOut(); leaveRoom(); loadList();
    };
  }

  function userLabel(u) {
    if (!u) return "Unknown";
    return u.global_name || u.username || u.id;
  }

  // ---- Trade list ----
  async function loadList() {
    if (!state.authenticated) return;
    try {
      var r = await apiFetch("/api/me/trades");
      if (!r.ok) throw new Error((await r.json()).error || "load failed");
      var j = await r.json();
      var trades = j.trades || [];
      els.tradeList.innerHTML = "";
      if (!trades.length) { els.listEmpty.hidden = false; return; }
      els.listEmpty.hidden = true;
      trades.forEach(function (t) {
        var isInvitedToMe = t.status === "invited" && t.viewer_role === "partner";
        var isMySentInvite = t.status === "invited" && t.viewer_role === "initiator";
        var other = t.viewer_role === "initiator" ? t.partner : t.initiator;

        var el = document.createElement("div");
        el.className = "trade-list-item";

        var info = document.createElement("div");
        info.className = "trade-list-info";
        var userRow = document.createElement("div");
        userRow.className = "trade-list-user";
        userRow.appendChild(buildUserChip(other, "pokepon-user-chip--sm"));
        info.appendChild(userRow);
        var label = "";
        if (isInvitedToMe) label = "Trade invite";
        else if (isMySentInvite) label = "Invite sent (waiting)";
        else label = "Active trade";
        var statusLine = document.createElement("div");
        statusLine.className = "trade-muted";
        statusLine.textContent = label + " · Status: " + t.status;
        info.appendChild(statusLine);
        el.appendChild(info);

        var actions = document.createElement("div");
        actions.className = "trade-list-actions";

        if (isInvitedToMe) {
          var accBtn = document.createElement("button");
          accBtn.className = "btn btn-primary";
          accBtn.textContent = "Accept";
          accBtn.onclick = function () { acceptInvite(t.id); };
          actions.appendChild(accBtn);
          var decBtn = document.createElement("button");
          decBtn.className = "btn btn-ghost";
          decBtn.textContent = "Decline";
          decBtn.onclick = function () { declineInvite(t.id); };
          actions.appendChild(decBtn);
        } else if (t.status === "active") {
          var openBtn = document.createElement("button");
          openBtn.className = "btn btn-primary";
          openBtn.textContent = "Open";
          openBtn.onclick = function () { enterRoom(t.id); };
          actions.appendChild(openBtn);
        }

        var cancelBtn = document.createElement("button");
        cancelBtn.className = "btn btn-ghost";
        cancelBtn.textContent = "Cancel";
        cancelBtn.onclick = function () { cancelTrade(t.id); };
        actions.appendChild(cancelBtn);

        el.appendChild(actions);
        els.tradeList.appendChild(el);
      });
    } catch (e) {
      if (els.listError) { els.listError.hidden = false; els.listError.textContent = String(e.message || e); }
    }
  }

  async function sendInvite() {
    if (els.inviteMsg) els.inviteMsg.innerHTML = "";
    var val = (els.inviteInput.value || "").trim();
    if (!val) return;
    var body;
    if (state.selectedPartnerId) {
      body = { partner_id: String(state.selectedPartnerId) };
    } else if (/^\d+$/.test(val)) {
      body = { partner_id: val };
    } else {
      body = { partner_username: val };
    }
    try {
      var r = await apiFetch("/api/me/trades", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      var j = await r.json();
      if (!r.ok) throw new Error(j.message || j.error || "Failed");
      if (els.inviteMsg) els.inviteMsg.innerHTML = '<div class="trade-msg-ok">Invite sent!</div>';
      els.inviteInput.value = "";
      state.selectedPartnerId = null;
      clearInviteSuggestions();
      loadList();
    } catch (e) {
      if (els.inviteMsg) els.inviteMsg.innerHTML = '<div class="trade-msg-err">' + String(e.message || e) + "</div>";
    }
  }

  function clearInviteSuggestions() {
    if (!els.inviteSuggestions) return;
    els.inviteSuggestions.innerHTML = "";
    els.inviteSuggestions.hidden = true;
  }

  function selectPartnerFromSuggestion(u) {
    state.selectedPartnerId = u.id;
    var handle = u.username || "";
    var disp = u.global_name || u.display_name || "";
    els.inviteInput.value = disp ? disp + " (@" + handle + ")" : "@" + handle;
    clearInviteSuggestions();
  }

  function inviteSearchQuery() {
    var v = (els.inviteInput && els.inviteInput.value || "").trim();
    return v.replace(/^@+/, "").trim();
  }

  function inviteCacheGet(raw) {
    var key = raw.toLowerCase();
    var hit = state.inviteSearchCache[key];
    if (!hit) return null;
    if (Date.now() - hit.ts > 60000) {
      delete state.inviteSearchCache[key];
      return null;
    }
    return hit.users;
  }

  function inviteCacheSet(raw, users) {
    state.inviteSearchCache[raw.toLowerCase()] = { users: users, ts: Date.now() };
  }

  function showInviteSearching() {
    if (!els.inviteSuggestions) return;
    els.inviteSuggestions.innerHTML = '<div class="invite-suggestion-hint">Searching…</div>';
    els.inviteSuggestions.hidden = false;
  }

  function renderInviteSuggestions(users) {
    if (!els.inviteSuggestions) return;
    els.inviteSuggestions.innerHTML = "";
    if (!users.length) {
      var empty = document.createElement("div");
      empty.className = "invite-suggestion-hint";
      empty.textContent = "No users in your shared servers match that prefix.";
      els.inviteSuggestions.appendChild(empty);
      els.inviteSuggestions.hidden = false;
      return;
    }
    users.forEach(function (u) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "invite-suggestion";
      btn.setAttribute("role", "option");
      if (u.avatar_url) {
        var img = document.createElement("img");
        img.className = "invite-suggestion-avatar";
        img.src = u.avatar_url;
        img.alt = "";
        btn.appendChild(img);
      } else {
        var ph = document.createElement("span");
        ph.className = "invite-suggestion-avatar";
        ph.setAttribute("aria-hidden", "true");
        btn.appendChild(ph);
      }
      var meta = document.createElement("span");
      meta.className = "invite-suggestion-meta";
      var handle = document.createElement("span");
      handle.className = "invite-suggestion-handle";
      handle.textContent = "@" + (u.username || "?");
      meta.appendChild(handle);
      var gn = u.global_name || u.display_name || "";
      if (gn) {
        var disp = document.createElement("span");
        disp.className = "invite-suggestion-display";
        disp.textContent = gn;
        meta.appendChild(disp);
      }
      btn.appendChild(meta);
      btn.onclick = function () { selectPartnerFromSuggestion(u); };
      els.inviteSuggestions.appendChild(btn);
    });
    els.inviteSuggestions.hidden = false;
  }

  function scheduleInviteUserSearch() {
    clearTimeout(state.inviteSearchDebounce);
    state.selectedPartnerId = null;
    var raw = inviteSearchQuery();
    if (!els.inviteSuggestions) return;
    if (/^\d+$/.test(raw) || !raw) {
      clearInviteSuggestions();
      return;
    }
    var cached = inviteCacheGet(raw);
    if (cached) {
      renderInviteSuggestions(cached);
    } else {
      showInviteSearching();
    }
    state.inviteSearchDebounce = setTimeout(fetchInviteUserSuggestions, cached ? 120 : 35);
  }

  async function fetchInviteUserSuggestions() {
    if (!els.inviteSuggestions || !state.authenticated) return;
    var raw = inviteSearchQuery();
    if (/^\d+$/.test(raw) || !raw) {
      clearInviteSuggestions();
      return;
    }
    if (state.inviteSearchInflight) state.inviteSearchInflight.abort();
    var ctrl = new AbortController();
    state.inviteSearchInflight = ctrl;
    try {
      var r = await apiFetch(
        "/api/me/trade-user-search?q=" + encodeURIComponent(raw) + "&limit=12",
        { signal: ctrl.signal }
      );
      state.inviteSearchInflight = null;
      if (!r.ok) {
        clearInviteSuggestions();
        return;
      }
      var j = await r.json();
      if (inviteSearchQuery() !== raw) {
        return;
      }
      var users = j.users || [];
      inviteCacheSet(raw, users);
      renderInviteSuggestions(users);
    } catch (e) {
      state.inviteSearchInflight = null;
      if (e.name === "AbortError") return;
      clearInviteSuggestions();
    }
  }

  async function acceptInvite(id) {
    try {
      var r = await apiFetch("/api/me/trades/" + id + "/accept", { method: "POST" });
      var j = await r.json();
      if (!r.ok) throw new Error(j.message || j.error);
      await loadList();
      enterRoom(id);
    } catch (e) { alert(e.message || e); }
  }

  async function declineInvite(id) {
    try {
      var r = await apiFetch("/api/me/trades/" + id + "/decline", { method: "POST" });
      if (!r.ok) { var j = await r.json(); throw new Error(j.message || j.error); }
      loadList();
    } catch (e) { alert(e.message || e); }
  }

  async function cancelTrade(id) {
    try {
      var r = await apiFetch("/api/me/trades/" + id + "/cancel", { method: "POST" });
      if (!r.ok) { var j = await r.json(); throw new Error(j.message || j.error); }
      if (state.activeTrade && state.activeTrade.id === id) leaveRoom();
      loadList();
    } catch (e) { alert(e.message || e); }
  }

  // ---- Trade room ----
  async function enterRoom(id) {
    document.body.classList.add("trade-room-active");
    els.listSection.hidden = true;
    els.inviteSection.hidden = true;
    els.room.hidden = false;
    state.selectedCardIds = [];
    await loadTradeState(id);
    await loadMyCollection();
    connectTradeWs(id);
    startPolling(id);
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

  function updateTradeLiveHint() {
    if (!els.tradeLiveHint) return;
    if (!state.activeTrade || state.activeTrade.status !== "active") {
      els.tradeLiveHint.hidden = true;
      return;
    }
    els.tradeLiveHint.hidden = false;
    if (state.tradeWsConnected) {
      els.tradeLiveHint.textContent = "Live updates on — changes appear without refreshing.";
      els.tradeLiveHint.classList.add("is-live");
    } else {
      els.tradeLiveHint.textContent = "Reconnecting… (backup sync every few seconds)";
      els.tradeLiveHint.classList.remove("is-live");
    }
  }

  function wsUrlForTrade(tradeId) {
    var base = API_BASE || "";
    if (/^https:/i.test(base)) base = base.replace(/^https:/i, "wss:");
    else if (/^http:/i.test(base)) base = base.replace(/^http:/i, "ws:");
    var url = base + "/ws/trades/" + encodeURIComponent(String(tradeId));
    var tok = readSessionToken();
    if (tok) url += (url.indexOf("?") >= 0 ? "&" : "?") + "session=" + encodeURIComponent(tok);
    return url;
  }

  function disconnectTradeWs() {
    if (state.tradeWs) {
      try {
        state.tradeWs.onopen = null;
        state.tradeWs.onmessage = null;
        state.tradeWs.onerror = null;
        state.tradeWs.onclose = null;
        state.tradeWs.close();
      } catch (_) {}
    }
    state.tradeWs = null;
    state.tradeWsConnected = false;
    updateTradeLiveHint();
  }

  function connectTradeWs(tradeId) {
    disconnectTradeWs();
    var ws = new WebSocket(wsUrlForTrade(tradeId));
    state.tradeWs = ws;
    ws.onopen = function () {
      state.tradeWsConnected = true;
      updateTradeLiveHint();
      if (state.activeTrade && state.activeTrade.id) {
        startPolling(state.activeTrade.id);
      }
    };
    ws.onmessage = function (ev) {
      var msg;
      try {
        msg = JSON.parse(ev.data);
      } catch (_) {
        return;
      }
      if (msg && msg.type === "trade" && msg.trade) {
        applyTradePayload(msg.trade);
      }
    };
    ws.onclose = function () {
      state.tradeWsConnected = false;
      updateTradeLiveHint();
    };
    ws.onerror = function () {
      state.tradeWsConnected = false;
      updateTradeLiveHint();
    };
  }

  function applyTradePayload(t) {
    if (!t) return;
    state.activeTrade = t;

    if (t.status === "completed") {
      stopPolling();
      disconnectTradeWs();
      if (els.roomMsg) {
        els.roomMsg.innerHTML =
          '<div class="trade-msg-ok" style="font-size:1.1rem;font-weight:600">Trade completed! Check your collection.</div>';
      }
      els.btnReady.hidden = true;
      els.btnCancelTrade.hidden = true;
      updateTradeLiveHint();
      return;
    }
    if (t.status !== "active") {
      stopPolling();
      disconnectTradeWs();
      if (els.roomMsg) {
        els.roomMsg.innerHTML =
          '<div class="trade-msg-err">Trade is no longer active (' + t.status + ").</div>";
      }
      els.btnReady.hidden = true;
      els.btnCancelTrade.hidden = true;
      updateTradeLiveHint();
      return;
    }

    var other = t.viewer_role === "initiator" ? t.partner : t.initiator;
    if (els.roomTitle) els.roomTitle.textContent = "Trade room";
    if (els.roomPartner) {
      els.roomPartner.innerHTML = "";
      els.roomPartner.appendChild(buildUserChip(other));
    }

    var mySide = t.viewer_role === "initiator" ? t.initiator_side : t.partner_side;
    var theirSide = t.viewer_role === "initiator" ? t.partner_side : t.initiator_side;

    renderSideCards(els.sideMineCards, mySide.cards, true);
    renderSideCards(els.sideTheirsCards, theirSide.cards, false);

    state.selectedCardIds = mySide.cards.map(function (c) {
      return c.instance_id;
    });

    syncCurrencyInputsFromServer(mySide);
    if (t.viewer_balance) renderViewerBalance(t.viewer_balance);
    els.theirPd.textContent = fmtPd(theirSide.pokedollars);
    els.theirCr.textContent = fmtCr(theirSide.crystals);

    var myReady = mySide.ready;
    els.btnReady.textContent = myReady ? "Unready" : "Ready";
    els.btnReady.classList.toggle("is-ready", myReady);
    els.btnReady.hidden = false;
    els.btnCancelTrade.hidden = false;

    if (theirSide.ready) {
      els.theirReadyStatus.innerHTML = '<span class="trade-ready-badge is-ready">Ready</span>';
    } else {
      els.theirReadyStatus.innerHTML = '<span class="trade-ready-badge not-ready">Not ready</span>';
    }

    renderPicker();
    updateTradeLiveHint();
  }

  function leaveRoom() {
    document.body.classList.remove("trade-room-active");
    disconnectTradeWs();
    stopPolling();
    clearCurrencySaveTimer();
    state.currencyDirty = false;
    state.activeTrade = null;
    state.selectedCardIds = [];
    if (els.myBalanceHint) els.myBalanceHint.hidden = true;
    els.room.hidden = true;
    els.listSection.hidden = false;
    if (state.authenticated && els.inviteSection) els.inviteSection.hidden = false;
    loadList();
  }

  function startPolling(id) {
    stopPolling();
    function tick() {
      loadTradeState(id);
    }
    tick();
    state.pollTimer = setInterval(tick, state.tradeWsConnected ? 15000 : 3000);
  }

  function stopPolling() {
    if (state.pollTimer) { clearInterval(state.pollTimer); state.pollTimer = null; }
  }

  async function loadTradeState(id) {
    try {
      var r = await apiFetch("/api/me/trades/" + id);
      if (!r.ok) {
        var j = await r.json();
        throw new Error(j.message || j.error || "not found");
      }
      var t = await r.json();
      applyTradePayload(t);
    } catch (e) {
      if (els.roomMsg) {
        els.roomMsg.innerHTML =
          '<div class="trade-msg-err">' + String(e.message || e) + "</div>";
      }
    }
  }

  function renderSideCards(container, cards, removable) {
    container.innerHTML = "";
    if (!cards || !cards.length) {
      container.innerHTML = '<span class="trade-muted">No cards added yet</span>';
      return;
    }
    cards.forEach(function (c) {
      if (c.missing) {
        var miss = document.createElement("div");
        miss.className = "trade-card-chip trade-card-chip-missing";
        miss.textContent = "Missing instance #" + c.instance_id;
        container.appendChild(miss);
        return;
      }
      var row = document.createElement("div");
      row.className = "trade-card-chip";
      var hit = document.createElement("button");
      hit.type = "button";
      hit.className = "trade-card-chip-hit";
      var thumb = tradeChipThumbUrl(c);
      if (thumb) {
        var img = document.createElement("img");
        img.src = thumb;
        img.alt = "";
        hit.appendChild(img);
      }
      var sp = document.createElement("span");
      sp.textContent = tradeChipLabel(c);
      hit.appendChild(sp);
      if (c.grade != null) {
        var gradeBadge = document.createElement("span");
        gradeBadge.className = "card-tile-grade trade-card-grade";
        gradeBadge.textContent = String(c.grade);
        gradeBadge.title = c.grade_label || "Graded";
        row.appendChild(gradeBadge);
      }
      var modalItem = tradeModalItemFromSide(c);
      hit.onclick = function () {
        if (modalItem) openTradeCardModal(modalItem, { allowEvolve: removable });
      };
      row.appendChild(hit);
      if (removable) {
        var rm = document.createElement("button");
        rm.type = "button";
        rm.className = "remove-card";
        rm.setAttribute("aria-label", "Remove card from offer");
        rm.textContent = "×";
        rm.onclick = function (ev) {
          ev.stopPropagation();
          removeCard(c.instance_id);
        };
        row.appendChild(rm);
      }
      container.appendChild(row);
    });
  }

  async function removeCard(instanceId) {
    state.selectedCardIds = state.selectedCardIds.filter(function (id) { return id !== instanceId; });
    await saveSide();
  }

  async function addCard(instanceId) {
    if (state.selectedCardIds.indexOf(instanceId) >= 0) return;
    state.selectedCardIds.push(instanceId);
    await saveSide();
  }

  async function saveSide() {
    if (!state.activeTrade) return;
    clearCurrencySaveTimer();
    var pd = parseCurrencyInput(els.myPd);
    var cr = parseCurrencyInput(els.myCr);
    try {
      var r = await apiFetch("/api/me/trades/" + state.activeTrade.id + "/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ card_ids: state.selectedCardIds, pokedollars: pd, crystals: cr }),
      });
      var j = await r.json();
      if (!r.ok) throw new Error(j.message || j.error);
      state.currencyDirty = false;
      await loadTradeState(state.activeTrade.id);
    } catch (e) {
      if (els.roomMsg) els.roomMsg.innerHTML = '<div class="trade-msg-err">' + String(e.message || e) + "</div>";
    }
  }

  async function toggleReady() {
    if (!state.activeTrade) return;
    if (els.roomMsg) els.roomMsg.innerHTML = "";
    try {
      var r = await apiFetch("/api/me/trades/" + state.activeTrade.id + "/ready", { method: "POST" });
      var j = await r.json();
      if (!r.ok) throw new Error(j.message || j.error);
      await loadTradeState(state.activeTrade.id);
    } catch (e) {
      if (els.roomMsg) els.roomMsg.innerHTML = '<div class="trade-msg-err">' + String(e.message || e) + "</div>";
    }
  }

  // ---- Card picker (server-side search, same as collection page) ----
  var PICKER_PAGE_SIZE = 60;

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

  async function loadMyCollection() {
    if (state.pickerInflight) { state.pickerInflight.abort(); }
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
      state.myCards = (j.items || []).map(function (c) {
        return {
          instance_id: c.instance_id,
          public_id: c.public_id,
          name: c.card ? c.card.name : "Card",
          set_info: c.card ? ((c.card.set_name || "") + " #" + (c.card.collector_number || "")) : "",
          image_small_url: c.card ? c.card.image_small_url : null,
          is_favorite: !!c.is_favorite,
          blocked_reason: c.sell && c.sell.blocked_reason ? c.sell.blocked_reason : null,
          craft_role: c.craft_role,
          card: c.card,
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
    var value = (els.pickerSearch.value || "").trim();
    clearTimeout(state.pickerDebounce);
    state.pickerDebounce = setTimeout(function () {
      if (value === state.pickerQuery) return;
      state.pickerQuery = value.toLowerCase();
      state.pickerPage = 1;
      loadMyCollection();
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
      set_info: c.card
        ? (c.card.set_name || "") + " #" + (c.card.collector_number || "")
        : "",
      image_small_url: c.card ? c.card.image_small_url : null,
      is_favorite: !!c.is_favorite,
      blocked_reason: c.sell && c.sell.blocked_reason ? c.sell.blocked_reason : null,
    };
  }

  function appendPickerCard(parent, c) {
    var el = document.createElement("div");
    el.className = "picker-card";
    if (state.selectedCardIds.indexOf(c.instance_id) >= 0) el.classList.add("is-selected");
    if (c.is_favorite) el.classList.add("is-favorite");
    var img = c.image_small_url ? '<img src="' + c.image_small_url + '" alt="" loading="lazy" />' : "";
    var favMark = c.is_favorite ? '<span class="picker-fav" title="Favorited">⭐</span>' : "";
    el.innerHTML = img + "<div>" + (c.name || "Card") + favMark + "</div>";
    el.onclick = function () {
      if (c.is_favorite) return;
      if (state.selectedCardIds.indexOf(c.instance_id) >= 0) {
        removeCard(c.instance_id);
      } else {
        addCard(c.instance_id);
      }
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
    if (!state.myCards.length) {
      if (state.pickerFavoritedOnly) {
        if (!pickerHasEvoSections()) {
          els.pickerResults.innerHTML =
            '<div class="trade-muted">' +
            (state.pickerQuery
              ? 'No favorited copies match "' + state.pickerQuery + '"'
              : "You have no favorited copies.") +
            "</div>";
        }
      } else if (state.pickerQuery) {
        if (!pickerHasEvoSections()) {
          els.pickerResults.innerHTML =
            '<div class="trade-muted">No cards match "' + state.pickerQuery + '"</div>';
        }
      }
      renderPickerEvoSections();
      return;
    }
    var visible = filterPickerRowsForCraftChip(state.myCards);
    visible.forEach(function (c) {
      appendPickerCard(els.pickerResults, c);
    });
    if (!visible.length && state.myCards.length) {
      els.pickerResults.innerHTML =
        '<div class="trade-muted">No cards match the selected type filter on this page.</div>';
    }
    var totalPages = Math.max(1, Math.ceil(state.pickerTotal / PICKER_PAGE_SIZE));
    if (totalPages > 1) {
      var nav = document.createElement("div");
      nav.className = "picker-pager";
      var prev = document.createElement("button");
      prev.type = "button";
      prev.className = "btn-small";
      prev.textContent = "← Prev";
      prev.disabled = state.pickerPage <= 1;
      prev.onclick = function () { if (state.pickerPage > 1) { state.pickerPage--; loadMyCollection(); } };
      var info = document.createElement("span");
      info.className = "trade-muted";
      info.textContent = " Page " + state.pickerPage + " of " + totalPages + " ";
      var next = document.createElement("button");
      next.type = "button";
      next.className = "btn-small";
      next.textContent = "Next →";
      next.disabled = state.pickerPage >= totalPages;
      next.onclick = function () { if (state.pickerPage < totalPages) { state.pickerPage++; loadMyCollection(); } };
      nav.appendChild(prev);
      nav.appendChild(info);
      nav.appendChild(next);
      els.pickerResults.appendChild(nav);
    }
    renderPickerEvoSections();
  }

  // ---- Init ----
  function init() {
    if (window.PokeponEvoFocus) {
      PokeponEvoFocus.mount({ fmtCost: fmtPd, rarityClassFor: rarityClassFor });
    }
    if (els.btnInvite) els.btnInvite.addEventListener("click", sendInvite);
    if (els.inviteInput) {
      els.inviteInput.addEventListener("input", scheduleInviteUserSearch);
      els.inviteInput.addEventListener("paste", function () {
        setTimeout(scheduleInviteUserSearch, 0);
      });
      els.inviteInput.addEventListener("keydown", function (e) { if (e.key === "Enter") sendInvite(); });
    }
    document.addEventListener("click", function (e) {
      if (!els.inviteSuggestions || els.inviteSuggestions.hidden) return;
      var wrap = document.querySelector(".trade-field-invite");
      if (wrap && !wrap.contains(e.target)) clearInviteSuggestions();
    });
    if (els.btnReady) els.btnReady.addEventListener("click", toggleReady);
    if (els.btnCancelTrade) els.btnCancelTrade.addEventListener("click", function () {
      if (state.activeTrade) cancelTrade(state.activeTrade.id);
    });
    if (els.btnLeaveTrade) {
      els.btnLeaveTrade.addEventListener("click", function () {
        if (state.activeTrade) leaveRoom();
      });
    }
    if (els.btnSaveSide) els.btnSaveSide.addEventListener("click", saveSide);
    function onCurrencyBlur() {
      if (
        parseCurrencyInput(els.myPd) === state.serverPd &&
        parseCurrencyInput(els.myCr) === state.serverCr
      ) {
        state.currencyDirty = false;
      }
    }
    if (els.myPd) {
      els.myPd.addEventListener("input", scheduleCurrencySave);
      els.myPd.addEventListener("focus", function () { state.currencyDirty = true; });
      els.myPd.addEventListener("blur", onCurrencyBlur);
    }
    if (els.myCr) {
      els.myCr.addEventListener("input", scheduleCurrencySave);
      els.myCr.addEventListener("focus", function () { state.currencyDirty = true; });
      els.myCr.addEventListener("blur", onCurrencyBlur);
    }
    if (els.pickerSearch) els.pickerSearch.addEventListener("input", pickerSearchChanged);
    if (els.pickerFilterFavorited) {
      els.pickerFilterFavorited.addEventListener("click", function () {
        state.pickerFavoritedOnly = !state.pickerFavoritedOnly;
        var on = state.pickerFavoritedOnly;
        els.pickerFilterFavorited.classList.toggle("is-active", on);
        els.pickerFilterFavorited.setAttribute("aria-pressed", on ? "true" : "false");
        state.pickerPage = 1;
        loadMyCollection();
      });
    }
    if (els.pickerFilterEvolvable) {
      els.pickerFilterEvolvable.addEventListener("click", function () {
        state.pickerEvolvable = !state.pickerEvolvable;
        if (state.pickerEvolvable) state.pickerNonEvolvable = false;
        syncPickerEvolvableChips();
        state.pickerPage = 1;
        loadMyCollection();
      });
    }
    if (els.pickerFilterNonEvolvable) {
      els.pickerFilterNonEvolvable.addEventListener("click", function () {
        state.pickerNonEvolvable = !state.pickerNonEvolvable;
        if (state.pickerNonEvolvable) state.pickerEvolvable = false;
        syncPickerEvolvableChips();
        state.pickerPage = 1;
        loadMyCollection();
      });
    }
    if (els.pickerFilterDuplicates) {
      els.pickerFilterDuplicates.addEventListener("click", function () {
        state.pickerDuplicates = !state.pickerDuplicates;
        var on = state.pickerDuplicates;
        els.pickerFilterDuplicates.classList.toggle("is-active", on);
        els.pickerFilterDuplicates.setAttribute("aria-pressed", on ? "true" : "false");
        state.pickerPage = 1;
        loadMyCollection();
      });
    }
    var pickerCraftChips = Array.prototype.slice.call(
      document.querySelectorAll(".chip[data-picker-craft-role]")
    );
    pickerCraftChips.forEach(function (chip) {
      chip.addEventListener("click", function () {
        var role = chip.getAttribute("data-picker-craft-role") || "";
        state.pickerCraftRole = role;
        pickerCraftChips.forEach(function (c) {
          var on = (c.getAttribute("data-picker-craft-role") || "") === role;
          c.classList.toggle("is-active", on);
          c.setAttribute("aria-pressed", on ? "true" : "false");
        });
        state.pickerPage = 1;
        loadMyCollection();
      });
    });

    document.addEventListener("click", function (e) {
      var t = e.target;
      if (t && t.dataset && t.dataset.close !== undefined) closeTradeCardModal();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      var evoModal = document.getElementById("evo-focus-modal");
      if (evoModal && !evoModal.hidden) return;
      if (els.modal && !els.modal.hidden) closeTradeCardModal();
    });
    if (els.modalCopyId && els.modalPid) {
      els.modalCopyId.addEventListener("click", function () {
        copyCardId(els.modalPid.textContent, els.modalCopyId);
      });
    }
    if (els.modalEvoBtn) {
      els.modalEvoBtn.addEventListener("click", function () {
        commitEvolve();
      });
    }

    captureSessionFromFragment();
    bootAuth().then(function () {
      return loadList().then(function () {
        return openTradeFromQuery();
      });
    }).then(function () {
      state.listTimer = setInterval(loadList, 10000);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
