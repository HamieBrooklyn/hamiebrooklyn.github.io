/* Evolution target detail overlay — shared by collection + trades modals */
(function (global) {
  "use strict";

  var els = {};
  var deps = {};
  var pendingChoose = null;
  var historyPushed = false;
  var viewStack = [];
  var currentTarget = null;
  var currentCanChoose = false;
  var currentOnChoose = null;

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function renderAttacks(attacks, container, section) {
    if (!container || !section) return;
    var list = Array.isArray(attacks) ? attacks : [];
    if (!list.length) {
      section.hidden = true;
      container.innerHTML = "";
      return;
    }
    section.hidden = false;
    container.innerHTML = list
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

  function renderNextSection(target) {
    if (!els.nextSection || !els.nextTargets) return;
    var next = Array.isArray(target.next_targets) ? target.next_targets : [];
    if (!next.length) {
      els.nextSection.hidden = true;
      els.nextTargets.innerHTML = "";
      return;
    }
    els.nextSection.hidden = false;
    renderTargetRows(els.nextTargets, next, {
      readonly: true,
      canEvolve: false,
      previewOnly: true,
      fmtCost: deps.fmtCost,
    });
  }

  function close(skipHistory) {
    if (!els.modal) return;
    if (viewStack.length) {
      var frame = viewStack.pop();
      open(frame.target, {
        replace: true,
        _reopen: true,
        canChoose: frame.canChoose,
        onChoose: frame.onChoose,
      });
      return;
    }
    currentTarget = null;
    currentCanChoose = false;
    currentOnChoose = null;
    viewStack = [];
    els.modal.hidden = true;
    els.modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("evo-focus-open");
    pendingChoose = null;
    if (!skipHistory && historyPushed) {
      historyPushed = false;
      if (deps.onHistoryBack) deps.onHistoryBack();
      else history.back();
    } else {
      historyPushed = false;
    }
    if (deps.onClose) deps.onClose();
  }

  function open(target, opts) {
    if (!target || !els.modal) return;
    opts = opts || {};
    if (!opts.replace && !opts._reopen && currentTarget != null) {
      viewStack.push({
        target: currentTarget,
        canChoose: currentCanChoose,
        onChoose: currentOnChoose,
      });
    }
    currentTarget = target;
    var previewOnly = !!opts.previewOnly;
    pendingChoose =
      !previewOnly && typeof opts.onChoose === "function" ? opts.onChoose : null;
    currentOnChoose = pendingChoose;
    currentCanChoose = !!opts.canChoose && !!pendingChoose;
    var canChoose = currentCanChoose;

    var img = target.image_large_url || target.image_small_url || "";
    if (els.img) {
      els.img.src = img;
      els.img.alt = target.name || "Evolution";
    }
    if (els.title) els.title.textContent = target.name || "Card";
    if (els.set) {
      els.set.textContent =
        (target.set_name || target.set_code || "") + " · #" + (target.collector_number || "?");
    }
    var rarityLabel = target.rarity_display || target.tcg_rarity || "Unknown rarity";
    if (els.rarity) {
      els.rarity.textContent = rarityLabel;
      if (deps.rarityClassFor) {
        els.rarity.className = "modal-rarity " + deps.rarityClassFor(rarityLabel);
      }
    }
    if (els.hp) els.hp.textContent = target.hp ? String(target.hp) : "—";
    if (els.damage) {
      els.damage.textContent = target.max_damage ? String(target.max_damage) : "—";
    }
    if (els.types) {
      var types = Array.isArray(target.types) && target.types.length ? target.types.join(" · ") : "—";
      els.types.textContent = types;
    }
    if (els.supertype) {
      els.supertype.textContent = target.supertype || "—";
    }
    renderAttacks(target.attacks, els.attacks, els.attacksSection);
    renderNextSection(target);

    if (els.cost) {
      if (!previewOnly && target.cost_pokedollars != null && deps.fmtCost) {
        els.cost.hidden = false;
        els.cost.textContent = "Evolution cost: " + deps.fmtCost(target.cost_pokedollars);
      } else {
        els.cost.hidden = true;
        els.cost.textContent = "";
      }
    }

    if (els.chooseBtn) {
      els.chooseBtn.hidden = !canChoose;
      els.chooseBtn.disabled = !canChoose;
      if (canChoose && target.cost_pokedollars != null && deps.fmtCost) {
        els.chooseBtn.textContent = "Choose · " + deps.fmtCost(target.cost_pokedollars);
      } else if (canChoose) {
        els.chooseBtn.textContent = "Choose this evolution";
      }
    }
    if (els.actions) {
      els.actions.hidden = !canChoose;
    }

    if (!historyPushed) {
      historyPushed = true;
      if (deps.onHistoryPush) deps.onHistoryPush();
      else history.pushState({ pokepon: "evo-focus" }, "");
    }

    els.modal.hidden = false;
    els.modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("evo-focus-open");
    if (deps.onOpen) deps.onOpen();
  }

  function mount(options) {
    deps = options || {};
    els.modal = document.getElementById("evo-focus-modal");
    if (!els.modal) return;
    els.img = document.getElementById("evo-focus-img");
    els.title = document.getElementById("evo-focus-title");
    els.set = document.getElementById("evo-focus-set");
    els.rarity = document.getElementById("evo-focus-rarity");
    els.hp = document.getElementById("evo-focus-hp");
    els.damage = document.getElementById("evo-focus-damage");
    els.types = document.getElementById("evo-focus-types");
    els.supertype = document.getElementById("evo-focus-supertype");
    els.cost = document.getElementById("evo-focus-cost");
    els.attacksSection = document.getElementById("evo-focus-attacks-section");
    els.attacks = document.getElementById("evo-focus-attacks");
    els.nextSection = document.getElementById("evo-focus-next-section");
    els.nextTargets = document.getElementById("evo-focus-next-targets");
    els.chooseBtn = document.getElementById("evo-focus-choose");
    els.actions = document.querySelector(".evo-focus-actions");

    els.modal.querySelectorAll("[data-evo-focus-close]").forEach(function (node) {
      node.addEventListener("click", close);
    });
    if (els.chooseBtn) {
      els.chooseBtn.addEventListener("click", function () {
        if (pendingChoose) pendingChoose();
        close();
      });
    }
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && els.modal && !els.modal.hidden) {
        e.stopPropagation();
        close();
      }
    });
  }

  function syncSelection(container, selectedId) {
    if (!container) return;
    var nodes = container.querySelectorAll(".modal-evo-target");
    for (var i = 0; i < nodes.length; i++) {
      var id = Number(nodes[i].dataset.cardId);
      nodes[i].classList.toggle("is-selected", id === selectedId);
    }
  }

  function renderTargetRows(container, targets, options) {
    if (!container) return;
    options = options || {};
    var readonly = !!options.readonly;
    var canEvolve = !!options.canEvolve;
    var selectedId = options.selectedId;
    var onSelect = typeof options.onSelect === "function" ? options.onSelect : null;
    var fmtCost = options.fmtCost || deps.fmtCost;

    container.innerHTML = "";
    (targets || []).forEach(function (t) {
      var row = document.createElement("div");
      row.className = "modal-evo-target";
      row.dataset.cardId = String(t.card_id);
      if (selectedId === t.card_id) row.classList.add("is-selected");

      var hit = document.createElement("button");
      hit.type = "button";
      hit.className = "modal-evo-target-hit";
      hit.setAttribute(
        "aria-label",
        "View " + (t.name || "evolution") + " in detail"
      );

      var imgSrc = t.image_small_url || t.image_large_url || "";
      if (imgSrc) {
        var img = document.createElement("img");
        img.src = imgSrc;
        img.alt = "";
        hit.appendChild(img);
      }

      var meta = document.createElement("span");
      meta.className = "modal-evo-target-meta";
      var nm = document.createElement("span");
      nm.className = "modal-evo-target-name";
      nm.textContent = t.name || "Card";
      meta.appendChild(nm);
      var sub = document.createElement("span");
      sub.className = "modal-evo-target-sub";
      var subBits = [];
      if (t.set_name) subBits.push(t.set_name + " #" + (t.collector_number || "?"));
      if (t.rarity_display) subBits.push(t.rarity_display);
      if (!readonly && t.cost_pokedollars != null && fmtCost) {
        subBits.push(fmtCost(t.cost_pokedollars));
      }
      sub.textContent = subBits.join(" · ");
      meta.appendChild(sub);
      var hint = document.createElement("span");
      hint.className = "modal-evo-target-hint";
      hint.textContent = "View details";
      meta.appendChild(hint);
      hit.appendChild(meta);

      hit.addEventListener("click", function () {
        open(t, {
          previewOnly: true,
          canChoose: false,
          onChoose: null,
        });
      });
      row.appendChild(hit);

      if (!readonly && canEvolve && onSelect) {
        var pick = document.createElement("button");
        pick.type = "button";
        pick.className = "modal-evo-target-pick";
        pick.textContent = selectedId === t.card_id ? "Selected" : "Select";
        pick.setAttribute("aria-label", "Select " + (t.name || "evolution"));
        pick.addEventListener("click", function (e) {
          e.stopPropagation();
          onSelect(t.card_id);
          syncSelection(container, t.card_id);
          var picks = container.querySelectorAll(".modal-evo-target-pick");
          for (var j = 0; j < picks.length; j++) {
            var rowEl = picks[j].closest(".modal-evo-target");
            picks[j].textContent =
              rowEl && Number(rowEl.dataset.cardId) === t.card_id ? "Selected" : "Select";
          }
        });
        row.appendChild(pick);
      }

      container.appendChild(row);
    });
  }

  global.PokeponEvoFocus = {
    mount: mount,
    open: open,
    close: close,
    renderTargetRows: renderTargetRows,
    syncSelection: syncSelection,
  };
})(typeof window !== "undefined" ? window : this);
