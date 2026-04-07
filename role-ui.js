/**
 * DiaTech — rôles profil (admin | agent | user) pour le rendu UI.
 * S’appuie sur getPrimaryProfileRole() (data.js) et window.currentUserRole.
 *
 * Matrice navigation (fichiers .html) :
 * - admin : tout
 * - agent : index, tickets, devices uniquement
 * - user : tout sauf inventory, it-analytics, settings
 * (Aligné avec userCanAccessPage dans data.js.)
 */
(function (global) {
  function syncCurrentUserRole() {
    if (typeof getPrimaryProfileRole === "function") {
      global.currentUserRole = getPrimaryProfileRole();
      return;
    }
    global.currentUserRole = "user";
  }

  function hasRole(role) {
    syncCurrentUserRole();
    return global.currentUserRole === role;
  }

  function isAdmin() {
    return hasRole("admin");
  }

  function isAgent() {
    return hasRole("agent");
  }

  function isUser() {
    return hasRole("user");
  }

  function profileUserExcludedFiles() {
    const x = global.DIATECH_PROFILE_USER_EXCLUDED;
    if (Array.isArray(x) && x.length)
      return x.map((p) => String(p).toLowerCase());
    return ["inventory.html", "it-analytics.html", "settings.html"];
  }

  function navFileVisibleForRole(file, role) {
    if (role === "admin") return true;
    if (typeof global.getEffectiveAllowedPages === "function" && typeof global.Auth !== "undefined") {
      const u = Auth.currentUser();
      if (u) {
        const eff = getEffectiveAllowedPages(u);
        if (eff === null) return true;
        const fl = String(file).toLowerCase();
        return eff.some((x) => String(x).toLowerCase() === fl);
      }
    }
    if (role === "agent") {
      return ["index.html", "tickets.html", "devices.html"].includes(file);
    }
    if (role === "user") {
      return !profileUserExcludedFiles().includes(file);
    }
    return false;
  }

  function applySidebarNavVisibility() {
    syncCurrentUserRole();
    const role = global.currentUserRole;
    document.querySelectorAll(".sidebar-nav a[href$='.html']").forEach((el) => {
      const href = el.getAttribute("href") || "";
      const file = href.split("/").pop().toLowerCase();
      if (!file) return;
      const show = navFileVisibleForRole(file, role);
      el.hidden = !show;
      el.style.display = show ? "" : "none";
    });
  }

  function canAssignTickets() {
    syncCurrentUserRole();
    const r = global.currentUserRole;
    if (!(r === "admin" || r === "agent")) return false;
    if (
      typeof global.DB !== "undefined" &&
      DB.session &&
      DB.session.profileAppAccess &&
      DB.session.profileAppAccess.restrictions &&
      DB.session.profileAppAccess.restrictions.canBeAssignee === false
    ) {
      return false;
    }
    const u = typeof global.Auth !== "undefined" ? Auth.currentUser() : null;
    if (u && u.restrictions && u.restrictions.canBeAssignee === false) return false;
    return true;
  }

  function canUpdateTicketStatus() {
    syncCurrentUserRole();
    const r = global.currentUserRole;
    return r === "admin" || r === "agent";
  }

  /** Département + assignation : réservé staff (admin | agent). */
  function canEditTicketRoutingFields() {
    syncCurrentUserRole();
    const r = global.currentUserRole;
    return r === "admin" || r === "agent";
  }

  /** Notes internes sur ticket (Phase 2) — staff uniquement. */
  function canAddInternalTicketNotes() {
    syncCurrentUserRole();
    return global.currentUserRole === "admin" || global.currentUserRole === "agent";
  }

  global.RoleUi = {
    syncCurrentUserRole,
    hasRole,
    isAdmin,
    isAgent,
    isUser,
    applySidebarNavVisibility,
    canAssignTickets,
    canUpdateTicketStatus,
    canEditTicketRoutingFields,
    canAddInternalTicketNotes,
  };
})(typeof window !== "undefined" ? window : this);
