/* Collection dashboard for PokePon — talks to the bot's HTTP API.
 *
 * Auth model:
 *   - `GET <api>/api/me` returns either {authenticated:false} or {authenticated:true,user:{…}}.
 *   - If not authenticated, "Sign in with Discord" sends the browser to
 *     `<api>/auth/discord/login?return_to=<this page>`. The bot mints a signed
 *     session cookie on the callback, then redirects back here.
 *   - Subsequent calls send the cookie via `credentials: "include"`.
 */
(function () {
  "use strict";

  /** API base URL set by the inline script in collection.html. */
  var API_BASE = (window.POKEPON_API_BASE || "").replace(/\/+$/, "");
  /** Same-origin requests get '' so fetch keeps using the current host. */
  function api(path) {
    return API_BASE + path;
  }

  var STATUS_KIND = {
    INFO: "info",
    EMPTY: "empty",
    ERROR: "error",
    AUTH: "auth",
  };

  var els = {
    sidebarUser: document.getElementById("sidebar-user"),
    btnLogin: document.getElementById("btn-login"),
    btnLogout: document.getElementById("btn-logout"),
    userName: document.getElementById("user-name"),
    userAvatar: document.getElementById("user-avatar"),
    search: document.getElementById("search-input"),
    searchClear: document.getElementById("search-clear"),
    chips: Array.prototype.slice.call(document.querySelectorAll(".chip[data-sort]")),
    status: document.getElementById("status"),
    grid: document.getElementById("card-grid"),
    pager: document.getElementById("pager"),
    pagerPrev: document.getElementById("pager-prev"),
    pagerNext: document.getElementById("pager-next"),
    pagerInfo: document.getElementById("pager-info"),
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
    sidebarToggle: document.getElementById("sidebar-toggle"),
    sidebar: document.getElementById("sidebar"),
  };

  var state = {
    authenticated: false,
    page: 1,
    pageSize: 60,
    sort: "newest",
    query: "",
    total: 0,
    items: [],
    inflight: null,
    searchDebounce: 0,
  };

  // ------- helpers -------------------------------------------------------

  function setStatus(kind, html) {
    if (!html) {
      els.status.hidden = true;
      els.status.innerHTML = "";
      return;
    }
    els.status.hidden = false;
    els.status.className = "collection-status state-" + kind;
    els.status.innerHTML = html;
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
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

  // ------- auth ---------------------------------------------------------

  function showLoadingUser() {
    els.sidebarUser.dataset.state = "loading";
    els.sidebarUser.querySelector(".sidebar-user-loading").hidden = false;
    els.sidebarUser.querySelector(".sidebar-user-signedout").hidden = true;
    els.sidebarUser.querySelector(".sidebar-user-signedin").hidden = true;
  }
  function showSignedOut() {
    els.sidebarUser.dataset.state = "signed-out";
    els.sidebarUser.querySelector(".sidebar-user-loading").hidden = true;
    els.sidebarUser.querySelector(".sidebar-user-signedout").hidden = false;
    els.sidebarUser.querySelector(".sidebar-user-signedin").hidden = true;
  }
  function showSignedIn(user) {
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
      els.userAvatar.alt = "";
      els.userAvatar.removeAttribute("src");
    }
  }

  function loginUrl() {
    return api("/auth/discord/login?return_to=" + encodeURIComponent(window.location.href));
  }

  function bootAuth() {
    showLoadingUser();
    if (!API_BASE) {
      // Same-origin mode — the API is presumed to be reverse-proxied here.
    }
    fetch(api("/api/me"), { credentials: "include" })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (body) {
        if (body && body.authenticated && body.user) {
          state.authenticated = true;
          showSignedIn(body.user);
          loadCollection(true);
        } else {
          state.authenticated = false;
          showSignedOut();
          renderUnauthenticated();
        }
      })
      .catch(function (err) {
        state.authenticated = false;
        showSignedOut();
        setStatus(
          STATUS_KIND.ERROR,
          'Could not reach the PokePon API at <code>' +
            escapeHtml(API_BASE || window.location.origin) +
            "</code>. " +
            "Double-check that the bot's web server is online and the page's " +
            "<code>pokepon-api-base</code> meta tag points at it. " +
            "<br><span class=\"muted\">Details: " +
            escapeHtml(err.message || String(err)) +
            "</span>"
        );
      });
  }

  function renderUnauthenticated() {
    els.grid.innerHTML = "";
    els.pager.hidden = true;
    setStatus(
      STATUS_KIND.AUTH,
      'Sign in with Discord to load your bot collection. The button is in the side panel.'
    );
  }

  // ------- collection fetch + render ------------------------------------

  function buildCollectionUrl() {
    var qs = new URLSearchParams();
    qs.set("page", String(state.page));
    qs.set("page_size", String(state.pageSize));
    qs.set("sort", state.sort);
    if (state.query) qs.set("q", state.query);
    return api("/api/me/collection?" + qs.toString());
  }

  function loadCollection(scrollTop) {
    if (!state.authenticated) {
      renderUnauthenticated();
      return;
    }
    if (state.inflight) {
      // Discard old result — newer query supersedes it.
      state.inflight.abort();
    }
    var ctrl = new AbortController();
    state.inflight = ctrl;
    setStatus(STATUS_KIND.INFO, "Loading your collection…");
    els.grid.setAttribute("aria-busy", "true");

    fetch(buildCollectionUrl(), {
      credentials: "include",
      signal: ctrl.signal,
    })
      .then(function (r) {
        if (r.status === 401) {
          state.authenticated = false;
          showSignedOut();
          renderUnauthenticated();
          throw new Error("unauthenticated");
        }
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (body) {
        state.inflight = null;
        state.items = Array.isArray(body.items) ? body.items : [];
        state.total = Number(body.total) || 0;
        state.page = Number(body.page) || 1;
        state.pageSize = Number(body.page_size) || state.pageSize;
        renderCollection();
        if (scrollTop) window.scrollTo({ top: 0, behavior: "smooth" });
      })
      .catch(function (err) {
        if (err.name === "AbortError") return;
        if ((err.message || "") === "unauthenticated") return;
        state.inflight = null;
        setStatus(
          STATUS_KIND.ERROR,
          "Could not load your collection: " + escapeHtml(err.message || String(err))
        );
      })
      .finally(function () {
        els.grid.removeAttribute("aria-busy");
      });
  }

  function renderCollection() {
    if (state.total === 0) {
      els.grid.innerHTML = "";
      els.pager.hidden = true;
      setStatus(
        STATUS_KIND.EMPTY,
        state.query
          ? "No cards in your collection match <strong>" +
              escapeHtml(state.query) +
              "</strong>."
          : "Your collection is empty. Run <code>/cd</code> in Discord to claim your first card."
      );
      return;
    }
    setStatus(
      STATUS_KIND.INFO,
      "<strong>" +
        state.total.toLocaleString() +
        "</strong> card" +
        (state.total === 1 ? "" : "s") +
        (state.query ? ' matching "' + escapeHtml(state.query) + '"' : "") +
        " · sorted by <strong>" +
        sortLabel(state.sort) +
        "</strong>"
    );

    var frag = document.createDocumentFragment();
    state.items.forEach(function (it, idx) {
      frag.appendChild(buildTile(it, idx));
    });
    els.grid.innerHTML = "";
    els.grid.appendChild(frag);

    var pages = Math.max(1, Math.ceil(state.total / state.pageSize));
    els.pagerInfo.textContent = "Page " + state.page + " of " + pages;
    els.pagerPrev.disabled = state.page <= 1;
    els.pagerNext.disabled = state.page >= pages;
    els.pager.hidden = pages <= 1;
  }

  function sortLabel(sort) {
    switch (sort) {
      case "rarity":
        return "rarity";
      case "hp":
        return "HP";
      case "damage":
        return "damage";
      default:
        return "newest";
    }
  }

  function buildTile(item, idx) {
    var card = item.card || {};
    var rarity = card.rarity || {};
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "card-tile " + rarityClassFor(rarity.display_name);
    btn.dataset.idx = String(idx);

    var img = document.createElement("img");
    img.loading = "lazy";
    img.decoding = "async";
    img.src = card.image_small_url || card.image_large_url || "";
    img.alt = card.name || "Card";
    img.className = "card-tile-img";

    var meta = document.createElement("div");
    meta.className = "card-tile-meta";
    meta.innerHTML =
      '<span class="card-tile-name">' +
      escapeHtml(card.name) +
      "</span>" +
      '<span class="card-tile-sub">' +
      escapeHtml((card.set_name || card.set_code || "") + " · #" + (card.collector_number || "?")) +
      "</span>";

    var statsRow = document.createElement("div");
    statsRow.className = "card-tile-stats";
    var stats = [];
    if (card.hp) stats.push('<span title="HP">❤ ' + escapeHtml(card.hp) + "</span>");
    if (card.max_damage) stats.push('<span title="Max damage">⚡ ' + escapeHtml(card.max_damage) + "</span>");
    if (rarity.display_name) {
      stats.push(
        '<span class="card-tile-rarity" title="Rarity">' +
          escapeHtml(rarity.display_name) +
          "</span>"
      );
    }
    statsRow.innerHTML = stats.join("");

    btn.appendChild(img);
    btn.appendChild(meta);
    btn.appendChild(statsRow);
    btn.addEventListener("click", function () {
      openModal(item);
    });
    return btn;
  }

  // ------- modal --------------------------------------------------------

  function openModal(item) {
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

    els.modal.hidden = false;
    els.modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
  }

  function closeModal() {
    els.modal.hidden = true;
    els.modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
  }

  // ------- event wiring -------------------------------------------------

  els.btnLogin.addEventListener("click", function () {
    window.location.href = loginUrl();
  });

  els.btnLogout.addEventListener("click", function () {
    fetch(api("/auth/logout"), {
      method: "POST",
      credentials: "include",
    }).finally(function () {
      window.location.reload();
    });
  });

  els.search.addEventListener("input", function (e) {
    var value = (e.target.value || "").trim();
    els.searchClear.hidden = value.length === 0;
    clearTimeout(state.searchDebounce);
    state.searchDebounce = setTimeout(function () {
      if (value === state.query) return;
      state.query = value;
      state.page = 1;
      loadCollection(false);
    }, 280);
  });

  els.searchClear.addEventListener("click", function () {
    els.search.value = "";
    els.searchClear.hidden = true;
    if (state.query !== "") {
      state.query = "";
      state.page = 1;
      loadCollection(false);
    }
    els.search.focus();
  });

  els.chips.forEach(function (chip) {
    chip.addEventListener("click", function () {
      var sort = chip.dataset.sort;
      if (!sort || sort === state.sort) return;
      els.chips.forEach(function (c) {
        var on = c === chip;
        c.classList.toggle("is-active", on);
        c.setAttribute("aria-pressed", on ? "true" : "false");
      });
      state.sort = sort;
      state.page = 1;
      loadCollection(false);
    });
    // Default "newest" is the visually-active one on first paint.
    if (chip.dataset.sort === state.sort) {
      chip.classList.add("is-active");
      chip.setAttribute("aria-pressed", "true");
    }
  });

  els.pagerPrev.addEventListener("click", function () {
    if (state.page <= 1) return;
    state.page -= 1;
    loadCollection(true);
  });
  els.pagerNext.addEventListener("click", function () {
    var pages = Math.max(1, Math.ceil(state.total / state.pageSize));
    if (state.page >= pages) return;
    state.page += 1;
    loadCollection(true);
  });

  document.addEventListener("click", function (e) {
    var t = e.target;
    if (t && (t.dataset && t.dataset.close !== undefined)) {
      closeModal();
    }
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !els.modal.hidden) closeModal();
  });

  els.sidebarToggle.addEventListener("click", function () {
    var open = els.sidebar.classList.toggle("is-open");
    els.sidebarToggle.setAttribute("aria-expanded", open ? "true" : "false");
  });

  // Boot
  bootAuth();
})();
