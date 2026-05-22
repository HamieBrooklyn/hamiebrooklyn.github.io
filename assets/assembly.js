/* Assembly Station — combine 2 or 4 owned pieces into one card */
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

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  var els = {
    board: document.getElementById("assembly-board"),
    boardMeta: document.getElementById("assembly-board-meta"),
    cost: document.getElementById("assembly-cost"),
    btnAssemble: document.getElementById("btn-assemble"),
    btnReset: document.getElementById("btn-assembly-reset"),
    msg: document.getElementById("assembly-msg"),
    pickerTitle: document.getElementById("assembly-picker-title"),
    pickerLead: document.getElementById("assembly-picker-lead"),
    search: document.getElementById("assembly-search-input"),
    searchClear: document.getElementById("assembly-search-clear"),
    grid: document.getElementById("assembly-card-grid"),
    pickerStatus: document.getElementById("assembly-picker-status"),
  };

  var state = {
    authenticated: false,
    query: "",
    anchorPublicId: null,
    group: null,
    slots: {},
    items: [],
    quoteCost: null,
    assembling: false,
    searchDebounce: 0,
    inflight: null,
  };

  function setPickerStatus(kind, text) {
    if (!els.pickerStatus) return;
    if (!text) {
      els.pickerStatus.hidden = true;
      els.pickerStatus.textContent = "";
      return;
    }
    els.pickerStatus.hidden = false;
    els.pickerStatus.className = "craft-picker-status state-" + kind;
    els.pickerStatus.textContent = text;
  }

  function setAssemblyMsg(kind, text) {
    if (!els.msg) return;
    if (!text) {
      els.msg.hidden = true;
      return;
    }
    els.msg.hidden = false;
    els.msg.className = "craft-msg" + (kind === "error" ? " is-error" : "");
    els.msg.textContent = text;
  }

  function selectedPublicIds() {
    return Object.keys(state.slots)
      .sort(function (a, b) {
        return Number(a) - Number(b);
      })
      .map(function (k) {
        return state.slots[k].public_id;
      });
  }

  function slotCountFilled() {
    return Object.keys(state.slots).length;
  }

  function renderBoard() {
    if (!els.board) return;
    var g = state.group;
    if (!g || !g.slots) {
      els.board.innerHTML =
        '<p class="assembly-board-placeholder muted">Select a piece below to begin.</p>';
      if (els.boardMeta) els.boardMeta.hidden = true;
      return;
    }

    var layout = g.layout || "quad";
    var orient = g.orientation || "portrait";
    els.board.className =
      "assembly-board layout-" + layout + " orientation-" + orient;

    var html = "";
    g.slots.forEach(function (slotDef) {
      var idx = slotDef.slot_index;
      var filled = state.slots[idx];
      var rot = slotDef.rotation_deg || 0;
      var style =
        "grid-column:" +
        (slotDef.grid_col + 1) +
        ";grid-row:" +
        (slotDef.grid_row + 1) +
        ";";
      var inner = filled
        ? '<img class="assembly-slot-img is-placed" src="' +
          escapeHtml(filled.card.image_large_url || filled.card.image_small_url) +
          '" alt="" style="transform:rotate(' +
          rot +
          'deg)">'
        : '<span class="assembly-slot-empty">+' +
          (idx + 1) +
          "</span>";
      html +=
        '<div class="assembly-slot" data-slot="' +
        idx +
        '" style="' +
        style +
        '">' +
        inner +
        "</div>";
    });

    if (g.result && g.result.image_large_url) {
      html +=
        '<div class="assembly-result-ghost" aria-hidden="true"><img src="' +
        escapeHtml(g.result.image_large_url) +
        '" alt=""></div>";
    }

    els.board.innerHTML = html;

    if (els.boardMeta) {
      els.boardMeta.hidden = false;
      els.boardMeta.textContent =
        (g.display_name || "Assembly") +
        " · " +
        slotCountFilled() +
        " / " +
        (g.piece_count || g.slots.length) +
        " pieces";
    }
  }

  function updateActions() {
    var need = state.group ? state.group.piece_count || state.group.slots.length : 0;
    var ready = need > 0 && slotCountFilled() === need;
    if (els.btnAssemble) {
      els.btnAssemble.disabled = !ready || state.assembling;
      els.btnAssemble.textContent = ready
        ? "Assemble card"
        : "Assemble card (" + slotCountFilled() + "/" + need + ")";
    }
    if (els.cost) {
      if (ready && state.quoteCost != null) {
        els.cost.hidden = false;
        els.cost.textContent =
          "Cost: ₽" + String(state.quoteCost).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      } else {
        els.cost.hidden = true;
      }
    }
  }

  function fetchQuote() {
    var ids = selectedPublicIds();
    if (!ids.length) {
      state.quoteCost = null;
      updateActions();
      return;
    }
    apiFetch("/api/me/assembly/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ public_ids: ids }),
    })
      .then(function (r) {
        return r.json().then(function (body) {
          return { ok: r.ok, body: body };
        });
      })
      .then(function (res) {
        if (!res.ok || !res.body.ok) {
          state.quoteCost = null;
          setAssemblyMsg(
            "error",
            (res.body && res.body.message) || "Could not quote assembly cost."
          );
          updateActions();
          return;
        }
        state.quoteCost = res.body.cost;
        if (res.body.group) {
          state.group = res.body.group;
          renderBoard();
        }
        setAssemblyMsg("", "");
        updateActions();
      })
      .catch(function () {
        state.quoteCost = null;
        updateActions();
      });
  }

  function clearBoard() {
    state.anchorPublicId = null;
    state.group = null;
    state.slots = {};
    state.quoteCost = null;
    renderBoard();
    updateActions();
    setAssemblyMsg("", "");
    if (els.pickerLead) {
      els.pickerLead.textContent =
        "Cards in your collection that are part of a multi-card puzzle.";
    }
    loadPieces();
  }

  function placePiece(item) {
    var asm = item.assembly || {};
    var slot = asm.slot_index;
    if (slot == null) return;

    if (!state.anchorPublicId) {
      state.anchorPublicId = item.public_id;
      state.group = {
        id: asm.group_id,
        code: asm.group_code,
        display_name: asm.display_name,
        piece_count: asm.piece_count,
        layout: asm.layout,
        orientation: asm.orientation,
        slots: [],
      };
      if (els.pickerLead) {
        els.pickerLead.textContent =
          "Now pick the other piece(s) for " +
          (asm.display_name || "this card") +
          ".";
      }
    }

    if (!state.group.slots || !state.group.slots.length) {
      var pc = asm.piece_count || 4;
      var layout = asm.layout || "quad";
      state.group.slots = [];
      for (var i = 0; i < pc; i++) {
        var col = i % 2;
        var row = Math.floor(i / 2);
        if (layout === "horizontal_halves") {
          col = i;
          row = 0;
        }
        state.group.slots.push({
          slot_index: i,
          grid_col: col,
          grid_row: row,
          rotation_deg: 0,
        });
      }
    }

    state.slots[slot] = item;
    renderBoard();
    loadPieces();
    fetchQuote();
  }

  function sortPiecesAz(items) {
    return items.slice().sort(function (a, b) {
      var na = ((a.card && a.card.name) || "").trim();
      var nb = ((b.card && b.card.name) || "").trim();
      var cmp = na.localeCompare(nb, undefined, { sensitivity: "base" });
      if (cmp !== 0) return cmp;
      var sa = (a.card && a.card.set_code) || "";
      var sb = (b.card && b.card.set_code) || "";
      cmp = sa.localeCompare(sb, undefined, { sensitivity: "base" });
      if (cmp !== 0) return cmp;
      var ia = a.assembly && a.assembly.slot_index != null ? a.assembly.slot_index : 0;
      var ib = b.assembly && b.assembly.slot_index != null ? b.assembly.slot_index : 0;
      return ia - ib;
    });
  }

  function renderGrid(items) {
    if (!els.grid) return;
    items = sortPiecesAz(items);
    if (!items.length) {
      els.grid.innerHTML =
        '<p class="grid-empty muted">No assembly pieces in your collection. Pieces drop from packs like other cards.</p>';
      return;
    }

    els.grid.innerHTML = items
      .map(function (item) {
        var card = item.card || {};
        var asm = item.assembly || {};
        var blocked = item.sell_blocked;
        var img = card.image_small_url || "";
        var slotLabel = "Piece " + (Number(asm.slot_index) + 1);
        var disabled =
          blocked ||
          (state.anchorPublicId &&
            Object.keys(state.slots).some(function (k) {
              return state.slots[k].public_id === item.public_id;
            }));
        return (
          '<button type="button" class="card-tile assembly-tile' +
          (disabled ? " is-disabled" : "") +
          '" data-public-id="' +
          escapeHtml(item.public_id) +
          '" data-slot="' +
          escapeHtml(String(asm.slot_index)) +
          '">' +
          '<img src="' +
          escapeHtml(img) +
          '" alt="" loading="lazy">' +
          '<span class="card-tile-caption">' +
          '<span class="card-tile-name">' +
          escapeHtml(card.name || "") +
          "</span>" +
          '<span class="card-tile-sub">' +
          escapeHtml(slotLabel) +
          "</span></span></button>"
        );
      })
      .join("");

    els.grid.querySelectorAll(".assembly-tile:not(.is-disabled)").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var pid = btn.getAttribute("data-public-id");
        var item = items.find(function (it) {
          return it.public_id === pid;
        });
        if (!item) return;
        var slot = btn.getAttribute("data-slot");
        if (state.slots[slot]) return;
        btn.classList.add("is-flying");
        setTimeout(function () {
          placePiece(item);
        }, 280);
      });
    });
  }

  function loadPieces() {
    if (!state.authenticated) return;
    if (state.inflight) state.inflight.abort();
    var ctrl = new AbortController();
    state.inflight = ctrl;
    var qs = new URLSearchParams();
    if (state.query) qs.set("q", state.query);
    if (state.anchorPublicId) qs.set("anchor", state.anchorPublicId);
    var path = "/api/me/assembly/pieces?" + qs.toString();

    setPickerStatus("info", "Loading pieces…");
    apiFetch(path, { signal: ctrl.signal })
      .then(function (r) {
        return r.json();
      })
      .then(function (body) {
        if (ctrl.signal.aborted) return;
        state.inflight = null;
        var items = body && Array.isArray(body.items) ? body.items : [];
        state.items = sortPiecesAz(items);
        if (!items.length) {
          setPickerStatus(
            "warn",
            state.anchorPublicId
              ? "No compatible pieces left for this assembly."
              : "No assembly pieces found."
          );
        } else {
          setPickerStatus("", "");
        }
        if (state.anchorPublicId && items.length && items[0].assembly) {
          var a = items[0].assembly;
          if (!state.group || !state.group.slots || !state.group.slots.length) {
            apiFetch("/api/me/assembly/quote", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ public_ids: [state.anchorPublicId] }),
            })
              .then(function (r) {
                return r.json();
              })
              .then(function (qbody) {
                if (qbody && qbody.group) {
                  state.group = qbody.group;
                  renderBoard();
                } else if (!state.group.slots) {
                  state.group.slots = [];
                  for (var i = 0; i < a.piece_count; i++) {
                    var col = i % 2;
                    var row = Math.floor(i / 2);
                    if (a.layout === "horizontal_halves") {
                      col = i;
                      row = 0;
                    }
                    state.group.slots.push({
                      slot_index: i,
                      grid_col: col,
                      grid_row: row,
                      rotation_deg: 0,
                    });
                  }
                  renderBoard();
                }
              })
              .catch(function () {});
          }
        }
        renderGrid(items);
      })
      .catch(function (err) {
        if (err && err.name === "AbortError") return;
        setPickerStatus("error", "Could not load assembly pieces.");
      });
  }

  function runAssemble() {
    var ids = selectedPublicIds();
    if (!ids.length || state.assembling) return;
    state.assembling = true;
    updateActions();
    setAssemblyMsg("", "");
    apiFetch("/api/me/assembly/assemble", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ public_ids: ids }),
    })
      .then(function (r) {
        return r.json().then(function (body) {
          return { ok: r.ok, body: body };
        });
      })
      .then(function (res) {
        state.assembling = false;
        if (!res.ok || !res.body.ok) {
          setAssemblyMsg(
            "error",
            (res.body && res.body.message) || "Assembly failed."
          );
          updateActions();
          return;
        }
        if (res.body.group) {
          state.group = res.body.group;
        }
        var name = (res.body.card && res.body.card.name) || "Card";
        els.board.className =
          "assembly-board layout-" +
          (state.group && state.group.layout) +
          " orientation-" +
          (state.group && state.group.orientation) +
          " is-complete";
        els.board.innerHTML =
          '<div class="assembly-complete">' +
          '<img class="assembly-complete-img" src="' +
          escapeHtml(
            (res.body.card && res.body.card.image_large_url) ||
              (state.group && state.group.result && state.group.result.image_large_url) ||
              ""
          ) +
          '" alt="">' +
          "<p><strong>" +
          escapeHtml(name) +
          "</strong> assembled!</p>" +
          '<p class="muted">Pieces consumed · <a href="/collection/">View collection</a></p>' +
          "</div>";
        if (els.boardMeta) {
          els.boardMeta.textContent =
            "Paid ₽" +
            String(res.body.cost || 0) +
            " · Balance ₽" +
            String(res.body.new_balance != null ? res.body.new_balance : "—");
          els.boardMeta.hidden = false;
        }
        state.slots = {};
        state.anchorPublicId = null;
        state.quoteCost = null;
        if (els.btnAssemble) els.btnAssemble.disabled = true;
        loadPieces();
      })
      .catch(function () {
        state.assembling = false;
        setAssemblyMsg("error", "Network error — try again.");
        updateActions();
      });
  }

  function bootAssemblyAuth() {
    apiFetch("/api/me")
      .then(function (r) {
        return r.json();
      })
      .then(function (body) {
        state.authenticated = !!(body && body.authenticated);
      });
  }

  if (els.btnReset) {
    els.btnReset.addEventListener("click", clearBoard);
  }
  if (els.btnAssemble) {
    els.btnAssemble.addEventListener("click", runAssemble);
  }
  if (els.search) {
    els.search.addEventListener("input", function (e) {
      var v = (e.target.value || "").trim();
      if (els.searchClear) els.searchClear.hidden = !v;
      clearTimeout(state.searchDebounce);
      state.searchDebounce = setTimeout(function () {
        state.query = v;
        loadPieces();
      }, 200);
    });
  }
  if (els.searchClear) {
    els.searchClear.addEventListener("click", function () {
      els.search.value = "";
      els.searchClear.hidden = true;
      state.query = "";
      loadPieces();
    });
  }

  window.PokePonAssembly = {
    onPanelShown: function () {
      apiFetch("/api/me")
        .then(function (r) {
          return r.json();
        })
        .then(function (body) {
          state.authenticated = !!(body && body.authenticated);
          if (!state.authenticated) return;
          loadPieces();
          renderBoard();
          updateActions();
        });
    },
    setAuthenticated: function (on) {
      state.authenticated = !!on;
    },
  };

  bootAssemblyAuth();
})();
