/* Canonical outbound links — keep in sync with Top.gg bot invite URL. */
(function () {
  "use strict";

  var BOT_INVITE =
    "https://discord.com/oauth2/authorize?client_id=1496227239803748362&permissions=268954721&integration_type=0&scope=bot+applications.commands";
  var SERVER_INVITE = "https://discord.gg/MaSEAnxTBn";
  var TOPGG_VOTE = "https://top.gg/bot/1496227239803748362/vote";
  var TOPGG_BOT = "https://top.gg/bot/1496227239803748362";

  window.POKEPON_LINKS = {
    botInvite: BOT_INVITE,
    serverInvite: SERVER_INVITE,
    topggVote: TOPGG_VOTE,
    topggBot: TOPGG_BOT,
  };

  var MAP = {
    "bot-invite": BOT_INVITE,
    "server-invite": SERVER_INVITE,
    "topgg-vote": TOPGG_VOTE,
    "topgg-bot": TOPGG_BOT,
  };

  function apply() {
    document.querySelectorAll("[data-pokepon-link]").forEach(function (el) {
      var key = el.getAttribute("data-pokepon-link");
      if (key && MAP[key]) el.href = MAP[key];
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", apply);
  } else {
    apply();
  }
})();
