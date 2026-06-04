(function () {
  "use strict";

  var API_BASE = (window.POKEPON_API_BASE || "").replace(/\/+$/, "");
  var SESSION_KEY = "pokepon-session";

  function api(path) {
    return API_BASE + path;
  }

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

  function clearSessionToken() {
    try {
      localStorage.removeItem(SESSION_KEY);
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
    options.headers = Object.assign({}, apiHeaders(), options.headers || {});
    return fetch(api(path), options);
  }

  var els = {
    sidebarUser: document.getElementById("sidebar-user"),
    btnLogin: document.getElementById("btn-login"),
    btnLoginMain: document.getElementById("btn-login-main"),
    btnLogout: document.getElementById("btn-logout"),
    userAvatar: document.getElementById("user-avatar"),
    userName: document.getElementById("user-name"),
    settingsGate: document.getElementById("settings-gate"),
    settingsPanel: document.getElementById("settings-panel"),
    accountAvatar: document.getElementById("account-avatar"),
    accountDisplayName: document.getElementById("account-display-name"),
    accountUsername: document.getElementById("account-username"),
    accountId: document.getElementById("account-id"),
    tabButtons: document.querySelectorAll(".settings-tab"),
    tabPanels: document.querySelectorAll(".settings-tab-panel"),
    referralsLoading: document.getElementById("referrals-loading"),
    referralsContent: document.getElementById("referrals-content"),
    referralsRules: document.getElementById("referrals-rules"),
    referralsStats: document.getElementById("referrals-stats"),
    referralsEmpty: document.getElementById("referrals-empty"),
    referralList: document.getElementById("referral-list"),
    referralsError: document.getElementById("referrals-error"),
    notifyForm: document.getElementById("notify-form"),
    notifyTrades: document.getElementById("notify-trades"),
    notifyAuctions: document.getElementById("notify-auctions"),
    notifyReferrals: document.getElementById("notify-referrals"),
    notifyMissions: document.getElementById("notify-missions"),
    notifyWishlistMarket: document.getElementById("notify-wishlist-market"),
    wishlistMaxPokedollars: document.getElementById("wishlist-max-pokedollars"),
    wishlistMaxCrystals: document.getElementById("wishlist-max-crystals"),
    notifySaveMsg: document.getElementById("notify-save-msg"),
    inviteLinkInput: document.getElementById("invite-link-input"),
    btnCopyInvite: document.getElementById("btn-copy-invite"),
    btnOpenInvite: document.getElementById("btn-open-invite"),
    inviteCopyMsg: document.getElementById("invite-copy-msg"),
    inviteHint: document.getElementById("invite-hint"),
    cosmeticsFrameGrid: document.getElementById("cosmetics-frame-grid"),
    cosmeticsFrameMsg: document.getElementById("cosmetics-frame-msg"),
  };

  var state = {
    user: null,
    referralsLoaded: false,
    settingsLoaded: false,
    cosmeticsCatalog: null,
    cosmeticsSettings: null,
  };

  function displayName(user) {
    return user.global_name || user.username || "Discord user";
  }

  function loginUrl() {
    return api("/auth/discord/login?return_to=" + encodeURIComponent(window.location.href));
  }

  function setSidebarState(which) {
    if (!els.sidebarUser) return;
    els.sidebarUser.setAttribute("data-state", which);
  }

  function showSignedOut() {
    setSidebarState("signed-out");
    if (els.settingsGate) els.settingsGate.hidden = false;
    if (els.settingsPanel) els.settingsPanel.hidden = true;
  }

  function showSignedIn(user) {
    state.user = user;
    setSidebarState("signed-in");
    var name = displayName(user);
    if (els.userName) els.userName.textContent = name;
    if (els.userAvatar && user.avatar_url) {
      els.userAvatar.src = user.avatar_url;
      els.userAvatar.alt = name;
    }
    if (els.accountDisplayName) els.accountDisplayName.textContent = name;
    if (els.accountUsername) {
      els.accountUsername.textContent = user.username ? "@" + user.username : "";
    }
    if (els.accountId) els.accountId.textContent = "ID " + user.id;
    if (els.accountAvatar && user.avatar_url) {
      els.accountAvatar.src = user.avatar_url;
      els.accountAvatar.alt = name;
    }
    if (els.settingsGate) els.settingsGate.hidden = true;
    if (els.settingsPanel) els.settingsPanel.hidden = false;
    if (state.cosmeticsCatalog) renderCosmeticsFrames();
  }

  function switchTab(tabId) {
    els.tabButtons.forEach(function (btn) {
      var on = btn.getAttribute("data-tab") === tabId;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
    els.tabPanels.forEach(function (panel) {
      var on = panel.id === "tab-" + tabId;
      panel.classList.toggle("is-active", on);
      panel.hidden = !on;
    });
    if (tabId === "referrals" && !state.referralsLoaded) {
      loadReferrals();
    }
    if (tabId === "cosmetics" && !state.cosmeticsCatalog) {
      loadCosmetics();
    }
    if (tabId === "notifications" && !state.settingsLoaded) {
      loadSettings();
    }
    if (window.location.hash !== "#" + tabId) {
      window.history.replaceState(null, "", "#" + tabId);
    }
  }

  function tabFromHash() {
    var h = (window.location.hash || "").replace(/^#/, "");
    if (
      h === "referrals" ||
      h === "notifications" ||
      h === "account" ||
      h === "cosmetics"
    ) {
      return h;
    }
    return "account";
  }

  function defaultAvatarUrl() {
    return (
      "data:image/svg+xml," +
      encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect fill="#1e293b" width="64" height="64"/><circle cx="32" cy="24" r="12" fill="#64748b"/><path fill="#64748b" d="M8 58c4-14 16-20 24-20s20 6 24 20z"/></svg>'
      )
    );
  }

  function previewAvatarUrl() {
    return (state.user && state.user.avatar_url) || defaultAvatarUrl();
  }

  var FRAME_GROUP_LABELS = {
    metal: "Metal",
    gem: "Gem",
    effect: "Effects",
  };

  function frameLabelById(frameId, frames) {
    var found = (frames || []).find(function (f) {
      return f.id === frameId;
    });
    return found ? found.label : frameId;
  }

  function statusLabel(status) {
    if (status === "rewarded") return { text: "Rewarded", cls: "referral-badge--rewarded" };
    if (status === "completed") return { text: "Complete", cls: "referral-badge--done" };
    return { text: "In progress", cls: "referral-badge--progress" };
  }

  function renderReferrals(data) {
    if (!els.referralsContent) return;
    els.referralsLoading.hidden = true;
    els.referralsContent.hidden = false;
    els.referralsError.hidden = true;

    var rules = data.rules || {};
    if (els.referralsRules) {
      els.referralsRules.textContent =
        rules.how_it_works ||
        "Invite friends to your Discord server; when they play, you earn Crystals.";
    }

    var s = data.summary || {};
    if (els.referralsStats) {
      els.referralsStats.innerHTML =
        statCard(s.total_invited, "Invited") +
        statCard(s.in_progress, "In progress") +
        statCard(s.rewards_earned + " / " + s.rewards_cap, "Rewards earned") +
        statCard(s.rewards_remaining, "Rewards left");
    }

    updateInviteCard(data.personal_invite_url);

    var list = data.referrals || [];
    if (els.referralsEmpty) els.referralsEmpty.hidden = list.length > 0;
    if (!els.referralList) return;
    els.referralList.innerHTML = "";
    list.forEach(function (row) {
      els.referralList.appendChild(renderReferralRow(row, rules.cd_uses_required || 10));
    });
    state.referralsLoaded = true;
  }

  function updateInviteCard(url) {
    if (url && els.inviteLinkInput) {
      els.inviteLinkInput.value = url;
      if (els.btnOpenInvite) els.btnOpenInvite.href = url;
      if (els.inviteHint) {
        els.inviteHint.hidden = false;
        els.inviteHint.textContent =
          "This link is yours — friends who join with it count as your referrals automatically.";
      }
    } else if (els.inviteHint) {
      els.inviteHint.hidden = false;
      els.inviteHint.textContent =
        "Your personal invite is not available right now. The link below works for everyone, but referrals can only be attributed when you use your own link.";
    }
  }

  function statCard(value, label) {
    return (
      '<div class="settings-stat"><strong>' +
      escapeHtml(String(value != null ? value : "—")) +
      "</strong><span>" +
      escapeHtml(label) +
      "</span></div>"
    );
  }

  function escapeHtml(s) {
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderReferralRow(row, required) {
    var li = document.createElement("li");
    li.className = "referral-row";
    var inv = row.invitee || {};
    var name = row.display_name || "User";
    var uses = row.cd_uses || 0;
    var pct = Math.min(100, Math.round((uses / required) * 100));
    var badge = statusLabel(row.status);
    var avatar = inv.avatar_url
      ? '<img class="referral-row-avatar" src="' +
        escapeHtml(inv.avatar_url) +
        '" alt="" />'
      : '<div class="referral-row-avatar"></div>';
    var reward =
      row.crystals_awarded > 0
        ? " · +" + row.crystals_awarded + " 💎"
        : "";
    li.innerHTML =
      avatar +
      '<div class="referral-row-main">' +
      '<p class="referral-row-name">' +
      escapeHtml(name) +
      "</p>" +
      '<div class="referral-progress" aria-hidden="true"><div class="referral-progress-fill" style="width:' +
      pct +
      '%"></div></div>' +
      '<p class="referral-row-meta">' +
      uses +
      " / " +
      required +
      " card drops" +
      reward +
      "</p>" +
      "</div>" +
      '<span class="referral-badge ' +
      badge.cls +
      '">' +
      escapeHtml(badge.text) +
      "</span>";
    return li;
  }

  function loadReferrals() {
    if (!state.user) return;
    els.referralsLoading.hidden = false;
    els.referralsContent.hidden = true;
    apiFetch("/api/me/referrals")
      .then(function (r) {
        if (!r.ok) throw new Error("Could not load referrals (" + r.status + ")");
        return r.json();
      })
      .then(renderReferrals)
      .catch(function (err) {
        els.referralsLoading.hidden = true;
        els.referralsError.hidden = false;
        els.referralsError.textContent = err.message || "Failed to load referrals.";
      });
  }

  function parseOptionalCapInput(el) {
    if (!el) return null;
    var raw = String(el.value || "").trim();
    if (!raw) return null;
    var n = parseInt(raw, 10);
    return isNaN(n) || n < 1 ? null : n;
  }

  function applySettings(settings) {
    if (els.notifyTrades) els.notifyTrades.checked = !!settings.notify_trades;
    if (els.notifyAuctions) els.notifyAuctions.checked = !!settings.notify_auctions;
    if (els.notifyReferrals) els.notifyReferrals.checked = !!settings.notify_referrals;
    if (els.notifyMissions) els.notifyMissions.checked = settings.notify_missions !== false;
    if (els.notifyWishlistMarket) {
      els.notifyWishlistMarket.checked = settings.notify_wishlist_market !== false;
    }
    if (els.wishlistMaxPokedollars) {
      els.wishlistMaxPokedollars.value =
        settings.wishlist_alert_max_pokedollars != null
          ? String(settings.wishlist_alert_max_pokedollars)
          : "";
    }
    if (els.wishlistMaxCrystals) {
      els.wishlistMaxCrystals.value =
        settings.wishlist_alert_max_crystals != null
          ? String(settings.wishlist_alert_max_crystals)
          : "";
    }
    state.settingsLoaded = true;
  }

  function renderCosmeticsFrames() {
    if (!els.cosmeticsFrameGrid) return;
    var cat = state.cosmeticsCatalog || {};
    var frames = cat.leaderboard_frames || [];
    var settings = state.cosmeticsSettings || {};
    var unlocked = settings.unlocked_leaderboard_frames || [];
    var equipped = settings.leaderboard_frame || null;
    var avatarSrc = previewAvatarUrl();
    if (!frames.length) {
      els.cosmeticsFrameGrid.innerHTML =
        '<p class="settings-muted">Could not load frame catalog.</p>';
      return;
    }

    var groupOrder = ["metal", "gem", "effect", ""];
    var html = "";
    groupOrder.forEach(function (groupKey) {
      var groupFrames = frames.filter(function (f) {
        var g = f.group || "";
        if (!groupKey) return groupOrder.indexOf(g) < 0;
        return g === groupKey;
      });
      if (!groupFrames.length) return;
      if (groupKey && FRAME_GROUP_LABELS[groupKey]) {
        html +=
          '<p class="cosmetics-frame-group">' +
          escapeHtml(FRAME_GROUP_LABELS[groupKey]) +
          "</p>";
      }
      groupFrames.forEach(function (f) {
        var id = f.id;
        var owned = unlocked.indexOf(id) >= 0;
        var isOn = equipped === id;
        var cardCls =
          "cosmetics-frame-card" +
          (owned ? " is-owned" : "") +
          (isOn ? " is-selected" : "");
        var badge = isOn
          ? '<span class="cosmetics-frame-badge">Selected</span>'
          : owned
            ? '<span class="cosmetics-frame-badge">Owned</span>'
            : '<span class="cosmetics-frame-badge is-locked">Preview</span>';
        var action = owned
          ? isOn
            ? '<button type="button" class="btn btn-ghost btn-sm cosmetics-clear-btn">Clear</button>'
            : '<button type="button" class="btn btn-primary btn-sm cosmetics-select-btn" data-frame="' +
              id +
              '">Select</button>'
          : '<button type="button" class="btn btn-primary btn-sm cosmetics-unlock-btn" data-frame="' +
            id +
            '">Unlock (' +
            f.cost +
            " 💎)</button>";
        html +=
          '<div class="' +
          cardCls +
          '" data-frame-id="' +
          id +
          '" tabindex="' +
          (owned ? "0" : "-1") +
          '" role="' +
          (owned ? "button" : "group") +
          '" aria-pressed="' +
          (isOn ? "true" : "false") +
          '">' +
          '<div class="cosmetics-frame-preview">' +
          '<img class="cosmetics-frame-avatar lb-avatar-framed lb-frame-' +
          id +
          '" src="' +
          escapeHtml(avatarSrc) +
          '" alt="" loading="lazy" />' +
          "</div>" +
          "<strong>" +
          escapeHtml(f.label) +
          "</strong>" +
          badge +
          action +
          "</div>";
      });
    });
    els.cosmeticsFrameGrid.innerHTML = html;

    els.cosmeticsFrameGrid.querySelectorAll(".cosmetics-unlock-btn").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        unlockFrame(btn.getAttribute("data-frame"));
      });
    });
    els.cosmeticsFrameGrid.querySelectorAll(".cosmetics-select-btn").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        equipFrame(btn.getAttribute("data-frame"));
      });
    });
    els.cosmeticsFrameGrid.querySelectorAll(".cosmetics-clear-btn").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        equipFrame(null);
      });
    });
    els.cosmeticsFrameGrid.querySelectorAll(".cosmetics-frame-card.is-owned").forEach(function (card) {
      card.addEventListener("click", function (e) {
        if (e.target.closest("button")) return;
        var fid = card.getAttribute("data-frame-id");
        if (settings.leaderboard_frame === fid) equipFrame(null);
        else equipFrame(fid);
      });
      card.addEventListener("keydown", function (e) {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        var fid = card.getAttribute("data-frame-id");
        if (settings.leaderboard_frame === fid) equipFrame(null);
        else equipFrame(fid);
      });
    });

    if (els.cosmeticsFrameMsg) {
      els.cosmeticsFrameMsg.textContent = equipped
        ? "Selected: " +
          frameLabelById(equipped, frames) +
          " — shows on the global leaderboard. Tap again or Clear to remove."
        : "Tap a frame preview to select it, or unlock more with Crystals.";
    }
  }

  function loadCosmetics() {
    Promise.all([
      apiFetch("/api/crystal-sinks").then(function (r) {
        return r.ok ? r.json() : {};
      }),
      apiFetch("/api/me/settings").then(function (r) {
        return r.ok ? r.json() : {};
      }),
    ])
      .then(function (pair) {
        state.cosmeticsCatalog = pair[0] || {};
        state.cosmeticsSettings = (pair[1] && pair[1].settings) || {};
        renderCosmeticsFrames();
      })
      .catch(function () {
        if (els.cosmeticsFrameMsg) {
          els.cosmeticsFrameMsg.textContent = "Could not load cosmetics.";
        }
      });
  }

  function unlockFrame(frameId) {
    apiFetch("/api/me/leaderboard-frame/unlock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ frame_id: frameId }),
    })
      .then(function (r) {
        return r.json().then(function (d) {
          return { ok: r.ok, data: d };
        });
      })
      .then(function (res) {
        if (!res.ok) throw new Error((res.data && res.data.message) || "Unlock failed");
        state.cosmeticsSettings = res.data.settings || state.cosmeticsSettings;
        renderCosmeticsFrames();
        if (window.PokePonApp && window.PokePonApp.notifyBalancesChanged) {
          window.PokePonApp.notifyBalancesChanged();
        }
      })
      .catch(function (err) {
        if (els.cosmeticsFrameMsg) {
          els.cosmeticsFrameMsg.textContent = err.message || "Unlock failed.";
        }
      });
  }

  function equipFrame(frameId) {
    apiFetch("/api/me/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leaderboard_frame: frameId }),
    })
      .then(function (r) {
        return r.json().then(function (d) {
          return { ok: r.ok, data: d };
        });
      })
      .then(function (res) {
        if (!res.ok) throw new Error((res.data && res.data.message) || "Equip failed");
        state.cosmeticsSettings = res.data.settings || state.cosmeticsSettings;
        renderCosmeticsFrames();
      })
      .catch(function (err) {
        if (els.cosmeticsFrameMsg) {
          els.cosmeticsFrameMsg.textContent = err.message || "Equip failed.";
        }
      });
  }

  function loadSettings() {
    apiFetch("/api/me/settings")
      .then(function (r) {
        if (!r.ok) throw new Error("Could not load settings");
        return r.json();
      })
      .then(function (data) {
        applySettings(data.settings || {});
      })
      .catch(function () {
        /* keep defaults checked in HTML */
        state.settingsLoaded = true;
      });
  }

  function saveSettings(ev) {
    ev.preventDefault();
    var body = {
      notify_trades: els.notifyTrades.checked,
      notify_auctions: els.notifyAuctions.checked,
      notify_referrals: els.notifyReferrals.checked,
      notify_missions: els.notifyMissions ? els.notifyMissions.checked : true,
      notify_wishlist_market: els.notifyWishlistMarket ? els.notifyWishlistMarket.checked : true,
      wishlist_alert_max_pokedollars: parseOptionalCapInput(els.wishlistMaxPokedollars),
      wishlist_alert_max_crystals: parseOptionalCapInput(els.wishlistMaxCrystals),
    };
    apiFetch("/api/me/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
      .then(function (r) {
        if (!r.ok) throw new Error("Save failed");
        return r.json();
      })
      .then(function (data) {
        applySettings(data.settings || body);
        if (els.notifySaveMsg) {
          els.notifySaveMsg.hidden = false;
          els.notifySaveMsg.textContent = "Saved.";
          setTimeout(function () {
            els.notifySaveMsg.hidden = true;
          }, 2500);
        }
      })
      .catch(function () {
        if (els.notifySaveMsg) {
          els.notifySaveMsg.hidden = false;
          els.notifySaveMsg.textContent = "Could not save — try again.";
          els.notifySaveMsg.style.color = "#f87171";
        }
      });
  }

  function bootAuth() {
    setSidebarState("loading");
    return apiFetch("/api/me")
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        if (data.authenticated && data.user) {
          showSignedIn(data.user);
          switchTab(tabFromHash());
          loadSettings();
          if (tabFromHash() === "referrals") loadReferrals();
        } else {
          showSignedOut();
        }
      })
      .catch(function () {
        showSignedOut();
      });
  }

  function bindEvents() {
    if (els.btnLogin) {
      els.btnLogin.addEventListener("click", function () {
        window.location.href = loginUrl();
      });
    }
    if (els.btnLoginMain) {
      els.btnLoginMain.addEventListener("click", function () {
        window.location.href = loginUrl();
      });
    }
    if (els.btnLogout) {
      els.btnLogout.addEventListener("click", function () {
        clearSessionToken();
        apiFetch("/auth/logout", { method: "POST" }).finally(function () {
          window.location.reload();
        });
      });
    }
    els.tabButtons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        switchTab(btn.getAttribute("data-tab"));
      });
    });
    if (els.notifyForm) {
      els.notifyForm.addEventListener("submit", saveSettings);
    }
    if (els.btnCopyInvite) {
      els.btnCopyInvite.addEventListener("click", copyInviteLink);
    }
    window.addEventListener("hashchange", function () {
      if (state.user) switchTab(tabFromHash());
    });
  }

  function copyInviteLink() {
    if (!els.inviteLinkInput) return;
    var link = els.inviteLinkInput.value;
    var done = function () {
      if (!els.inviteCopyMsg) return;
      els.inviteCopyMsg.hidden = false;
      els.inviteCopyMsg.textContent = "Copied!";
      setTimeout(function () {
        els.inviteCopyMsg.hidden = true;
      }, 2000);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(link).then(done).catch(fallback);
    } else {
      fallback();
    }
    function fallback() {
      els.inviteLinkInput.select();
      try {
        document.execCommand("copy");
        done();
      } catch (_) {
        if (els.inviteCopyMsg) {
          els.inviteCopyMsg.hidden = false;
          els.inviteCopyMsg.textContent = "Copy failed — select the link and use Cmd/Ctrl+C.";
        }
      }
    }
  }

  captureSessionFromFragment();
  bindEvents();
  bootAuth();
})();
