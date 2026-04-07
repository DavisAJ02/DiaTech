/**
 * DiaTech — cycle de vie des tickets (Phase 1).
 * Statuts canoniques : open → in-progress → pending-requester → resolved → closed
 */
(function (global) {
  var STATUSES = ["open", "in-progress", "pending-requester", "resolved", "closed"];

  var ALIASES = {
    pending: "pending-requester",
    in_progress: "in-progress",
    done: "resolved",
    complete: "resolved",
    completed: "resolved",
    cancelled: "closed",
    canceled: "closed",
  };

  var LABELS = {
    open: "Open",
    "in-progress": "In Progress",
    "pending-requester": "Waiting on requester",
    resolved: "Resolved",
    closed: "Closed",
  };

  function normalizeTicketStatus(raw) {
    var s = String(raw == null ? "open" : raw)
      .trim()
      .toLowerCase()
      .replace(/_/g, "-");
    if (STATUSES.indexOf(s) >= 0) return s;
    if (Object.prototype.hasOwnProperty.call(ALIASES, s)) return ALIASES[s];
    return "";
  }

  function isAllowedTicketStatus(raw) {
    return normalizeTicketStatus(raw) !== "";
  }

  function isTerminalTicketStatus(raw) {
    var n = normalizeTicketStatus(raw || "open");
    return n === "resolved" || n === "closed";
  }

  function statusLabel(raw) {
    var n = normalizeTicketStatus(raw || "open");
    return LABELS[n] || (n ? n : "Open");
  }

  function getStatusSelectOptions() {
    return STATUSES.map(function (v) {
      return { value: v, label: LABELS[v] || v };
    });
  }

  /** Pour onglets : terminé = resolved ou closed */
  function isDoneTabStatus(raw) {
    var n = normalizeTicketStatus(raw || "");
    return n === "resolved" || n === "closed";
  }

  global.DiaTechTicketWorkflow = {
    STATUSES: STATUSES.slice(),
    normalizeTicketStatus: normalizeTicketStatus,
    isAllowedTicketStatus: isAllowedTicketStatus,
    isTerminalTicketStatus: isTerminalTicketStatus,
    statusLabel: statusLabel,
    getStatusSelectOptions: getStatusSelectOptions,
    isDoneTabStatus: isDoneTabStatus,
  };
})(typeof window !== "undefined" ? window : globalThis);
