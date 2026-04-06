/**
 * Cross-tab / same-tab events when server-backed data changes (tickets, inventory, etc.).
 * Requires: load before api-client.js so mutations can call diatechNotifyDataChanged.
 */
(function () {
  var LS_KEY = "diatech_sync_ping";
  var bc = null;
  try {
    bc = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("diatech-sync") : null;
  } catch (_e) {
    bc = null;
  }

  window.diatechNotifyDataChanged = function (reason) {
    var detail = { reason: reason || "unknown", t: Date.now() };
    try {
      window.dispatchEvent(new CustomEvent("diatech:data-changed", { detail: detail }));
    } catch (_e) {}
    try {
      localStorage.setItem(LS_KEY, String(detail.t));
    } catch (_e) {}
    try {
      if (bc) bc.postMessage(detail);
    } catch (_e) {}
  };

  window.addEventListener("storage", function (ev) {
    if (ev.key !== LS_KEY || ev.newValue == null) return;
    try {
      window.dispatchEvent(
        new CustomEvent("diatech:data-changed", {
          detail: { reason: "remote-tab", t: Number(ev.newValue), remoteTab: true },
        })
      );
    } catch (_e) {}
  });

  if (bc) {
    bc.onmessage = function (msg) {
      if (!msg || !msg.data) return;
      try {
        window.dispatchEvent(new CustomEvent("diatech:data-changed", { detail: msg.data }));
      } catch (_e) {}
    };
  }
})();
