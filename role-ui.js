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

  function navFileVisibleForRole(file, role) {
    if (role === "admin") return true;
    if (role === "agent") {
      return ["index.html", "tickets.html", "devices.html"].includes(file);
    }
    if (role === "user") {
      return !["inventory.html", "it-analytics.html", "settings.html"].includes(file);
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
    return global.currentUserRole === "admin";
  }

  function canUpdateTicketStatus() {
    syncCurrentUserRole();
    const r = global.currentUserRole;
    return r === "admin" || r === "agent";
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
  };
})(typeof window !== "undefined" ? window : this);
