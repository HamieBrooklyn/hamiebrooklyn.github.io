(function () {
  "use strict";

  var browse = window.PokePonCatalogBrowse;
  if (!browse) {
    console.error("catalog-browse.js must load before pokedex.js");
    return;
  }

  var apiFetch = browse.apiFetch;
  var escapeHtml = browse.escapeHtml;
  var rarityClassFor = browse.rarityClassFor;
  var loginUrl = browse.loginUrl;

  var state = { authenticated: false };

  var els = {
    modal: document.getElementById("dex-modal"),
    modalImg: document.getElementById("dex-modal-img"),
    modalTitle: document.getElementById("dex-modal-title"),
    modalSet: document.getElementById("dex-modal-set"),
    modalRarity: document.getElementById("dex-modal-rarity"),
    modalHp: document.getElementById("dex-modal-hp"),
    modalDamage: document.getElementById("dex-modal-damage"),
    modalTypes: document.getElementById("dex-modal-types"),
    modalSupertype: document.getElementById("dex-modal-supertype"),
    modalDex: document.getElementById("dex-modal-dex"),
    modalTcgId: document.getElementById("dex-modal-tcg-id"),
    modalAttacksSection: document.getElementById("dex-modal-attacks-section"),
    modalAttacks: document.getElementById("dex-modal-attacks"),
    modalOwned: document.getElementById("dex-modal-owned"),
    modalOwnedHeading: document.getElementById("dex-modal-owned-heading"),
    modalOwnedHint: document.getElementById("dex-modal-owned-hint"),
    modalOwnedList: document.getElementById("dex-modal-owned-list"),
  };

  function fetchCardDetail(cardId) {
    return apiFetch("/api/catalog/cards/" + encodeURIComponent(String(cardId))).then(function (r) {
      if (!r.ok) throw new Error("detail " + r.status);
      return r.json();
    });
  }

  function renderOwnedPanel(card) {
    if (!els.modalOwned) return;
    var copies = card.owned_copies || [];
    var count = card.owned_count != null ? card.owned_count : copies.length;

    if (!state.authenticated) {
      els.modalOwned.hidden = false;
      els.modalOwnedHeading.textContent = "Your collection";
      els.modalOwnedHint.hidden = false;
      els.modalOwnedHint.textContent =
        "Sign in with Discord to see whether you own this printing.";
      els.modalOwnedList.innerHTML =
        '<li class="muted"><button type="button" class="btn btn-primary btn-small" id="dex-modal-login">Sign in</button></li>';
      var loginBtn = document.getElementById("dex-modal-login");
      if (loginBtn) {
        loginBtn.addEventListener("click", function () {
          window.location.href = loginUrl();
        });
      }
      return;
    }

    if (count <= 0 && !copies.length) {
      els.modalOwned.hidden = false;
      els.modalOwnedHeading.textContent = "Your collection";
      els.modalOwnedHint.hidden = false;
      els.modalOwnedHint.textContent = "You do not own this printing yet.";
      els.modalOwnedList.innerHTML = "";
      return;
    }

    els.modalOwned.hidden = false;
    els.modalOwnedHeading.textContent =
      count === 1 ? "You own 1 copy" : "You own " + count + " copies";
    els.modalOwnedHint.hidden = true;
    els.modalOwnedList.innerHTML = copies
      .map(function (copy) {
        var pid = copy.public_id || "";
        if (!pid) return "";
        var grade =
          copy.grade != null
            ? ' <span class="pokedex-owned-grade">Grade ' +
              escapeHtml(copy.grade_label || copy.grade) +
              "</span>"
            : "";
        var fav = copy.is_favorite
          ? ' <span class="pokedex-owned-fav" title="Favorited">⭐</span>'
          : "";
        return (
          '<li class="pokedex-owned-item"><code class="pokedex-owned-id">' +
          escapeHtml(pid) +
          '</code><button type="button" class="btn btn-ghost btn-small pokedex-copy-id" data-copy-id="' +
          escapeHtml(pid) +
          '">Copy</button>' +
          grade +
          fav +
          "</li>"
        );
      })
      .join("");
    els.modalOwnedList.querySelectorAll(".pokedex-copy-id").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var text = btn.getAttribute("data-copy-id") || "";
        if (!text) return;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text);
        }
      });
    });
    if (els.modalOwnedHint) {
      els.modalOwnedHint.hidden = false;
      els.modalOwnedHint.innerHTML =
        'Open <a class="pokedex-owned-link" href="/collection/">Collection</a> and paste the Card ID into search.';
    }
  }

  function fillModal(card) {
    var rarity = card.rarity || {};
    els.modal.hidden = false;
    els.modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");

    els.modalImg.src = card.image_large_url || card.image_small_url || "";
    els.modalImg.alt = card.name || "Card";
    els.modalTitle.textContent = card.name || "Card";
    els.modalSet.textContent =
      (card.set_name || card.set_code || "") + " · #" + (card.collector_number || "?");
    els.modalRarity.textContent = rarity.display_name || card.tcg_rarity || "Unknown";
    els.modalRarity.className =
      "modal-rarity " + rarityClassFor(rarity.display_name || rarity.code);
    els.modalHp.textContent = card.hp ? String(card.hp) : "—";
    els.modalDamage.textContent = card.max_damage ? String(card.max_damage) : "—";
    els.modalTypes.textContent =
      Array.isArray(card.types) && card.types.length ? card.types.join(" · ") : "—";
    els.modalSupertype.textContent = card.supertype || "—";
    var dexNums = card.dex_numbers || [];
    els.modalDex.textContent = dexNums.length ? dexNums.join(", ") : "—";
    els.modalTcgId.textContent = card.tcg_card_id || "—";

    var attacks = Array.isArray(card.attacks) ? card.attacks : [];
    if (!attacks.length) {
      els.modalAttacksSection.hidden = true;
      els.modalAttacks.innerHTML = "";
    } else {
      els.modalAttacksSection.hidden = false;
      els.modalAttacks.innerHTML = attacks
        .map(function (atk) {
          var name = escapeHtml(atk.name || "Attack");
          var dmg = atk.damage
            ? '<span class="atk-dmg">' + escapeHtml(atk.damage) + "</span>"
            : "";
          var cost =
            Array.isArray(atk.cost) && atk.cost.length
              ? '<span class="atk-cost">' + atk.cost.map(escapeHtml).join(" · ") + "</span>"
              : "";
          var text = atk.text ? '<p class="atk-text">' + escapeHtml(atk.text) + "</p>" : "";
          return (
            '<li><div class="atk-row"><span class="atk-name">' +
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

    renderOwnedPanel(card);
  }

  function openModalForCard(card) {
    if (!els.modal || !card) return;
    fetchCardDetail(card.id)
      .then(function (detail) {
        fillModal(detail || card);
      })
      .catch(function () {
        fillModal(card);
      });
  }

  function closeModal() {
    if (!els.modal) return;
    els.modal.hidden = true;
    els.modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
  }

  function bindModal() {
    if (els.modal) {
      els.modal.querySelectorAll("[data-close]").forEach(function (node) {
        node.addEventListener("click", closeModal);
      });
    }
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeModal();
    });
  }

  function init() {
    bindModal();
    browse.bindSidebarAuth({
      onAuthenticated: function (ok) {
        state.authenticated = ok;
      },
    });
    browse.mount({
      root: document.getElementById("pokedex-browse"),
      prefix: "dex",
      hashFilters: true,
      toolbarLabel: "Pokédex filters",
      placeholder: "Search by card name…",
      errorMessage: "Could not load the Pokédex.",
      onSelect: openModalForCard,
      onAuthenticated: function (ok) {
        if (ok) state.authenticated = true;
      },
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
