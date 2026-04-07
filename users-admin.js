// ============================
// DiaTech – Admin user management (Settings)
// Mode Supabase : liste / CRUD via /api/admin/users (JWT admin).
// Sinon : comptes seed + localStorage (comportement historique).
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

  let _remoteUsers = [];
  let _remoteLoadError = "";

  function useRemoteAdminUsers() {
    return Boolean(
      typeof Auth !== "undefined" &&
        Auth.isSupabaseConfigured &&
        Auth.isSupabaseConfigured() &&
        typeof ApiClient !== "undefined" &&
        typeof Auth.hasRole === "function" &&
        Auth.hasRole("admin")
    );
  }

  function initialsFromName(name) {
    const parts = String(name).trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "??";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  const AVATAR_COLORS = ["#8b5cf6", "#3b82f6", "#10b981", "#f59e0b", "#ec4899", "#6366f1", "#14b8a6"];

  function pickColor(id) {
    const n = typeof id === "string" ? id.split("").reduce((a, c) => a + c.charCodeAt(0), 0) : Number(id);
    return AVATAR_COLORS[Math.abs(n) % AVATAR_COLORS.length];
  }

  function mapApiUserToRow(u) {
    const role = String(u.role || "user").toLowerCase();
    const acc = u.app_access || {};
    const restrictions = acc.restrictions || {};
    return {
      id: u.id,
      username: (u.email || "").split("@")[0] || u.id,
      email: u.email || "",
      name: u.display_name || u.email || u.id,
      initials: initialsFromName(u.display_name || u.email || "?"),
      avatarColor: pickColor(u.id),
      roles: role === "admin" ? ["agent", "admin"] : role === "agent" ? ["agent"] : ["user"],
      active: u.active !== false,
      authProvider: "supabase",
      managed: true,
      remoteSource: true,
      restrictions: {
        canBeAssignee: restrictions.canBeAssignee !== false,
        canExportReports: restrictions.canExportReports !== false,
        canManageDepartments: restrictions.canManageDepartments !== false,
      },
      allowedPages: acc.allowedPages === undefined ? null : acc.allowedPages,
      allowedDepartmentNames:
        acc.allowedDepartmentNames === undefined ? null : acc.allowedDepartmentNames,
    };
  }

  function pagesSummary(u) {
    if (u.roles && u.roles.includes("admin")) return "All (admin)";
    const eff = typeof getEffectiveAllowedPages === "function" ? getEffectiveAllowedPages(u) : null;
    if (!eff || eff.length === 0) return "Default";
    if (eff.length >= (typeof DEFAULT_AGENT_PAGES !== "undefined" ? DEFAULT_AGENT_PAGES.length : 6))
      return "All modules";
    return eff.length + " modules";
  }

  function departmentSummary(u) {
    if (u.roles && u.roles.includes("admin")) return "All";
    const s = u.allowedDepartmentNames;
    if (s == null) return "All departments";
    if (!Array.isArray(s) || s.length === 0) return "None";
    if (s.length <= 2) return s.join(", ");
    return s.length + " dept.";
  }

  function renderTable() {
    const tbody = document.getElementById("users-admin-body");
    if (!tbody) return;
    const me = typeof getCurrentUser === "function" ? getCurrentUser() : null;
    const remote = useRemoteAdminUsers();

    if (remote && _remoteLoadError) {
      tbody.innerHTML = `<tr><td colspan="6" class="ue-hint" style="padding:16px">${escapeHtml(
        _remoteLoadError
      )}</td></tr>`;
      return;
    }

    const list = remote ? _remoteUsers : DB.users.slice().sort((a, b) => String(a.id).localeCompare(String(b.id)));

    tbody.innerHTML = list
      .map((u) => {
        const r = u.roles && u.roles.includes("admin") ? "Admin" : u.roles && u.roles.includes("agent") ? "Agent" : "User";
        const st = u.active ? "Active" : "Inactive";
        const rest = u.restrictions || {};
        const feats = [
          rest.canBeAssignee !== false ? "Assignee" : null,
          rest.canExportReports !== false ? "Export" : null,
          rest.canManageDepartments !== false ? "Departments+" : null,
        ]
          .filter(Boolean)
          .join(", ");
        const mod = `${pagesSummary(u)} · ${departmentSummary(u)}`;
        const meId = me && u.remoteSource && DB.session && DB.session.supabaseUserId === u.id;
        const meLegacy = me && !u.remoteSource && u.id === me.id;
        const showDel = u.managed && !meId && !meLegacy;
        const del = showDel
          ? `<button type="button" class="btn-secondary btn-user-del" data-id="${escapeHtml(String(u.id))}" style="font-size:11px;padding:4px 10px">Remove</button>`
          : "";
        return `<tr>
          <td><strong>${escapeHtml(u.name)}</strong><div class="user-sub">${escapeHtml(u.username || u.email)}</div></td>
          <td>${r}</td>
          <td><span class="user-status ${u.active ? "on" : "off"}">${st}</span></td>
          <td>${escapeHtml(mod)}</td>
          <td class="user-feats">${escapeHtml(feats || "—")}</td>
          <td class="user-actions">
            <button type="button" class="btn-primary btn-user-edit" data-id="${escapeHtml(String(u.id))}" style="font-size:11px;padding:4px 10px">Edit</button>
            ${del}
          </td>
        </tr>`;
      })
      .join("");

    tbody.querySelectorAll(".btn-user-edit").forEach((btn) => {
      btn.addEventListener("click", () => openModal(String(btn.dataset.id)));
    });
    tbody.querySelectorAll(".btn-user-del").forEach((btn) => {
      btn.addEventListener("click", () => removeUser(String(btn.dataset.id)));
    });
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function findUserRow(id) {
    const remote = useRemoteAdminUsers();
    if (remote) return _remoteUsers.find((x) => String(x.id) === String(id)) || null;
    const n = Number(id);
    return typeof getUserById === "function" ? getUserById(Number.isFinite(n) ? n : id) : null;
  }

  function buildDepartmentGrid() {
    const host = document.getElementById("ue-departments-grid");
    if (!host) return;
    const depts = Array.isArray(global.DB?.departments) ? global.DB.departments : [];
    const names = depts.map((d) => d && d.name).filter(Boolean);
    if (!names.length) {
      host.innerHTML = '<span class="ue-hint">No departments in local data.</span>';
      return;
    }
    host.innerHTML = names
      .map(
        (name, i) =>
          `<label class="ue-page-item"><input type="checkbox" data-ue-dept-name="${escapeHtml(
            name
          )}" id="ue-dept-${i}" checked/><span>${escapeHtml(name)}</span></label>`
      )
      .join("");
    const allEl = document.getElementById("ue-departments-all");
    if (allEl) {
      allEl.onchange = () => {
        const on = allEl.checked;
        host.querySelectorAll("[data-ue-dept-name]").forEach((el) => {
          el.checked = on;
        });
      };
    }
  }

  function setDepartmentScopeOnForm(scope) {
    buildDepartmentGrid();
    const allEl = document.getElementById("ue-departments-all");
    if (scope == null || scope === undefined) {
      if (allEl) allEl.checked = true;
      document.querySelectorAll("[data-ue-dept-name]").forEach((el) => {
        el.checked = true;
      });
      return;
    }
    if (allEl) allEl.checked = false;
    document.querySelectorAll("[data-ue-dept-name]").forEach((el) => {
      const n = el.getAttribute("data-ue-dept-name");
      el.checked = Array.isArray(scope) && scope.includes(n);
    });
  }

  function readDepartmentScopeFromForm() {
    const allEl = document.getElementById("ue-departments-all");
    if (allEl && allEl.checked) return null;
    const names = [];
    document.querySelectorAll("[data-ue-dept-name]:checked").forEach((el) => {
      names.push(el.getAttribute("data-ue-dept-name"));
    });
    return names;
  }

  function setPasswordRows(mode) {
    const createRow = document.getElementById("ue-password-row");
    const resetRow = document.getElementById("ue-reset-password-row");
    const inviteRow = document.getElementById("ue-invite-row");
    const remote = useRemoteAdminUsers();
    if (inviteRow) {
      inviteRow.style.display = mode === "create" && remote ? "flex" : "none";
    }
    const inviteOn = document.getElementById("ue-invite-email")?.checked !== false;
    if (createRow) {
      createRow.style.display = mode === "create" && remote && !inviteOn ? "flex" : "none";
    }
    if (resetRow) resetRow.style.display = mode === "edit" && remote ? "flex" : "none";
    const pw = document.getElementById("ue-password");
    const npw = document.getElementById("ue-new-password");
    if (pw) pw.value = "";
    if (npw) npw.value = "";
  }

  function openModal(userId) {
    const modal = document.getElementById("user-edit-modal");
    if (!modal) return;
    const u = findUserRow(userId);
    if (!u) return;
    const me = typeof getCurrentUser === "function" ? getCurrentUser() : null;
    const remote = useRemoteAdminUsers() && u.remoteSource;

    document.getElementById("ue-id").value = String(u.id);
    document.getElementById("ue-username").value = u.username || "";
    document.getElementById("ue-username").readOnly = !!remote;
    document.getElementById("ue-email").value = u.email || "";
    document.getElementById("ue-email").readOnly = false;
    document.getElementById("ue-name").value = u.name || "";
    document.getElementById("ue-active").checked = !!u.active;
    const isAdmin = u.roles && u.roles.includes("admin");
    document.getElementById("ue-role-admin").checked = isAdmin;
    const meId = remote && DB.session && DB.session.supabaseUserId === u.id;
    const meLegacy = !remote && me && u.id === me.id;
    document.getElementById("ue-role-admin").disabled = meId || meLegacy;
    document.getElementById("ue-active").disabled = meId || meLegacy;

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

    setDepartmentScopeOnForm(u.allowedDepartmentNames);

    document.getElementById("ue-modal-title").textContent = remote ? "Edit user" : u.managed ? "Edit agent" : "Edit user";
    document.getElementById("ue-error").textContent = "";
    setPasswordRows("edit");
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
    const deptBox = document.getElementById("ue-departments-scope-box");
    if (deptBox) {
      deptBox.style.opacity = isAdm ? "0.5" : "1";
      deptBox.style.pointerEvents = isAdm ? "none" : "auto";
    }
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

  function buildAppAccessPayload(isAdmin) {
    return {
      restrictions: {
        canBeAssignee: document.getElementById("ue-f-assignee").checked,
        canExportReports: document.getElementById("ue-f-export").checked,
        canManageDepartments: document.getElementById("ue-f-departments").checked,
      },
      allowedPages: isAdmin ? null : readPagesFromForm(false),
      allowedDepartmentNames: isAdmin ? null : readDepartmentScopeFromForm(),
    };
  }

  async function saveModalRemote(id) {
    const err = document.getElementById("ue-error");
    const prev = findUserRow(id);
    const email = document.getElementById("ue-email").value.trim().toLowerCase();
    const name = document.getElementById("ue-name").value.trim();
    const active = document.getElementById("ue-active").checked;
    const wantAdmin = document.getElementById("ue-role-admin").checked;
    let role = "agent";
    if (wantAdmin) role = "admin";
    else if (
      prev &&
      Array.isArray(prev.roles) &&
      prev.roles.includes("user") &&
      !prev.roles.includes("agent") &&
      !prev.roles.includes("admin")
    ) {
      role = "user";
    }
    const newPw = document.getElementById("ue-new-password")?.value || "";

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      err.textContent = "Valid email is required.";
      return;
    }
    if (!name) {
      err.textContent = "Display name is required.";
      return;
    }
    if (newPw && newPw.length < 12) {
      err.textContent = "New password must meet server policy (min. 12 chars, letter + digit by default).";
      return;
    }

    const body = {
      email,
      display_name: name,
      active,
      role,
      app_access: buildAppAccessPayload(wantAdmin),
    };
    if (newPw.length >= 12) body.password = newPw;

    const res = await ApiClient.adminPatchUser(id, body);
    if (!res || !res.ok) {
      err.textContent =
        (res && res.data && (res.data.detail || res.data.error)) || "Save failed (" + (res && res.status) + ").";
      return;
    }
    await refreshRemoteUsers();
    await loadAdminAudit();
    closeModal();
    renderTable();
  }

  function saveModal() {
    const err = document.getElementById("ue-error");
    err.textContent = "";
    const idRaw = document.getElementById("ue-id").value;
    if (useRemoteAdminUsers() && findUserRow(idRaw)?.remoteSource) {
      void saveModalRemote(idRaw);
      return;
    }

    const id = Number(idRaw);
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
      allowedDepartmentNames: isAdmin ? null : readDepartmentScopeFromForm(),
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
    const inv = document.getElementById("ue-invite-email");
    if (inv) inv.checked = true;
    document.getElementById("ue-modal-title").textContent = useRemoteAdminUsers()
      ? "Create user (Supabase)"
      : "Create agent account";
    document.getElementById("ue-id").value = "";
    document.getElementById("ue-username").value = "";
    document.getElementById("ue-username").readOnly = useRemoteAdminUsers();
    document.getElementById("ue-email").value = "";
    document.getElementById("ue-email").readOnly = false;
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
    setDepartmentScopeOnForm(null);
    document.getElementById("ue-error").textContent = "";
    setPasswordRows("create");
    syncPagesBoxForRole();
    modal.classList.add("open");
  }

  async function saveCreateRemote() {
    const err = document.getElementById("ue-error");
    const email = document.getElementById("ue-email").value.trim().toLowerCase();
    const name = document.getElementById("ue-name").value.trim();
    const password = document.getElementById("ue-password")?.value || "";
    const invite = document.getElementById("ue-invite-email")?.checked !== false;
    const wantAdmin = document.getElementById("ue-role-admin").checked;
    const role = wantAdmin ? "admin" : "agent";

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      err.textContent = "Valid email is required.";
      return;
    }
    if (!name) {
      err.textContent = "Display name is required.";
      return;
    }
    if (!invite && password.length < 12) {
      err.textContent =
        "Password must meet server policy (min. 12 characters, at least one letter and one digit), or use email invitation.";
      return;
    }

    const body = {
      email,
      display_name: name,
      role,
      active: true,
      app_access: buildAppAccessPayload(wantAdmin),
    };
    if (invite) body.invite = true;
    else body.password = password;
    const res = await ApiClient.adminCreateUser(body);
    if (!res || !res.ok) {
      err.textContent =
        (res && res.data && (res.data.detail || res.data.error)) || "Create failed (" + (res && res.status) + ").";
      return;
    }
    await refreshRemoteUsers();
    await loadAdminAudit();
    closeModal();
    renderTable();
  }

  function saveCreate() {
    if (useRemoteAdminUsers()) {
      void saveCreateRemote();
      return;
    }
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
      allowedDepartmentNames: isAdmin ? null : readDepartmentScopeFromForm(),
    };

    if (typeof saveUserPatch === "function") saveUserPatch(user);
    closeModal();
    renderTable();
  }

  async function removeUser(userId) {
    const u = findUserRow(userId);
    if (!u) return;
    if (useRemoteAdminUsers() && u.remoteSource) {
      if (!confirm("Delete this user from Supabase Auth? This cannot be undone.")) return;
      const res = await ApiClient.adminDeleteUser(userId);
      if (!res || !res.ok) {
        alert((res && res.data && res.data.error) || "Delete failed.");
        return;
      }
      await refreshRemoteUsers();
      await loadAdminAudit();
      renderTable();
      return;
    }
    if (!u.managed) return;
    if (!confirm("Remove this agent account? They will no longer be able to sign in.")) return;
    if (typeof deleteUserPatch === "function") deleteUserPatch(Number(userId));
    const i = DB.users.findIndex((x) => x.id === Number(userId));
    if (i >= 0) DB.users.splice(i, 1);
    renderTable();
  }

  function formatAuditPayload(p) {
    if (!p || typeof p !== "object") return "—";
    try {
      const j = JSON.stringify(p);
      return j.length > 120 ? j.slice(0, 117) + "…" : j;
    } catch {
      return "—";
    }
  }

  async function loadAdminAudit() {
    const wrap = document.getElementById("admin-audit-wrap");
    const tbody = document.getElementById("admin-audit-body");
    if (!wrap || !tbody) return;
    if (!useRemoteAdminUsers()) {
      wrap.style.display = "none";
      return;
    }
    wrap.style.display = "block";
    tbody.innerHTML =
      '<tr><td colspan="4" class="ue-hint" style="padding:12px">Chargement…</td></tr>';
    const res = await ApiClient.adminListAudit(40);
    if (!res || !res.ok || !res.data || !Array.isArray(res.data.entries)) {
      tbody.innerHTML =
        '<tr><td colspan="4" class="ue-hint" style="padding:12px">Impossible de charger l’audit.</td></tr>';
      return;
    }
    const rows = res.data.entries;
    if (!rows.length) {
      tbody.innerHTML =
        '<tr><td colspan="4" class="ue-hint" style="padding:12px">Aucune entrée (exécutez schema_admin_audit.sql).</td></tr>';
      return;
    }
    tbody.innerHTML = rows
      .map((e) => {
        const d = e.created_at ? new Date(e.created_at).toLocaleString() : "—";
        return `<tr>
          <td>${escapeHtml(d)}</td>
          <td>${escapeHtml(e.action || "—")}</td>
          <td><code style="font-size:10px">${escapeHtml(String(e.target_id || "—"))}</code></td>
          <td style="max-width:220px;word-break:break-word">${escapeHtml(formatAuditPayload(e.payload))}</td>
        </tr>`;
      })
      .join("");
  }

  async function refreshRemoteUsers() {
    _remoteLoadError = "";
    if (!useRemoteAdminUsers()) return;
    const res = await ApiClient.adminListUsers();
    if (!res || !res.ok || !res.data || !Array.isArray(res.data.users)) {
      _remoteLoadError =
        res && res.status === 403
          ? "Admin API: access denied."
          : res && res.status === 503
            ? "Admin API: service role missing on server."
            : "Could not load users from API.";
      _remoteUsers = [];
      return;
    }
    _remoteUsers = res.data.users.map(mapApiUserToRow);
  }

  async function init() {
    const tbody = document.getElementById("users-admin-body");
    if (!tbody) return;
    const hint = document.getElementById("users-admin-hint");
    if (hint) {
      hint.textContent = useRemoteAdminUsers()
        ? "Comptes Supabase : création, rôles, modules, capacités et périmètre départements (persistés en base)."
        : "Create agent logins, limit which modules they see, and toggle capabilities. Changes are stored in this browser only.";
    }
    buildDepartmentGrid();
    await refreshRemoteUsers();
    renderTable();
    await loadAdminAudit();
    document.getElementById("btn-audit-refresh")?.addEventListener("click", () => void loadAdminAudit());
    document.getElementById("ue-invite-email")?.addEventListener("change", () => {
      if (!document.getElementById("ue-id")?.value) setPasswordRows("create");
    });
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

  global.UsersAdmin = { init, renderTable, refreshRemoteUsers, loadAdminAudit };
})(typeof window !== "undefined" ? window : this);
