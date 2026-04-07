(function () {
  function normalizeBase(url) {
    return String(url || "").trim().replace(/\/+$/, "");
  }

  function isLocalApiHostUrl(url) {
    const u = String(url || "").toLowerCase();
    return (
      u.startsWith("http://localhost") ||
      u.startsWith("http://127.0.0.1") ||
      u.startsWith("http://0.0.0.0")
    );
  }

  function isPageOnDeployedHost() {
    if (typeof window === "undefined" || !window.location) return false;
    const host = String(window.location.hostname || "").toLowerCase();
    return Boolean(host && host !== "localhost" && host !== "127.0.0.1" && host !== "0.0.0.0");
  }

  function resolveApiBase() {
    const fromWindow = typeof window !== "undefined" ? window.__API_BASE__ : "";
    const fromStorage = typeof localStorage !== "undefined" ? localStorage.getItem("ti_api_base") : "";
    let explicit = normalizeBase(fromWindow || fromStorage);
    if (isPageOnDeployedHost() && isLocalApiHostUrl(explicit)) {
      explicit = "";
    }
    if (explicit) return explicit;

    if (typeof window !== "undefined" && window.location) {
      const host = String(window.location.hostname || "").toLowerCase();
      if (host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0") {
        return "http://localhost:3001/api";
      }
      return `${window.location.origin}/api`;
    }
    return "http://localhost:3001/api";
  }

  const API_BASE = resolveApiBase();

  async function getSupabaseAuthHeaders() {
    try {
      var c = typeof window !== 'undefined' ? window.__diaTechSupabaseClient : null;
      if (!c || !c.auth) return {};
      var out = await c.auth.getSession();
      var t = out && out.data && out.data.session && out.data.session.access_token;
      if (!t) return {};
      return { Authorization: 'Bearer ' + t };
    } catch (_e) {
      return {};
    }
  }

  /** Tickets via public.dia_tickets + RLS (session Supabase + /api/tickets-rls). */
  async function shouldUseTicketsRls() {
    if (typeof window === 'undefined') return false;
    if (window.__DIATECH_TICKETS_RLS === false) return false;
    var p = window.__DIATECH_PUBLIC__;
    var has =
      Boolean(p && String(p.supabaseUrl || '').trim() && String(p.supabaseAnonKey || '').trim());
    if (!has) return false;
    var h = await getSupabaseAuthHeaders();
    return Boolean(h.Authorization);
  }

  function notifyMutation(path) {
    if (typeof window.diatechNotifyDataChanged !== "function") return;
    var reason =
      path.indexOf("/tickets") === 0
        ? "tickets"
        : path.indexOf("/inventory") === 0 || path.indexOf("/consumables") === 0
          ? "inventory"
          : path.indexOf("/devices") === 0 || path.indexOf("/departments") === 0
            ? "fleet"
            : path === "/bootstrap" || path === "/app-data"
              ? "all"
              : "data";
    window.diatechNotifyDataChanged(reason);
  }

  async function request(path, options = {}) {
    try {
      const method = String(options.method || "GET").toUpperCase();
      const res = await fetch(`${API_BASE}${path}`, {
        method: options.method || "GET",
        headers: {
          "Content-Type": "application/json",
          ...(options.headers || {}),
        },
        body: options.body,
      });
      if (!res.ok) return null;
      if (method !== "GET" && method !== "HEAD") notifyMutation(path);
      if (res.status === 204) return {};
      return await res.json();
    } catch (_e) {
      return null;
    }
  }

  async function requestWithResult(path, options = {}) {
    try {
      const method = String(options.method || "GET").toUpperCase();
      const res = await fetch(`${API_BASE}${path}`, {
        method: options.method || "GET",
        headers: {
          "Content-Type": "application/json",
          ...(options.headers || {}),
        },
        body: options.body,
      });
      let data = null;
      const ct = res.headers.get("content-type") || "";
      if (ct.includes("application/json")) {
        try {
          data = await res.json();
        } catch {
          data = null;
        }
      }
      if (res.ok && method !== "GET" && method !== "HEAD") notifyMutation(path);
      return { ok: res.ok, status: res.status, data };
    } catch (e) {
      return { ok: false, status: 0, data: null, error: String(e?.message || e) };
    }
  }

  async function requestWithResultAuth(path, options = {}) {
    const auth = await getSupabaseAuthHeaders();
    return requestWithResult(path, {
      ...options,
      headers: { ...auth, ...(options.headers || {}) },
    });
  }

  function currentProfileRoleForApi() {
    var r =
      typeof window !== "undefined" && window.currentUserRole != null
        ? String(window.currentUserRole).toLowerCase().trim()
        : "";
    if (r === "admin" || r === "agent" || r === "user") return r;
    if (typeof getPrimaryProfileRole === "function") return getPrimaryProfileRole();
    return "user";
  }

  function stripAssignPayloadForRole(ticket) {
    var t = ticket && typeof ticket === "object" ? { ...ticket } : {};
    var role = currentProfileRoleForApi();
    if (role === "admin" || role === "agent") return t;
    delete t.assigneeEmail;
    delete t.assigneeCleared;
    delete t.assignedToAuthId;
    delete t.createdByAuthId;
    return t;
  }

  async function saveAppDataWithResult(payload) {
    try {
      const res = await fetch(`${API_BASE}/app-data`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload || {}),
      });
      let data = null;
      const ct = res.headers.get("content-type") || "";
      if (ct.includes("application/json")) {
        try {
          data = await res.json();
        } catch {
          data = null;
        }
      }
      if (res.ok) notifyMutation("/app-data");
      return { ok: res.ok, status: res.status, data };
    } catch (e) {
      return { ok: false, status: 0, data: null, error: String(e?.message || e) };
    }
  }

  window.ApiClient = {
    request,
    getBaseUrl: () => API_BASE,
    bootstrap: (payload) => request("/bootstrap", { method: "POST", body: JSON.stringify(payload || {}) }),

    getTickets: () => request("/tickets"),
    upsertTicket: (ticket) => request("/tickets", { method: "POST", body: JSON.stringify(ticket || {}) }),
    upsertTicketWithResult: (ticket) =>
      requestWithResult("/tickets", { method: "POST", body: JSON.stringify(ticket || {}) }),
    deleteTicket: (id) => request(`/tickets/${encodeURIComponent(String(id))}`, { method: "DELETE" }),

    shouldUseTicketsRls,
    getTicketsRls: () => requestWithResultAuth("/tickets-rls"),
    upsertTicketRlsWithResult: (ticket) =>
      requestWithResultAuth("/tickets-rls", {
        method: "POST",
        body: JSON.stringify(stripAssignPayloadForRole(ticket || {})),
      }),
    deleteTicketRls: (id) =>
      requestWithResultAuth(`/tickets-rls/${encodeURIComponent(String(id))}`, { method: "DELETE" }),

    adminListUsers: () => requestWithResultAuth("/admin/users"),
    adminCreateUser: (body) =>
      requestWithResultAuth("/admin/users", { method: "POST", body: JSON.stringify(body || {}) }),
    adminPatchUser: (id, body) =>
      requestWithResultAuth(`/admin/users/${encodeURIComponent(String(id))}`, {
        method: "PATCH",
        body: JSON.stringify(body || {}),
      }),
    adminDeleteUser: (id) =>
      requestWithResultAuth(`/admin/users/${encodeURIComponent(String(id))}`, { method: "DELETE" }),
    adminListAudit: (limit) =>
      requestWithResultAuth("/admin/audit?limit=" + encodeURIComponent(String(limit || 50))),
    adminDepartmentNamesFromTickets: () =>
      requestWithResultAuth("/admin/department-names-from-tickets"),

    getDepartments: () => request("/departments"),
    upsertDepartment: (department) => request("/departments", { method: "POST", body: JSON.stringify(department || {}) }),
    deleteDepartment: (name) => request(`/departments/${encodeURIComponent(String(name))}`, { method: "DELETE" }),

    getDevices: () => request("/devices"),
    upsertDevice: (device) => request("/devices", { method: "POST", body: JSON.stringify(device || {}) }),
    deleteDevice: (id) => request(`/devices/${encodeURIComponent(String(id))}`, { method: "DELETE" }),

    getExpenses: () => request("/expenses"),
    upsertExpense: (expense) => request("/expenses", { method: "POST", body: JSON.stringify(expense || {}) }),
    deleteExpense: (id) => request(`/expenses/${encodeURIComponent(String(id))}`, { method: "DELETE" }),

    getAppData: () => request("/app-data"),
    saveAppData: (payload) => request("/app-data", { method: "POST", body: JSON.stringify(payload || {}) }),
    saveAppDataWithResult,
  };

  // Optional helper for quick runtime override in production:
  // window.setApiBase("https://your-backend-domain/api")
  window.setApiBase = function setApiBase(url) {
    if (typeof localStorage === "undefined") return false;
    const next = normalizeBase(url);
    if (!next) return false;
    localStorage.setItem("ti_api_base", next);
    return true;
  };
})();
