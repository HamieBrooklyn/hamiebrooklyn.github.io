/* Map a focused TCG printing to a real-life sealed-product search page. */
(function (global) {
  "use strict";

  var TCGPLAYER_SEARCH =
    "https://www.tcgplayer.com/search/pokemon/product?productLineName=pokemon&view=grid&q=";

  var PROMO_CODES = {
    svp: 1,
    swshp: 1,
    smp: 1,
    xyp: 1,
    bwp: 1,
    dpp: 1,
    hsp: 1,
    basep: 1,
    np: 1,
  };

  function cardFields(input) {
    if (!input || typeof input !== "object") return { code: "", name: "" };
    var nested = input.card && typeof input.card === "object" ? input.card : null;
    var code = String((nested && nested.set_code) || input.set_code || "").trim();
    var name = String((nested && nested.set_name) || input.set_name || "").trim();
    return { code: code, name: name };
  }

  function isPromoSet(code, name) {
    var c = String(code || "").toLowerCase();
    var n = String(name || "").toLowerCase();
    if (!c && !n) return true;
    if (PROMO_CODES[c]) return true;
    if (c.indexOf("mcd") === 0) return true;
    if (/\bpromo/.test(n)) return true;
    if (/mcdonald/.test(n)) return true;
    if (/\bjumbo\b|\boversize\b/.test(n)) return true;
    return false;
  }

  function boosterSetName(setName) {
    return String(setName || "")
      .replace(/\s+(Trainer|Galarian|Pok[eé]mon|Pokemon)\s+Gallery\s*$/i, "")
      .replace(/\s+Subset\s*$/i, "")
      .trim();
  }

  function hrefFor(input) {
    var fields = cardFields(input);
    if (isPromoSet(fields.code, fields.name)) return null;
    var label = boosterSetName(fields.name) || fields.code;
    if (!label) return null;
    return TCGPLAYER_SEARCH + encodeURIComponent(label + " Booster Pack");
  }

  function apply(anchor, input) {
    if (!anchor) return null;
    var href = hrefFor(input);
    if (!href) {
      anchor.hidden = true;
      anchor.removeAttribute("href");
      return null;
    }
    var fields = cardFields(input);
    var label = boosterSetName(fields.name) || fields.code;
    anchor.hidden = false;
    anchor.href = href;
    anchor.title = "Find " + label + " booster packs on TCGPlayer";
    anchor.setAttribute(
      "aria-label",
      "Find real-life booster packs for " + label + " on TCGPlayer"
    );
    return href;
  }

  global.PokePonPackProduct = {
    hrefFor: hrefFor,
    apply: apply,
  };
})(window);
