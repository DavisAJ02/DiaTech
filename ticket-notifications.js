/**
 * DiaTech — Phase 4 : notifications tickets (in-app, stockage local par utilisateur).
 * Compare les snapshots de tickets pour détecter statut, assignation, nouveaux commentaires publics.
 */
(function (global) {
  var MAX_INBOX = 80;
  var wired = false;

  function actorUser() {
    return typeof getCurrentUser === "function" ? getCurrentUser() : null;
  }

  function actorRole() {
    if (typeof getPrimaryProfileRole === "function") return getPrimaryProfileRole() || "user";
    if (typeof RoleUi !== "undefined" && RoleUi.syncCurrentUserRole) RoleUi.syncCurrentUserRole();
    return typeof RoleUi !== "undefined" && RoleUi.hasRole && RoleUi.hasRole("admin")
      ? "admin"
      : typeof RoleUi !== "undefined" && RoleUi.hasRole && RoleUi.hasRole("agent")
        ? "agent"
        : "user";
  }

  function userKey() {
    var u = actorUser();
    return u && u.id != null ? String(u.id) : "guest";
  }

  function snapKey() {
    return "diatech_ticket_snap_v1_" + userKey();
  }

  function inboxStorageKey() {
    return "diatech_inbox_v1_" + userKey();
  }

  function normEmail(u) {
    return String((u && u.email) || "").trim().toLowerCase();
  }

  function ticketMatchesCreatedBy(t, u) {
    if (!u) return false;
    var uid = Number(u.id);
    if (Number.isFinite(uid) && uid > 0) {
      if (t.createdByUserId != null && Number(t.createdByUserId) === uid) return true;
    }
    var em = normEmail(u);
    if (!em) return false;
    var fields = [t.createdByEmail, t.requesterEmail, t.created_by_email, t.requester_user_email];
    for (var i = 0; i < fields.length; i++) {
      if (String(fields[i] || "").trim().toLowerCase() === em) return true;
    }
    return false;
  }

  function ticketMatchesAssignedTo(t, u) {
    if (!u || u.id == null) return false;
    var uid = Number(u.id);
    if (!Number.isFinite(uid) || uid <= 0) return false;
    return Number(t.assignedUserId) === uid;
  }

  function shouldWatchTicket(t, role, u) {
    if (!u) return false;
    if (role === "user") return ticketMatchesCreatedBy(t, u);
    if (role === "agent") return ticketMatchesAssignedTo(t, u) || ticketMatchesCreatedBy(t, u);
    if (role === "admin") return ticketMatchesAssignedTo(t, u) || ticketMatchesCreatedBy(t, u);
    return false;
  }

  function normStatus(s) {
    var W = global.DiaTechTicketWorkflow;
    if (W && typeof W.normalizeTicketStatus === "function") {
      var n = W.normalizeTicketStatus(s);
      if (n) return n;
    }
    var x = String(s == null ? "open" : s)
      .trim()
      .toLowerCase()
      .replace(/_/g, "-");
    if (
      ["open", "in-progress", "pending-requester", "resolved", "closed"].indexOf(x) >= 0
    )
      return x;
    return "open";
  }

  function statusPhrase(st) {
    var W = global.DiaTechTicketWorkflow;
    if (W && typeof W.statusLabel === "function") return W.statusLabel(st);
    return st;
  }

  function publicComments(t) {
    var c = Array.isArray(t.ticketComments) ? t.ticketComments : [];
    var out = [];
    for (var i = 0; i < c.length; i++) {
      if (c[i] && c[i].kind !== "internal") out.push(c[i]);
    }
    return out;
  }

  function fingerprint(t) {
    var pub = publicComments(t);
    var last = pub.length ? pub[pub.length - 1] : null;
    return {
      st: normStatus(t.status),
      asg: t.assignedUserId != null ? Number(t.assignedUserId) : null,
      n: pub.length,
      lat: last && last.at ? String(last.at) : "",
      lem: last && last.authorEmail ? String(last.authorEmail).trim().toLowerCase() : "",
    };
  }

  function loadSnap() {
    try {
      var raw = sessionStorage.getItem(snapKey());
      if (!raw) return {};
      var j = JSON.parse(raw);
      return j && typeof j === "object" ? j : {};
    } catch (_e) {
      return {};
    }
  }

  function saveSnap(obj) {
    try {
      sessionStorage.setItem(snapKey(), JSON.stringify(obj));
    } catch (_e) {}
  }

  function loadInbox() {
    try {
      var raw = localStorage.getItem(inboxStorageKey());
      if (!raw) return [];
      var j = JSON.parse(raw);
      return Array.isArray(j) ? j : [];
    } catch (_e) {
      return [];
    }
  }

  function saveInbox(arr) {
    try {
      localStorage.setItem(inboxStorageKey(), JSON.stringify(arr.slice(0, MAX_INBOX)));
    } catch (_e) {}
  }

  function relTime(ts) {
    var d = typeof ts === "number" ? ts : new Date(ts || Date.now()).getTime();
    var sec = Math.max(0, Math.floor((Date.now() - d) / 1000));
    if (sec < 60) return "just now";
    if (sec < 3600) return Math.floor(sec / 60) + " min ago";
    if (sec < 86400) return Math.floor(sec / 3600) + "h ago";
    return Math.floor(sec / 86400) + "d ago";
  }

  function pushInbox(entry) {
    var inbox = loadInbox();
    if (entry.dedupe && inbox.some(function (x) { return x.dedupe === entry.dedupe; })) return;
    inbox.unshift({
      id: entry.id,
      dedupe: entry.dedupe,
      text: entry.text,
      ts: entry.ts,
      unread: entry.unread !== false,
      href: entry.href || "tickets.html",
      ticketId: entry.ticketId,
    });
    saveInbox(inbox);
  }

  function describeStatusChange(t, fromSt, toSt, role, u) {
    var tid = t.id;
    var title = (t.title || "#" + tid).slice(0, 80);
    var req = ticketMatchesCreatedBy(t, u);
    var asg = ticketMatchesAssignedTo(t, u);
    if (toSt === "pending-requester" && req) {
      return "Action needed: #" + tid + " — " + title;
    }
    if (toSt === "resolved" && req) {
      return "Resolved: #" + tid + " — confirm or reopen";
    }
    if (toSt === "closed" && asg && !req) {
      return "Closed: #" + tid + " — " + title;
    }
    if (toSt === "in-progress" && req) {
      return "In progress: #" + tid + " — " + title;
    }
    if (toSt === "open" && asg && fromSt === "resolved") {
      return "Reopened: #" + tid + " — " + title;
    }
    return "#" + tid + " → " + statusPhrase(toSt) + " — " + title;
  }

  function describeAssign(t, fp, prevAsg, u) {
    var tid = t.id;
    var myId = Number(u.id);
    var title = (t.title || "#" + tid).slice(0, 80);
    if (fp.asg != null && Number(fp.asg) === myId && (prevAsg == null || Number(prevAsg) !== myId)) {
      return "Assigned to you: #" + tid + " — " + title;
    }
    if (ticketMatchesCreatedBy(t, u) && fp.asg != null && Number(fp.asg) !== Number(prevAsg)) {
      return "Assignment updated: #" + tid + " — " + title;
    }
    if (ticketMatchesAssignedTo(t, u) && fp.asg == null && prevAsg != null) {
      return "Unassigned: #" + tid + " — " + title;
    }
    return "Assignment changed: #" + tid + " — " + title;
  }

  function processTickets(tickets) {
    var u = actorUser();
    if (!u) return;
    var role = actorRole();
    var list = Array.isArray(tickets) ? tickets : [];
    var myEmail = normEmail(u);
    var prev = loadSnap();
    var next = {};
    var i;
    var id;
    var t;
    var fp;

    for (i = 0; i < list.length; i++) {
      t = list[i];
      id = Number(t.id);
      if (!Number.isFinite(id)) continue;
      next[id] = fingerprint(t);
    }

    var oldKeys = Object.keys(prev);
    var isFirst = oldKeys.length === 0;
    var overlap = 0;
    for (i = 0; i < oldKeys.length; i++) {
      if (next[oldKeys[i]] !== undefined) overlap++;
    }
    var massRefresh =
      !isFirst && oldKeys.length > 8 && overlap < oldKeys.length * 0.2;
    if (massRefresh) {
      saveSnap(next);
      return;
    }

    for (i = 0; i < list.length; i++) {
      t = list[i];
      id = Number(t.id);
      if (!Number.isFinite(id)) continue;
      fp = next[id];
      if (!shouldWatchTicket(t, role, u)) continue;
      if (isFirst) continue;

      var old = prev[id];
      var ts = Date.now();
      var uid = userKey();

      if (!old) {
        if (fp.asg != null && Number(fp.asg) === Number(u.id)) {
          pushInbox({
            id: "tn-" + ts + "-" + id + "-new",
            dedupe: uid + "|" + id + "|appear|" + fp.st,
            text: "New ticket in your queue: #" + id + " — " + (t.title || "").slice(0, 80),
            ts: ts,
            href: "tickets.html",
            ticketId: id,
          });
        }
        continue;
      }

      if (old.st !== fp.st) {
        pushInbox({
          id: "tn-" + ts + "-" + id + "-st-" + fp.st,
          dedupe: uid + "|" + id + "|st|" + old.st + "|" + fp.st,
          text: describeStatusChange(t, old.st, fp.st, role, u),
          ts: ts,
          href: "tickets.html",
          ticketId: id,
        });
      }

      if (Number(old.asg) !== Number(fp.asg) && (old.asg != null || fp.asg != null)) {
        pushInbox({
          id: "tn-" + ts + "-" + id + "-asg",
          dedupe: uid + "|" + id + "|asg|" + String(old.asg) + "|" + String(fp.asg),
          text: describeAssign(t, fp, old.asg, u),
          ts: ts,
          href: "tickets.html",
          ticketId: id,
        });
      }

      var commentAdded =
        (fp.lat && fp.lat !== old.lat) || fp.n > old.n;
      if (commentAdded && fp.lem && fp.lem !== myEmail) {
        pushInbox({
          id: "tn-" + ts + "-" + id + "-c-" + (fp.lat || fp.n),
          dedupe: uid + "|" + id + "|c|" + (fp.lat || "") + "|" + fp.n,
          text: "New reply on #" + id + " — " + (t.title || "").slice(0, 60),
          ts: ts,
          href: "tickets.html",
          ticketId: id,
        });
      }
    }

    saveSnap(next);
  }

  function getPanelRenderSlice(limit) {
    var inbox = loadInbox();
    var lim = Math.min(Number(limit) || 12, 24);
    return inbox.slice(0, lim).map(function (n) {
      return {
        id: n.id,
        text: n.text,
        time: relTime(n.ts),
        unread: !!n.unread,
        href: n.href,
        ticketId: n.ticketId,
        source: "ticket",
      };
    });
  }

  function markAllRead() {
    var inbox = loadInbox();
    for (var i = 0; i < inbox.length; i++) inbox[i].unread = false;
    saveInbox(inbox);
  }

  function escAttr(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderIntoList() {
    var list = document.getElementById("notif-list");
    if (!list) return;
    var slice = getPanelRenderSlice(24);
    if (slice.length === 0) {
      list.innerHTML =
        '<div class="notif-item"><div><div class="notif-text">No ticket notifications yet.</div><div class="notif-time">—</div></div></div>';
      return;
    }
    list.innerHTML = slice
      .map(function (n) {
        var href = n.href ? ' data-href="' + escAttr(n.href) + '" style="cursor:pointer"' : "";
        return (
          '<div class="notif-item ' +
          (n.unread ? "unread" : "") +
          '"' +
          href +
          ">" +
          (n.unread
            ? '<div class="notif-dot"></div>'
            : '<div style="width:8px;flex-shrink:0"></div>') +
          "<div><div class=\"notif-text\">" +
          escAttr(n.text) +
          "</div><div class=\"notif-time\">" +
          escAttr(n.time) +
          "</div></div></div>"
        );
      })
      .join("");
    list.querySelectorAll(".notif-item[data-href]").forEach(function (el) {
      el.addEventListener("click", function () {
        var h = el.getAttribute("data-href");
        if (h) window.location.href = h;
      });
    });
  }

  function syncBadge() {
    var badge = document.getElementById("notif-badge");
    if (!badge) return;
    var n = loadInbox().filter(function (x) { return x.unread; }).length;
    if (n === 0) {
      badge.style.display = "none";
    } else {
      badge.style.display = "flex";
      badge.textContent = String(n);
    }
  }

  function ensureNotifShell() {
    if (document.getElementById("notif-panel")) return;
    var btn = document.getElementById("notif-btn");
    if (!btn) return;
    var badge = btn.querySelector(".notification-badge");
    if (badge && !badge.id) badge.id = "notif-badge";

    var panel = document.createElement("div");
    panel.id = "notif-panel";
    panel.className = "notif-panel";
    panel.innerHTML =
      '<div class="notif-panel-header"><span>Notifications</span><button type="button" id="notif-clear">Mark all read</button></div><div class="notif-list" id="notif-list"></div>';
    var backdrop = document.createElement("div");
    backdrop.id = "notif-backdrop";
    backdrop.className = "notif-backdrop";
    backdrop.setAttribute("aria-hidden", "true");
    document.body.appendChild(panel);
    document.body.appendChild(backdrop);
  }

  function closeNotifPanel() {
    document.getElementById("notif-panel")?.classList.remove("open");
    document.getElementById("notif-backdrop")?.classList.remove("open");
    document.getElementById("notif-backdrop")?.setAttribute("aria-hidden", "true");
  }

  function wireTicketsPageHandlers() {
    if (wired) return;
    wired = true;
    var btn = document.getElementById("notif-btn");
    if (btn) {
      btn.addEventListener("click", function () {
        ensureNotifShell();
        document.getElementById("notif-panel")?.classList.add("open");
        document.getElementById("notif-backdrop")?.classList.add("open");
        document.getElementById("notif-backdrop")?.setAttribute("aria-hidden", "false");
        if (typeof global.diatechRenderNotifPanel === "function") global.diatechRenderNotifPanel();
        else renderIntoList();
      });
    }
    document.getElementById("notif-backdrop")?.addEventListener("click", closeNotifPanel);
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      if (document.getElementById("notif-panel")?.classList.contains("open")) {
        e.preventDefault();
        closeNotifPanel();
      }
    });
    document.addEventListener("click", function (e) {
      var clr = e.target.closest("#notif-clear");
      if (!clr) return;
      e.stopPropagation();
      markAllRead();
      if (typeof global.diatechOnTicketNotifMarkAllRead === "function") {
        global.diatechOnTicketNotifMarkAllRead();
      } else {
        renderIntoList();
        syncBadge();
      }
    });
  }

  function init(opts) {
    var o = opts || {};
    ensureNotifShell();
    if (o.wireClick !== false) wireTicketsPageHandlers();
    syncBadge();
  }

  global.DiaTechTicketNotifications = {
    processTickets: processTickets,
    getPanelRenderSlice: getPanelRenderSlice,
    markAllRead: markAllRead,
    syncBadge: syncBadge,
    init: init,
    renderIntoList: renderIntoList,
    ensureNotifShell: ensureNotifShell,
    relTime: relTime,
  };
})(typeof window !== "undefined" ? window : globalThis);
