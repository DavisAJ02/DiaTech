/**
 * DiaTech — cycle de vie des tickets (Phase 1–2).
 * Statuts : open → in-progress → pending-requester → resolved → closed
 * Phase 2 : le demandeur peut repasser en open / in-progress depuis pending-requester.
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

  var LEAVE_PENDING = ["open", "in-progress"];

  function canUserLeavePendingStatus(nextRaw) {
    var n = normalizeTicketStatus(nextRaw);
    return n !== "" && LEAVE_PENDING.indexOf(n) >= 0;
  }

  /** Options du select statut pour le rôle demandeur (lecture seule sauf sortie de « waiting »). */
  function getStatusSelectOptionsForRequester(currentRaw) {
    var cur = normalizeTicketStatus(currentRaw || "open") || "open";
    if (cur === "pending-requester") {
      return [
        { value: "pending-requester", label: LABELS["pending-requester"] + " (current)" },
        { value: "open", label: "Open — information provided" },
        { value: "in-progress", label: "In progress — resume work" },
      ];
    }
    return [{ value: cur, label: statusLabel(cur) }];
  }

  global.DiaTechTicketWorkflow = {
    STATUSES: STATUSES.slice(),
    normalizeTicketStatus: normalizeTicketStatus,
    isAllowedTicketStatus: isAllowedTicketStatus,
    isTerminalTicketStatus: isTerminalTicketStatus,
    statusLabel: statusLabel,
    getStatusSelectOptions: getStatusSelectOptions,
    isDoneTabStatus: isDoneTabStatus,
    canUserLeavePendingStatus: canUserLeavePendingStatus,
    getStatusSelectOptionsForRequester: getStatusSelectOptionsForRequester,
  };
})(typeof window !== "undefined" ? window : globalThis);
