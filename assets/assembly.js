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
    boardComplete: false,
    searchDebounce: 0,
    inflight: null,
  };

  function setPickerStatus(kind, text) {
    if (!els.pickerStatus) return;
    if (!text) {
      els.pickerStatus.hidden = true;
      els.pickerStatus.innerHTML = "";
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

  function collectorSortKey(num) {
    var s = String(num == null ? "" : num).trim();
    var n = parseInt(s, 10);
    return isNaN(n) ? s : n;
  }

  function cardSubline(card) {
    card = card || {};
    var set = card.set_name || card.set_code || "";
    var num = card.collector_number != null ? card.collector_number : "?";
    return (set ? set + " · " : "") + "#" + num;
  }

  function isVunionName(name) {
    return String(name || "").toLowerCase().indexOf("v-union") >= 0;
  }

  function isAssemblyEligibleRow(row) {
    if (!row) return false;
    if ((row.source || "").toLowerCase() === "assembly") return false;
    if (row.assembly && row.assembly.role === "piece") return true;
    if (row.assembly && row.assembly.slot_index != null) return true;
    return isVunionName(row.card && row.card.name);
  }

  function buildPiecesFromCollectionRows(rows) {
    var groups = {};
    rows.forEach(function (row) {
      if (!isAssemblyEligibleRow(row)) return;
      var card = row.card || {};
      var key = String(card.set_code || "") + "\0" + String(card.name || "").trim();
      if (!groups[key]) groups[key] = [];
      groups[key].push(row);
    });

    var items = [];
    Object.keys(groups).forEach(function (key) {
      var grp = groups[key].slice().sort(function (a, b) {
        return (
          collectorSortKey(a.card && a.card.collector_number) -
          collectorSortKey(b.card && b.card.collector_number)
        );
      });
      var pieceCount = grp.length >= 4 ? 4 : grp.length;
      var layout = pieceCount === 2 ? "horizontal_halves" : "quad";
      grp.forEach(function (row, idx) {
        var card = row.card || {};
        var asm = row.assembly || {};
        items.push({
          public_id: row.public_id,
          obtained_at: row.obtained_at,
          sell_blocked: row.sell && row.sell.blocked_reason,
          assembly: {
            group_id: asm.group_id != null ? asm.group_id : key,
            group_code: asm.group_code || key,
            display_name: asm.display_name || card.name || "Assembly",
            slot_index: asm.slot_index != null ? asm.slot_index : idx,
            piece_count: asm.piece_count != null ? asm.piece_count : pieceCount,
            layout: asm.layout || layout,
            orientation: asm.orientation || "portrait",
          },
          card: {
            name: card.name,
            set_code: card.set_code,
            set_name: card.set_name,
            collector_number: card.collector_number,
            image_small_url: card.image_small_url,
            image_large_url: card.image_large_url,
            rarity: card.rarity || {},
          },
        });
      });
    });
    return items;
  }

  function sameAssemblyGroup(a, b) {
    if (!a || !b) return false;
    return String(a.group_id) === String(b.group_id);
  }

  function filterItemsForAnchor(items) {
    if (!state.anchorPublicId) return items;
    var anchor = null;
    for (var i = 0; i < items.length; i++) {
      if (items[i].public_id === state.anchorPublicId) {
        anchor = items[i];
        break;
      }
    }
    if (!anchor || !anchor.assembly) return items;
    var gid = anchor.assembly;
    var anchorSlot = anchor.assembly.slot_index;
    return items.filter(function (it) {
      if (!it.assembly) return false;
      if (it.public_id === state.anchorPublicId) return false;
      if (!sameAssemblyGroup(it.assembly, gid)) return false;
      return it.assembly.slot_index !== anchorSlot;
    });
  }

  /** Remove copies already placed on the assembly board (not only the anchor). */
  function filterPlacedOnBoard(items) {
    var placedIds = {};
    var filledSlots = {};
    Object.keys(state.slots).forEach(function (key) {
      var it = state.slots[key];
      if (!it) return;
      if (it.public_id) placedIds[it.public_id] = true;
      filledSlots[key] = true;
    });
    return items.filter(function (it) {
      if (it.public_id && placedIds[it.public_id]) return false;
      if (
        it.assembly &&
        it.assembly.slot_index != null &&
        filledSlots[String(it.assembly.slot_index)]
      ) {
        return false;
      }
      return true;
    });
  }

  function applyPickerFilters(items) {
    return sortPiecesAz(filterPlacedOnBoard(filterItemsForAnchor(items)));
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

  function defaultSlotLayout(count, layout) {
    var slots = [];
    var i;
    for (i = 0; i < count; i++) {
      var col = i % 2;
      var row = Math.floor(i / 2);
      if (layout === "horizontal_halves") {
        col = i;
        row = 0;
      }
      slots.push({
        slot_index: i,
        grid_col: col,
        grid_row: row,
        rotation_deg: 0,
      });
    }
    return slots;
  }

  function slotIndexFromItem(item, fallbackKey) {
    if (item && item.assembly && item.assembly.slot_index != null) {
      return Number(item.assembly.slot_index);
    }
    return Number(fallbackKey);
  }

  function buildPuzzleCells(group, slotSnapshot, consumedPieces) {
    var layout = (group && group.layout) || "quad";
    var count = (group && group.piece_count) || 4;
    var slotDefs =
      group && group.slots && group.slots.length >= count
        ? group.slots
        : defaultSlotLayout(count, layout);

    var imagesBySlot = {};

    if (Array.isArray(consumedPieces) && consumedPieces.length) {
      consumedPieces.forEach(function (p) {
        var url = p.image_large_url || p.image_small_url || "";
        if (url) imagesBySlot[Number(p.slot_index)] = url;
      });
    }

    Object.keys(slotSnapshot || {}).forEach(function (key) {
      var item = slotSnapshot[key];
      if (!item || !item.card) return;
      var idx = slotIndexFromItem(item, key);
      var url = item.card.image_large_url || item.card.image_small_url || "";
      if (url) imagesBySlot[idx] = url;
    });

    slotDefs.forEach(function (def) {
      var idx = Number(def.slot_index);
      if (imagesBySlot[idx]) return;
      var url = def.image_large_url || def.image_small_url || "";
      if (url) imagesBySlot[idx] = url;
    });

    return slotDefs.map(function (def) {
      var idx = Number(def.slot_index);
      return {
        slot_index: idx,
        grid_col: def.grid_col != null ? Number(def.grid_col) : idx % 2,
        grid_row:
          def.grid_row != null
            ? Number(def.grid_row)
            : layout === "horizontal_halves"
              ? 0
              : Math.floor(idx / 2),
        rotation_deg: def.rotation_deg || 0,
        imageUrl: imagesBySlot[idx] || "",
      };
    });
  }

  function puzzleCropPositions(count, layout) {
    if (layout === "horizontal_halves") {
      return ["0% 50%", "100% 50%"];
    }
    return ["0% 0%", "100% 0%", "0% 100%", "100% 100%"].slice(0, count);
  }

  function renderBoardComplete(group, slotSnapshot, meta, consumedPieces) {
    if (!els.board || !group) return;
    state.boardComplete = true;
    state.group = group;

    var layout = group.layout || "quad";
    var orient = group.orientation || "portrait";
    var cells = buildPuzzleCells(group, slotSnapshot, consumedPieces);
    var urls = cells.map(function (c) {
      return c.imageUrl;
    });
    var sameImage =
      urls.length > 1 && urls[0] && urls.every(function (u) {
        return u === urls[0];
      });
    var cropPos = puzzleCropPositions(cells.length, layout);

    els.board.className =
      "assembly-board layout-" +
      layout +
      " orientation-" +
      orient +
      " is-complete";

    var html = '<div class="assembly-puzzle">';
    cells.forEach(function (cell) {
      var imgClass = "assembly-puzzle-img";
      if (sameImage) imgClass += " is-crop-quadrant";
      var pos = sameImage ? cropPos[cell.slot_index] || "50% 50%" : "";
      var posStyle = pos ? "object-position:" + pos + ";" : "";
      html +=
        '<div class="assembly-puzzle-cell" data-slot="' +
        cell.slot_index +
        '" style="grid-column:' +
        (cell.grid_col + 1) +
        ";grid-row:" +
        (cell.grid_row + 1) +
        '">' +
        (cell.imageUrl
          ? '<img class="' +
            imgClass +
            '" src="' +
            escapeHtml(cell.imageUrl) +
            '" alt="" style="transform:rotate(' +
            cell.rotation_deg +
            "deg);" +
            posStyle +
            '">'
          : "") +
        "</div>";
    });
    html += "</div>";
    els.board.innerHTML = html;

    if (els.boardMeta) {
      els.boardMeta.hidden = false;
      els.boardMeta.innerHTML =
        "<strong>" +
        escapeHtml(meta.name || group.display_name || "Card") +
        "</strong> assembled · " +
        escapeHtml(meta.subline || "Pieces consumed") +
        ' · <a href="/collection/">View collection</a>' +
        (meta.metaLine ? "<br><span class=\"muted\">" + escapeHtml(meta.metaLine) + "</span>" : "");
    }
  }

  function renderBoard() {
    if (!els.board) return;
    if (state.boardComplete) return;
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
      var filled = state.slots[String(idx)];
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

    var need = g.piece_count || g.slots.length;
    var allFilled = slotCountFilled() >= need;
    if (g.result && g.result.image_large_url && !allFilled) {
      html +=
        '<div class="assembly-result-ghost" aria-hidden="true"><img src="' +
        escapeHtml(g.result.image_large_url) +
        '" alt=""></div>';
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
          if (res.body && res.body.message) {
            setAssemblyMsg("error", res.body.message);
          }
          updateActions();
          return;
        }
        state.quoteCost = res.body.cost;
        if (res.body.group) state.group = res.body.group;
        renderBoard();
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
    state.boardComplete = false;
    renderBoard();
    updateActions();
    setAssemblyMsg("", "");
    if (els.pickerLead) {
      els.pickerLead.textContent =
        "Cards in your collection that are part of a multi-card puzzle (V-UNION and configured sets).";
    }
    loadPieces();
  }

  function ensureGroupSlotsFromItem(item) {
    if (!state.group) {
      var asm = item.assembly || {};
      state.group = {
        display_name: asm.display_name || (item.card && item.card.name) || "Assembly",
        piece_count: asm.piece_count || 4,
        layout: asm.layout || "quad",
        orientation: asm.orientation || "portrait",
        slots: [],
        result: null,
      };
    }
    if (!state.group.slots || !state.group.slots.length) {
      var pc = state.group.piece_count || 4;
      var layout = state.group.layout || "quad";
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
  }

  function placePiece(item) {
    var asm = item.assembly || {};
    var slot = asm.slot_index;
    if (slot == null) return;

    state.boardComplete = false;

    if (!state.anchorPublicId) {
      state.anchorPublicId = item.public_id;
      state.group = null;
      if (els.pickerLead) {
        els.pickerLead.textContent =
          "Now pick the other piece(s) for " +
          (asm.display_name || (item.card && item.card.name) || "this card") +
          ".";
      }
    }

    ensureGroupSlotsFromItem(item);
    state.slots[String(slot)] = item;
    renderBoard();
    if (state.items.length) {
      renderGrid(applyPickerFilters(state.items));
    }
    loadPieces();
    fetchQuote();
  }

  function buildAssemblyTile(item, items) {
    var card = item.card || {};
    var asm = item.assembly || {};
    var blocked = item.sell_blocked;
    var slotLabel = "Piece " + (Number(asm.slot_index) + 1);

    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "card-tile assembly-tile picker-tile craft-picker-tile";
    btn.dataset.publicId = item.public_id;
    btn.dataset.slot = String(asm.slot_index);

    var slotKey = String(asm.slot_index);
    var alreadyPlaced =
      state.slots[slotKey] ||
      Object.keys(state.slots).some(function (k) {
        var onBoard = state.slots[k];
        return onBoard && onBoard.public_id === item.public_id;
      });
    if (blocked || alreadyPlaced) {
      btn.classList.add("is-disabled");
      btn.disabled = true;
    }

    var img = document.createElement("img");
    img.loading = "lazy";
    img.decoding = "async";
    img.alt = card.name || "Card";
    img.className = "card-tile-img";
    img.src = card.image_small_url || card.image_large_url || "";

    var meta = document.createElement("div");
    meta.className = "card-tile-meta";
    meta.innerHTML =
      '<span class="card-tile-name">' +
      escapeHtml(card.name || "") +
      '</span><span class="card-tile-sub">' +
      escapeHtml(slotLabel) +
      " · " +
      escapeHtml(cardSubline(card)) +
      "</span>";

    btn.appendChild(img);
    btn.appendChild(meta);

    if (!btn.disabled) {
      btn.addEventListener("click", function () {
        var pid = btn.dataset.publicId;
        var picked = items.find(function (it) {
          return it.public_id === pid;
        });
        if (!picked) return;
        if (state.slots[btn.dataset.slot]) return;
        btn.classList.add("is-flying");
        setTimeout(function () {
          placePiece(picked);
        }, 280);
      });
    }

    return btn;
  }

  function renderGrid(items) {
    if (!els.grid) return;
    items = sortPiecesAz(items);
    els.grid.innerHTML = "";

    if (!items.length) {
      els.grid.innerHTML =
        '<p class="grid-empty muted">No assembly pieces in your collection. V-UNION cards (name contains “V-UNION”) and puzzle pieces from drops appear here.</p>';
      return;
    }

    var frag = document.createDocumentFragment();
    items.forEach(function (item) {
      frag.appendChild(buildAssemblyTile(item, items));
    });
    els.grid.appendChild(frag);
  }

  function finishLoad(items, seq, sourceLabel) {
    if (seq !== loadSeq) return;
    state.inflight = null;
    state.items = applyPickerFilters(items);
    items = state.items;

    if (!items.length) {
      setPickerStatus(
        "warn",
        state.anchorPublicId
          ? "No compatible pieces left for this assembly."
          : "No assembly pieces found. Try searching “Greninja” or “V-UNION”."
      );
    } else {
      var hint = sourceLabel ? " (" + sourceLabel + ")" : "";
      setPickerStatus("info", items.length + " piece(s)" + hint);
    }

    if (
      !state.boardComplete &&
      state.anchorPublicId &&
      items.length &&
      items[0].assembly
    ) {
      ensureGroupSlotsFromItem(items[0]);
      renderBoard();
    }

    renderGrid(state.items);
  }

  function fetchCollectionAssemblyPieces(seq) {
    var qs = new URLSearchParams();
    qs.set("assembly_pieces", "1");
    qs.set("page", "1");
    qs.set("page_size", "120");
    qs.set("sort", "name");
    if (state.query) qs.set("q", state.query);
    if (state.anchorPublicId) qs.set("anchor", state.anchorPublicId);

    return apiFetch("/api/me/collection?" + qs.toString())
      .then(function (r) {
        return r.json().then(function (body) {
          return { ok: r.ok, body: body };
        });
      })
      .then(function (res) {
        if (!res.ok) return [];
        var items = res.body && Array.isArray(res.body.items) ? res.body.items : [];
        if (items.length && items[0].assembly) return items;
        return [];
      })
      .catch(function () {
        return [];
      });
  }

  function fetchCollectionVunionFallback(seq) {
    var qs = new URLSearchParams();
    qs.set("page", "1");
    qs.set("page_size", "120");
    qs.set("sort", "name");
    qs.set("q", state.query || "v-union");
    if (state.anchorPublicId) {
      /* anchor filter is client-side after full load */
    }

    return apiFetch("/api/me/collection?" + qs.toString())
      .then(function (r) {
        return r.json().then(function (body) {
          return { ok: r.ok, body: body };
        });
      })
      .then(function (res) {
        if (!res.ok) return [];
        var rows = res.body && Array.isArray(res.body.items) ? res.body.items : [];
        return buildPiecesFromCollectionRows(rows);
      })
      .catch(function () {
        return [];
      });
  }

  var loadSeq = 0;

  function loadPieces() {
    if (!state.authenticated) return;
    var seq = ++loadSeq;
    if (state.inflight) state.inflight.abort();
    var ctrl = new AbortController();
    state.inflight = ctrl;

    setPickerStatus("info", "Loading pieces…");

    var qs = new URLSearchParams();
    if (state.query) qs.set("q", state.query);
    if (state.anchorPublicId) qs.set("anchor", state.anchorPublicId);

    apiFetch("/api/me/assembly/pieces?" + qs.toString(), { signal: ctrl.signal })
      .then(function (r) {
        return r.json().then(function (body) {
          return { ok: r.ok, status: r.status, body: body };
        });
      })
      .then(function (res) {
        if (ctrl.signal.aborted || seq !== loadSeq) return Promise.reject({ aborted: true });

        var items = [];
        if (res.ok && res.body && Array.isArray(res.body.items)) {
          items = res.body.items;
        }

        if (items.length) {
          finishLoad(items, seq, "assembly");
          return;
        }

        return fetchCollectionAssemblyPieces(seq).then(function (fromCol) {
          if (fromCol.length) {
            finishLoad(fromCol, seq, "collection");
            return;
          }
          return fetchCollectionVunionFallback(seq).then(function (built) {
            finishLoad(built, seq, built.length ? "search" : "");
          });
        });
      })
      .catch(function (err) {
        if (err && err.aborted) return;
        if (seq !== loadSeq) return;
        state.inflight = null;
        fetchCollectionVunionFallback(seq).then(function (built) {
          if (built.length) {
            finishLoad(built, seq, "search");
            return;
          }
          setPickerStatus("error", "Could not load assembly pieces.");
          if (els.grid) {
            els.grid.innerHTML =
              '<p class="grid-empty muted">Network error — try again.</p>';
          }
        });
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
        var group = res.body.group || state.group;
        var slotSnapshot = Object.assign({}, state.slots);
        if (group && group.slots && group.slots.length) {
          state.group = group;
        } else {
          ensureGroupSlotsFromItem(slotSnapshot[Object.keys(slotSnapshot)[0]] || {});
        }
        var displayName =
          (res.body.card && res.body.card.name) ||
          (group && group.display_name) ||
          "Card";
        renderBoardComplete(
          state.group,
          slotSnapshot,
          {
            name: displayName,
            subline: "Pieces consumed",
            metaLine:
              "Paid ₽" +
              String(res.body.cost || 0) +
              " · Balance ₽" +
              String(res.body.new_balance != null ? res.body.new_balance : "—"),
          },
          res.body.consumed_pieces
        );
        state.slots = {};
        state.anchorPublicId = null;
        state.quoteCost = null;
        if (els.btnAssemble) els.btnAssemble.disabled = true;
        if (window.PokePonApp && window.PokePonApp.notifyBalancesChanged) {
          window.PokePonApp.notifyBalancesChanged();
        }
        loadPieces();
      })
      .catch(function () {
        state.assembling = false;
        setAssemblyMsg("error", "Network error — try again.");
        updateActions();
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
      if (state.authenticated) {
        loadPieces();
        renderBoard();
        updateActions();
        return;
      }
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
      if (on) loadPieces();
    },
    loadPieces: loadPieces,
  };

  apiFetch("/api/me")
    .then(function (r) {
      return r.json();
    })
    .then(function (body) {
      if (body && body.authenticated) {
        state.authenticated = true;
      }
    })
    .catch(function () {});
})();
