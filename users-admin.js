// ============================
// DiaTech – Admin user management (Settings)
// ============================
(function (global) {
  const PAGE_OPTIONS = [
    { file: "index.html", label: "Dashboard" },
    { file: "tickets.html", label: "Tickets" },
    { file: "departments.html", label: "Départements" },
    { file: "devices.html", label: "Devices" },
    { file: "inventory.html", label: "Inventory" },
    { file: "budget.html", label: "Budget" },
    { file: "alerts.html", label: "Alerts" },
    { file: "reports.html", label: "Reports" },
    { file: "it-analytics.html", label: "IT Analytics" },
  ];

  function initialsFromName(name) {
    const parts = String(name).trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "??";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  const AVATAR_COLORS = ["#8b5cf6", "#3b82f6", "#10b981", "#f59e0b", "#ec4899", "#6366f1", "#14b8a6"];

  function pickColor(id) {
    return AVATAR_COLORS[id % AVATAR_COLORS.length];
  }

  function pagesSummary(u) {
    if (u.roles && u.roles.includes("admin")) return "All (admin)";
    const eff = typeof getEffectiveAllowedPages === "function" ? getEffectiveAllowedPages(u) : null;
    if (!eff || eff.length === 0) return "Default";
    if (eff.length >= (typeof DEFAULT_AGENT_PAGES !== "undefined" ? DEFAULT_AGENT_PAGES.length : 6))
      return "All modules";
    return eff.length + " modules";
  }

  function renderTable() {
    const tbody = document.getElementById("users-admin-body");
    if (!tbody) return;
    const me = typeof getCurrentUser === "function" ? getCurrentUser() : null;
    tbody.innerHTML = DB.users
      .slice()
      .sort((a, b) => a.id - b.id)
      .map((u) => {
        const r = u.roles && u.roles.includes("admin") ? "Admin" : "Agent";
        const st = u.active ? "Active" : "Inactive";
        const rest = u.restrictions || {};
        const feats = [
          rest.canBeAssignee !== false ? "Assignee" : null,
          rest.canExportReports !== false ? "Export" : null,
          rest.canManageDepartments !== false ? "Departments+" : null,
        ]
          .filter(Boolean)
          .join(", ");
        const del =
          u.managed && u.id !== me?.id
            ? `<button type="button" class="btn-secondary btn-user-del" data-id="${u.id}" style="font-size:11px;padding:4px 10px">Remove</button>`
            : "";
        return `<tr>
          <td><strong>${escapeHtml(u.name)}</strong><div class="user-sub">${escapeHtml(u.username)}</div></td>
          <td>${r}</td>
          <td><span class="user-status ${u.active ? "on" : "off"}">${st}</span></td>
          <td>${pagesSummary(u)}</td>
          <td class="user-feats">${escapeHtml(feats || "—")}</td>
          <td class="user-actions">
            <button type="button" class="btn-primary btn-user-edit" data-id="${u.id}" style="font-size:11px;padding:4px 10px">Edit</button>
            ${del}
          </td>
        </tr>`;
      })
      .join("");
    tbody.querySelectorAll(".btn-user-edit").forEach((btn) => {
      btn.addEventListener("click", () => openModal(Number(btn.dataset.id)));
    });
    tbody.querySelectorAll(".btn-user-del").forEach((btn) => {
      btn.addEventListener("click", () => removeManagedUser(Number(btn.dataset.id)));
    });
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function openModal(userId) {
    const modal = document.getElementById("user-edit-modal");
    if (!modal) return;
    const u = typeof getUserById === "function" ? getUserById(userId) : null;
    if (!u) return;
    const me = typeof getCurrentUser === "function" ? getCurrentUser() : null;
    document.getElementById("ue-id").value = String(u.id);
    document.getElementById("ue-username").value = u.username;
    document.getElementById("ue-email").value = u.email || "";
    document.getElementById("ue-name").value = u.name;
    document.getElementById("ue-active").checked = !!u.active;
    const isAdmin = u.roles && u.roles.includes("admin");
    document.getElementById("ue-role-admin").checked = isAdmin;
    document.getElementById("ue-role-admin").disabled = u.id === me?.id;
    document.getElementById("ue-active").disabled = u.id === me?.id;

    const eff =
      typeof getEffectiveAllowedPages === "function" && !isAdmin
        ? getEffectiveAllowedPages({ ...u, allowedPages: u.allowedPages })
        : PAGE_OPTIONS.map((p) => p.file);
    PAGE_OPTIONS.forEach((p) => {
      const el = document.getElementById("ue-page-" + p.file.replace(/\./g, "-"));
      if (!el) return;
      if (isAdmin) {
        el.checked = true;
        return;
      }
      const ap = u.allowedPages;
      if (ap == null || (Array.isArray(ap) && ap.length === 0)) el.checked = true;
      else el.checked = ap.includes(p.file);
    });

    const rest = u.restrictions || {};
    document.getElementById("ue-f-assignee").checked = rest.canBeAssignee !== false;
    document.getElementById("ue-f-export").checked = rest.canExportReports !== false;
    document.getElementById("ue-f-departments").checked = rest.canManageDepartments !== false;

    document.getElementById("ue-modal-title").textContent = u.managed ? "Edit agent" : "Edit user";
    document.getElementById("ue-error").textContent = "";
    syncPagesBoxForRole();
    modal.classList.add("open");
  }

  function closeModal() {
    document.getElementById("user-edit-modal")?.classList.remove("open");
  }

  function syncPagesBoxForRole() {
    const box = document.getElementById("ue-pages-box");
    if (!box) return;
    const isAdm = !!document.getElementById("ue-role-admin")?.checked;
    box.style.opacity = isAdm ? "0.5" : "1";
    box.style.pointerEvents = isAdm ? "none" : "auto";
  }

  function readPagesFromForm(isAdmin) {
    if (isAdmin) return undefined;
    const files = PAGE_OPTIONS.filter((p) => {
      const el = document.getElementById("ue-page-" + p.file.replace(/\./g, "-"));
      return el && el.checked;
    }).map((p) => p.file);
    if (files.length === 0) return ["index.html"];
    if (files.length === PAGE_OPTIONS.length) return [];
    return files;
  }

  function saveModal() {
    const err = document.getElementById("ue-error");
    err.textContent = "";
    const id = Number(document.getElementById("ue-id").value);
    const me = typeof getCurrentUser === "function" ? getCurrentUser() : null;
    const u = typeof getUserById === "function" ? getUserById(id) : null;
    if (!u) {
      err.textContent = "User not found.";
      return;
    }

    const username = document.getElementById("ue-username").value.trim().toLowerCase();
    const email = document.getElementById("ue-email").value.trim();
    const name = document.getElementById("ue-name").value.trim();
    const active = document.getElementById("ue-active").checked;
    const wantAdmin = document.getElementById("ue-role-admin").checked;

    if (!username || !name) {
      err.textContent = "Username and display name are required.";
      return;
    }
    const taken = DB.users.some((x) => x.id !== id && x.username.toLowerCase() === username);
    if (taken) {
      err.textContent = "That username is already in use.";
      return;
    }

    if (id === me?.id) {
      if (!active) {
        err.textContent = "You cannot deactivate your own account.";
        return;
      }
      if (!wantAdmin && me.roles?.includes("admin")) {
        err.textContent = "You cannot remove your own admin role.";
        return;
      }
    }

    const roles = wantAdmin ? ["agent", "admin"] : ["agent"];
    const isAdmin = wantAdmin;

    const restrictions = {
      canBeAssignee: document.getElementById("ue-f-assignee").checked,
      canExportReports: document.getElementById("ue-f-export").checked,
      canManageDepartments: document.getElementById("ue-f-departments").checked,
    };

    const patch = {
      id,
      username,
      email: email || username + "@nexusops.example",
      name,
      initials: initialsFromName(name),
      roles,
      active,
      restrictions,
    };

    if (isAdmin) {
      patch.allowedPages = null;
    } else {
      patch.allowedPages = readPagesFromForm(false);
    }

    if (typeof saveUserPatch === "function") saveUserPatch(patch);
    closeModal();
    renderTable();
  }

  function openCreateModal() {
    const modal = document.getElementById("user-edit-modal");
    if (!modal) return;
    document.getElementById("ue-modal-title").textContent = "Create agent account";
    document.getElementById("ue-id").value = "";
    document.getElementById("ue-username").value = "";
    document.getElementById("ue-email").value = "";
    document.getElementById("ue-name").value = "";
    document.getElementById("ue-active").checked = true;
    document.getElementById("ue-role-admin").checked = false;
    document.getElementById("ue-role-admin").disabled = false;
    document.getElementById("ue-active").disabled = false;
    PAGE_OPTIONS.forEach((p) => {
      const el = document.getElementById("ue-page-" + p.file.replace(/\./g, "-"));
      if (el) el.checked = true;
    });
    document.getElementById("ue-f-assignee").checked = true;
    document.getElementById("ue-f-export").checked = true;
    document.getElementById("ue-f-departments").checked = true;
    document.getElementById("ue-error").textContent = "";
    syncPagesBoxForRole();
    modal.classList.add("open");
  }

  function saveCreate() {
    const err = document.getElementById("ue-error");
    err.textContent = "";
    const username = document.getElementById("ue-username").value.trim().toLowerCase();
    const email = document.getElementById("ue-email").value.trim();
    const name = document.getElementById("ue-name").value.trim();
    if (!username || !name) {
      err.textContent = "Username and display name are required.";
      return;
    }
    if (DB.users.some((x) => x.username.toLowerCase() === username)) {
      err.textContent = "That username is already in use.";
      return;
    }

    const id = typeof nextUserId === "function" ? nextUserId() : DB.users.length + 100;
    const wantAdmin = document.getElementById("ue-role-admin").checked;
    const roles = wantAdmin ? ["agent", "admin"] : ["agent"];
    const isAdmin = wantAdmin;

    const restrictions = {
      canBeAssignee: document.getElementById("ue-f-assignee").checked,
      canExportReports: document.getElementById("ue-f-export").checked,
      canManageDepartments: document.getElementById("ue-f-departments").checked,
    };

    const user = {
      id,
      username,
      email: email || username + "@nexusops.example",
      name,
      initials: initialsFromName(name),
      avatarColor: pickColor(id),
      roles,
      active: true,
      authProvider: null,
      managed: true,
      restrictions,
      allowedPages: isAdmin ? null : readPagesFromForm(false),
    };

    if (typeof saveUserPatch === "function") saveUserPatch(user);
    closeModal();
    renderTable();
  }

  function removeManagedUser(userId) {
    const u = typeof getUserById === "function" ? getUserById(userId) : null;
    if (!u || !u.managed) return;
    if (!confirm("Remove this agent account? They will no longer be able to sign in.")) return;
    if (typeof deleteUserPatch === "function") deleteUserPatch(userId);
    const i = DB.users.findIndex((x) => x.id === userId);
    if (i >= 0) DB.users.splice(i, 1);
    renderTable();
  }

  function init() {
    const tbody = document.getElementById("users-admin-body");
    if (!tbody) return;
    renderTable();
    document.getElementById("btn-create-agent")?.addEventListener("click", openCreateModal);
    document.getElementById("user-modal-cancel")?.addEventListener("click", closeModal);
    document.getElementById("user-edit-modal")?.addEventListener("click", (e) => {
      if (e.target.id === "user-edit-modal") closeModal();
    });
    document.getElementById("user-modal-save")?.addEventListener("click", () => {
      const id = document.getElementById("ue-id").value;
      if (id) saveModal();
      else saveCreate();
    });
    document.getElementById("ue-role-admin")?.addEventListener("change", syncPagesBoxForRole);
  }

  global.UsersAdmin = { init, renderTable };
})(typeof window !== "undefined" ? window : this);

