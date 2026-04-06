(function () {
  function normalizeBase(url) {
    return String(url || "").trim().replace(/\/+$/, "");
  }

  function resolveApiBase() {
    const fromWindow = typeof window !== "undefined" ? window.__API_BASE__ : "";
    const fromStorage = typeof localStorage !== "undefined" ? localStorage.getItem("ti_api_base") : "";
    const explicit = normalizeBase(fromWindow || fromStorage);
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

  async function request(path, options = {}) {
    try {
      const res = await fetch(`${API_BASE}${path}`, {
        method: options.method || "GET",
        headers: {
          "Content-Type": "application/json",
          ...(options.headers || {}),
        },
        body: options.body,
      });
      if (!res.ok) return null;
      if (res.status === 204) return {};
      return await res.json();
    } catch (_e) {
      return null;
    }
  }

  window.ApiClient = {
    request,
    getBaseUrl: () => API_BASE,
    bootstrap: (payload) => request("/bootstrap", { method: "POST", body: JSON.stringify(payload || {}) }),

    getTickets: () => request("/tickets"),
    upsertTicket: (ticket) => request("/tickets", { method: "POST", body: JSON.stringify(ticket || {}) }),
    deleteTicket: (id) => request(`/tickets/${encodeURIComponent(String(id))}`, { method: "DELETE" }),

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
