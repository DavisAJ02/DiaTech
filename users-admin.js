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

  function getDemandeurAllowedPages() {
    const arr = global.DIATECH_USER_ROLE_PAGES;
    if (Array.isArray(arr) && arr.length) return arr.map((x) => String(x));
    return PAGE_OPTIONS.map((p) => p.file).filter(
      (f) => !["inventory.html", "it-analytics.html"].includes(String(f).toLowerCase())
    );
  }

  function getSelectedRole() {
    if (document.getElementById("ue-role-admin-radio")?.checked) return "admin";
    if (document.getElementById("ue-role-user")?.checked) return "user";
    return "agent";
  }

  /** @returns {string|null} message d’erreur */
  function validateUserDepartmentForSave(role) {
    if (role !== "user") return null;
    const scope = readDepartmentScopeFromForm();
    if (scope == null || !Array.isArray(scope) || scope.length === 0) {
      return "Pour un demandeur, choisissez au moins un département (décochez « All departments » et cochez les services concernés).";
    }
    return null;
  }

  function applyDemandeurPagesToForm() {
    const allowed = new Set(getDemandeurAllowedPages().map((x) => String(x).toLowerCase()));
    PAGE_OPTIONS.forEach((p) => {
      const el = document.getElementById("ue-page-" + p.file.replace(/\./g, "-"));
      if (!el) return;
      el.checked = allowed.has(String(p.file).toLowerCase());
    });
  }

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
      btn.addEventListener("click", () => void openModal(String(btn.dataset.id)));
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

  function departmentNamesFromDbDepartments() {
    const depts = Array.isArray(global.DB?.departments) ? global.DB.departments : [];
    return depts.map((d) => d && d.name).filter(Boolean);
  }

  /** Noms de services déjà présents sur les tickets (utile si app_state.departments est vide). */
  function departmentNamesFromTicketsFallback() {
    const tickets = Array.isArray(global.DB?.tickets) ? global.DB.tickets : [];
    const s = new Set();
    for (let i = 0; i < tickets.length; i++) {
      const d = String(tickets[i]?.department || "").trim();
      if (d) s.add(d);
    }
    return [...s].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  }

  /**
   * Résout la liste des services pour la grille admin : DB → tickets locaux → GET /api/departments → GET /api/app-data.
   * Met à jour DB.departments quand l’API renvoie des entrées complètes.
   */
  async function ensureDepartmentNamesForAdminGrid() {
    let names = departmentNamesFromDbDepartments();
    if (names.length) return names;
    names = departmentNamesFromTicketsFallback();
    if (names.length) return names;

    const AC = typeof global.ApiClient !== "undefined" ? global.ApiClient : null;
    if (AC && typeof AC.getDepartments === "function") {
      try {
        const remote = await AC.getDepartments();
        if (Array.isArray(remote) && remote.length) {
          if (global.DB) global.DB.departments = remote;
          return remote.map((d) => d && d.name).filter(Boolean);
        }
      } catch (_e) {
        /* ignore */
      }
    }
    if (AC && typeof AC.getAppData === "function") {
      try {
        const pack = await AC.getAppData();
        if (pack && Array.isArray(pack.departments) && pack.departments.length) {
          if (global.DB) global.DB.departments = pack.departments;
          return pack.departments.map((d) => d && d.name).filter(Boolean);
        }
      } catch (_e) {
        /* ignore */
      }
    }
    if (
      useRemoteAdminUsers() &&
      AC &&
      typeof AC.adminDepartmentNamesFromTickets === "function"
    ) {
      try {
        const r = await AC.adminDepartmentNamesFromTickets();
        const list = r && r.ok && r.data && Array.isArray(r.data.names) ? r.data.names : [];
        if (list.length && global.DB) {
          const hasDb = Array.isArray(global.DB.departments) && global.DB.departments.length > 0;
          if (!hasDb) {
            global.DB.departments = list.map((name) => ({ name: String(name) }));
          }
        }
        if (list.length) return list.map((n) => String(n).trim()).filter(Boolean);
      } catch (_e) {
        /* ignore */
      }
    }
    return [];
  }

  /**
   * @param {string[]|null|undefined} mergeExtraNames — ex. profils déjà assignés à des services absents du référentiel
   */
  async function buildDepartmentGrid(mergeExtraNames) {
    const host = document.getElementById("ue-departments-grid");
    if (!host) return;
    host.innerHTML = '<span class="ue-hint">Chargement des services…</span>';
    let names = await ensureDepartmentNamesForAdminGrid();
    if (Array.isArray(mergeExtraNames) && mergeExtraNames.length) {
      const set = new Set(names);
      mergeExtraNames.forEach((n) => {
        const s = String(n || "").trim();
        if (s) set.add(s);
      });
      names = [...set].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
    }
    if (!names.length) {
      host.innerHTML =
        '<span class="ue-hint">Aucun département trouvé. Ouvrez la page <strong>Départements</strong> pour créer ou synchroniser la liste (données serveur), ou vérifiez que vos tickets portent un champ service. Sans liste, vous ne pouvez pas fixer le périmètre d’un demandeur.</span>';
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

  async function setDepartmentScopeOnForm(scope) {
    await buildDepartmentGrid(Array.isArray(scope) ? scope : null);
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

  async function openModal(userId) {
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
    const isUserOnly = u.roles && u.roles.includes("user") && !u.roles.includes("agent") && !isAdmin;
    const roleKey = isAdmin ? "admin" : isUserOnly ? "user" : "agent";
    const radAdm = document.getElementById("ue-role-admin-radio");
    const radUser = document.getElementById("ue-role-user");
    const radAgent = document.getElementById("ue-role-agent");
    if (radAdm) radAdm.checked = roleKey === "admin";
    if (radUser) radUser.checked = roleKey === "user";
    if (radAgent) radAgent.checked = roleKey === "agent";
    const meId = remote && DB.session && DB.session.supabaseUserId === u.id;
    const meLegacy = !remote && me && u.id === me.id;
    document.querySelectorAll('input[name="ue-role"]').forEach((el) => {
      el.disabled = meId || meLegacy;
    });
    document.getElementById("ue-active").disabled = meId || meLegacy;

    PAGE_OPTIONS.forEach((p) => {
      const el = document.getElementById("ue-page-" + p.file.replace(/\./g, "-"));
      if (!el) return;
      if (isAdmin) {
        el.checked = true;
        return;
      }
      if (isUserOnly) {
        const allowed = new Set(getDemandeurAllowedPages().map((x) => String(x).toLowerCase()));
        el.checked = allowed.has(String(p.file).toLowerCase());
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

    await setDepartmentScopeOnForm(u.allowedDepartmentNames);

    document.getElementById("ue-modal-title").textContent = remote ? "Edit user" : u.managed ? "Edit agent" : "Edit user";
    document.getElementById("ue-error").textContent = "";
    setPasswordRows("edit");
    syncRoleDependentUi();
    modal.classList.add("open");
  }

  function closeModal() {
    document.getElementById("user-edit-modal")?.classList.remove("open");
  }

  function syncRoleDependentUi() {
    const role = getSelectedRole();
    const hint = document.getElementById("ue-role-user-hint");
    if (hint) hint.style.display = role === "user" ? "block" : "none";

    const pagesBox = document.getElementById("ue-pages-box");
    const deptBox = document.getElementById("ue-departments-scope-box");
    const capBox = document.getElementById("ue-capabilities-box");
    const allEl = document.getElementById("ue-departments-all");

    const isAdmin = role === "admin";
    const isUser = role === "user";

    if (pagesBox) {
      pagesBox.style.opacity = isAdmin || isUser ? "0.5" : "1";
      pagesBox.style.pointerEvents = isAdmin || isUser ? "none" : "auto";
    }
    if (isUser) applyDemandeurPagesToForm();

    if (deptBox) {
      deptBox.style.opacity = isAdmin ? "0.5" : "1";
      deptBox.style.pointerEvents = isAdmin ? "none" : "auto";
    }

    if (allEl) {
      if (isAdmin) {
        allEl.disabled = true;
        allEl.checked = true;
      } else if (isUser) {
        const hadAll = allEl.checked;
        allEl.checked = false;
        allEl.disabled = true;
        const checkboxes = Array.from(document.querySelectorAll("[data-ue-dept-name]"));
        const anyChecked = checkboxes.some((cb) => cb.checked);
        if (hadAll && checkboxes.length) checkboxes.forEach((cb) => { cb.checked = true; });
        else if (!anyChecked && checkboxes.length) checkboxes[0].checked = true;
      } else {
        allEl.disabled = false;
      }
    }

    if (capBox) {
      capBox.style.opacity = isUser ? "0.5" : "1";
      capBox.style.pointerEvents = isUser ? "none" : "auto";
    }
    if (isUser) {
      const fa = document.getElementById("ue-f-assignee");
      const fe = document.getElementById("ue-f-export");
      const fd = document.getElementById("ue-f-departments");
      if (fa) fa.checked = false;
      if (fe) fe.checked = false;
      if (fd) fd.checked = false;
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

  function buildAppAccessPayload(role) {
    if (role === "admin") {
      return {
        restrictions: {
          canBeAssignee: document.getElementById("ue-f-assignee").checked,
          canExportReports: document.getElementById("ue-f-export").checked,
          canManageDepartments: document.getElementById("ue-f-departments").checked,
        },
        allowedPages: null,
        allowedDepartmentNames: null,
      };
    }
    if (role === "user") {
      return {
        restrictions: {
          canBeAssignee: false,
          canExportReports: false,
          canManageDepartments: false,
        },
        allowedPages: getDemandeurAllowedPages(),
        allowedDepartmentNames: readDepartmentScopeFromForm(),
      };
    }
    return {
      restrictions: {
        canBeAssignee: document.getElementById("ue-f-assignee").checked,
        canExportReports: document.getElementById("ue-f-export").checked,
        canManageDepartments: document.getElementById("ue-f-departments").checked,
      },
      allowedPages: readPagesFromForm(false),
      allowedDepartmentNames: readDepartmentScopeFromForm(),
    };
  }

  async function saveModalRemote(id) {
    const err = document.getElementById("ue-error");
    const prev = findUserRow(id);
    const email = document.getElementById("ue-email").value.trim().toLowerCase();
    const name = document.getElementById("ue-name").value.trim();
    const active = document.getElementById("ue-active").checked;
    const role = getSelectedRole();
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
    const deptErr = validateUserDepartmentForSave(role);
    if (deptErr) {
      err.textContent = deptErr;
      return;
    }

    const body = {
      email,
      display_name: name,
      active,
      role,
      app_access: buildAppAccessPayload(role),
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
    const role = getSelectedRole();

    if (!username || !name) {
      err.textContent = "Username and display name are required.";
      return;
    }
    const taken = DB.users.some((x) => x.id !== id && x.username.toLowerCase() === username);
    if (taken) {
      err.textContent = "That username is already in use.";
      return;
    }

    const deptErr = validateUserDepartmentForSave(role);
    if (deptErr) {
      err.textContent = deptErr;
      return;
    }

    if (id === me?.id) {
      if (!active) {
        err.textContent = "You cannot deactivate your own account.";
        return;
      }
      if (role !== "admin" && me.roles?.includes("admin")) {
        err.textContent = "You cannot remove your own admin role.";
        return;
      }
    }

    const roles = role === "admin" ? ["agent", "admin"] : role === "user" ? ["user"] : ["agent"];
    const isAdmin = role === "admin";

    const restrictions =
      role === "user"
        ? { canBeAssignee: false, canExportReports: false, canManageDepartments: false }
        : {
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

    if (role === "admin") {
      patch.allowedPages = null;
    } else if (role === "user") {
      patch.allowedPages = getDemandeurAllowedPages();
    } else {
      patch.allowedPages = readPagesFromForm(false);
    }

    if (typeof saveUserPatch === "function") saveUserPatch(patch);
    closeModal();
    renderTable();
  }

  async function openCreateModal() {
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
    const radAdm = document.getElementById("ue-role-admin-radio");
    const radUser = document.getElementById("ue-role-user");
    const radAgent = document.getElementById("ue-role-agent");
    if (radAdm) radAdm.checked = false;
    if (radUser) radUser.checked = false;
    if (radAgent) radAgent.checked = true;
    document.querySelectorAll('input[name="ue-role"]').forEach((el) => {
      el.disabled = false;
    });
    document.getElementById("ue-active").disabled = false;
    PAGE_OPTIONS.forEach((p) => {
      const el = document.getElementById("ue-page-" + p.file.replace(/\./g, "-"));
      if (el) el.checked = true;
    });
    document.getElementById("ue-f-assignee").checked = true;
    document.getElementById("ue-f-export").checked = true;
    document.getElementById("ue-f-departments").checked = true;
    await setDepartmentScopeOnForm(null);
    document.getElementById("ue-error").textContent = "";
    setPasswordRows("create");
    syncRoleDependentUi();
    modal.classList.add("open");
  }

  async function saveCreateRemote() {
    const err = document.getElementById("ue-error");
    const email = document.getElementById("ue-email").value.trim().toLowerCase();
    const name = document.getElementById("ue-name").value.trim();
    const password = document.getElementById("ue-password")?.value || "";
    const invite = document.getElementById("ue-invite-email")?.checked !== false;
    const role = getSelectedRole();

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
    const deptErr = validateUserDepartmentForSave(role);
    if (deptErr) {
      err.textContent = deptErr;
      return;
    }

    const body = {
      email,
      display_name: name,
      role,
      active: true,
      app_access: buildAppAccessPayload(role),
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
    const role = getSelectedRole();
    const deptErr = validateUserDepartmentForSave(role);
    if (deptErr) {
      err.textContent = deptErr;
      return;
    }
    const roles = role === "admin" ? ["agent", "admin"] : role === "user" ? ["user"] : ["agent"];
    const isAdmin = role === "admin";

    const restrictions =
      role === "user"
        ? { canBeAssignee: false, canExportReports: false, canManageDepartments: false }
        : {
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
      allowedPages:
        role === "admin" ? null : role === "user" ? getDemandeurAllowedPages() : readPagesFromForm(false),
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
    await buildDepartmentGrid();
    await refreshRemoteUsers();
    renderTable();
    await loadAdminAudit();
    document.getElementById("btn-audit-refresh")?.addEventListener("click", () => void loadAdminAudit());
    document.getElementById("ue-invite-email")?.addEventListener("change", () => {
      if (!document.getElementById("ue-id")?.value) setPasswordRows("create");
    });
    document.getElementById("btn-create-agent")?.addEventListener("click", () => void openCreateModal());
    document.getElementById("user-modal-cancel")?.addEventListener("click", closeModal);
    document.getElementById("user-edit-modal")?.addEventListener("click", (e) => {
      if (e.target.id === "user-edit-modal") closeModal();
    });
    document.getElementById("user-modal-save")?.addEventListener("click", () => {
      const id = document.getElementById("ue-id").value;
      if (id) saveModal();
      else saveCreate();
    });
    document.querySelectorAll('input[name="ue-role"]').forEach((el) => {
      el.addEventListener("change", syncRoleDependentUi);
    });
  }

  global.UsersAdmin = { init, renderTable, refreshRemoteUsers, loadAdminAudit };
})(typeof window !== "undefined" ? window : this);
