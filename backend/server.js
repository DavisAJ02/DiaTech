const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = Number(process.env.PORT || 3001);
const DB_PATH = path.join(__dirname, "db.json");

app.use(cors({ origin: true, credentials: false }));
app.use(express.json({ limit: "1mb" }));

function readDb() {
  try {
    const raw = fs.readFileSync(DB_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return {
      inventory: Array.isArray(parsed.inventory) ? parsed.inventory : [],
      consumables: Array.isArray(parsed.consumables) ? parsed.consumables : [],
      consumableLogs: Array.isArray(parsed.consumableLogs) ? parsed.consumableLogs : [],
      tickets: Array.isArray(parsed.tickets) ? parsed.tickets : [],
      departments: Array.isArray(parsed.departments) ? parsed.departments : [],
      devices: Array.isArray(parsed.devices) ? parsed.devices : [],
      expenses: Array.isArray(parsed.expenses) ? parsed.expenses : [],
      expenseMonthlyBudget: Number(parsed.expenseMonthlyBudget) || 0,
      alertRules: parsed.alertRules && typeof parsed.alertRules === "object" ? parsed.alertRules : {},
      slaPolicies: Array.isArray(parsed.slaPolicies) ? parsed.slaPolicies : [],
    };
  } catch (e) {
    return {
      inventory: [],
      consumables: [],
      consumableLogs: [],
      tickets: [],
      departments: [],
      devices: [],
      expenses: [],
      expenseMonthlyBudget: 0,
      alertRules: {},
      slaPolicies: [],
    };
  }
}

function writeDb(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), "utf8");
}

function safeId(v) {
  return String(v == null ? "" : v);
}

function parseDateSafe(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function getSlaTargetHoursForYear(policies, year) {
  const arr = Array.isArray(policies) ? policies : [];
  const exact = arr.find((p) => Number(p?.year) === Number(year) && Number(p?.targetHours) > 0);
  if (exact) return Number(exact.targetHours);
  const sorted = arr
    .map((p) => ({ year: Number(p?.year), targetHours: Number(p?.targetHours) }))
    .filter((p) => Number.isFinite(p.year) && Number.isFinite(p.targetHours) && p.targetHours > 0)
    .sort((a, b) => b.year - a.year);
  return sorted.length ? sorted[0].targetHours : 4;
}

function computeStats(db) {
  const inv = Array.isArray(db.inventory) ? db.inventory : [];
  const cons = Array.isArray(db.consumables) ? db.consumables : [];
  const tickets = Array.isArray(db.tickets) ? db.tickets : [];
  const policies = Array.isArray(db.slaPolicies) ? db.slaPolicies : [];
  const year = new Date().getFullYear();

  const overdueTickets = tickets.filter((t) => {
    const status = String(t?.status || "").toLowerCase();
    if (status === "resolved") return false;
    const created = parseDateSafe(t?.createdAt || t?.openedAt || t?.date);
    if (!created) {
      const s1 = String(t?.slaStatus || "").toLowerCase();
      const s2 = String(t?.slaClass || "").toLowerCase();
      return s1 === "overdue" || s2 === "breach";
    }
    const hours = (Date.now() - created.getTime()) / 3600000;
    const target = getSlaTargetHoursForYear(policies, created.getFullYear());
    return hours > target;
  }).length;

  return {
    openTickets: tickets.filter((t) => String(t?.status || "").toLowerCase() === "open").length,
    pendingTickets: tickets.filter((t) => {
      const s = String(t?.status || "").toLowerCase();
      return s === "pending" || s === "in-progress" || s === "in_progress";
    }).length,
    overdueTickets,
    totalDevices: inv.length,
    devicesHealthy: inv.filter((d) => {
      const st = String(d?.status || "").toLowerCase();
      const c = String(d?.condition || "").toLowerCase();
      return c === "bon" || st === "good" || st === "in-use";
    }).length,
    criticalDevices: inv.filter((d) => {
      const st = String(d?.status || "").toLowerCase();
      const c = String(d?.condition || "").toLowerCase();
      return c === "mauvais" || st === "critical";
    }).length,
    replacementSoon: inv.filter((d) => {
      const st = String(d?.status || "").toLowerCase();
      const c = String(d?.condition || "").toLowerCase();
      return st === "warning" || c === "moyen" || (d?.replacementYear && Number(d.replacementYear) <= year + 1);
    }).length,
    lowStock: cons.filter((c) => Number(c?.stockActuel || 0) <= Number(c?.stockMin || 0)).length,
  };
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "ti-dashboard-backend" });
});

app.post("/api/bootstrap", (req, res) => {
  const body = req.body || {};
  const db = readDb();
  if (Array.isArray(body.inventory) && db.inventory.length === 0) db.inventory = body.inventory;
  if (Array.isArray(body.consumables) && db.consumables.length === 0) db.consumables = body.consumables;
  if (Array.isArray(body.consumableLogs) && db.consumableLogs.length === 0) db.consumableLogs = body.consumableLogs;
  if (Array.isArray(body.tickets) && db.tickets.length === 0) db.tickets = body.tickets;
  if (Array.isArray(body.departments) && db.departments.length === 0) db.departments = body.departments;
  if (Array.isArray(body.devices) && db.devices.length === 0) db.devices = body.devices;
  if (Array.isArray(body.expenses) && db.expenses.length === 0) db.expenses = body.expenses;
  if ((body.expenseMonthlyBudget != null) && !db.expenseMonthlyBudget) db.expenseMonthlyBudget = Number(body.expenseMonthlyBudget) || 0;
  if (body.alertRules && typeof body.alertRules === "object" && Object.keys(db.alertRules || {}).length === 0) db.alertRules = body.alertRules;
  if (Array.isArray(body.slaPolicies) && db.slaPolicies.length === 0) db.slaPolicies = body.slaPolicies;
  writeDb(db);
  res.json({
    ok: true,
    counts: {
      inventory: db.inventory.length,
      consumables: db.consumables.length,
      consumableLogs: db.consumableLogs.length,
      tickets: db.tickets.length,
      departments: db.departments.length,
      devices: db.devices.length,
      expenses: db.expenses.length,
    }
  });
});

app.get("/api/app-data", (_req, res) => {
  const db = readDb();
  res.json({
    tickets: db.tickets,
    departments: db.departments,
    devices: db.devices,
    inventory: db.inventory,
    consumables: db.consumables,
    consumableLogs: db.consumableLogs,
    expenses: db.expenses,
    expenseMonthlyBudget: db.expenseMonthlyBudget,
    alertRules: db.alertRules,
    slaPolicies: db.slaPolicies,
  });
});

app.post("/api/app-data", (req, res) => {
  const db = readDb();
  const body = req.body || {};
  if (Array.isArray(body.tickets)) db.tickets = body.tickets;
  if (Array.isArray(body.departments)) db.departments = body.departments;
  if (Array.isArray(body.devices)) db.devices = body.devices;
  if (Array.isArray(body.inventory)) db.inventory = body.inventory;
  if (Array.isArray(body.consumables)) db.consumables = body.consumables;
  if (Array.isArray(body.consumableLogs)) db.consumableLogs = body.consumableLogs;
  if (Array.isArray(body.expenses)) db.expenses = body.expenses;
  if (body.expenseMonthlyBudget != null) db.expenseMonthlyBudget = Number(body.expenseMonthlyBudget) || 0;
  if (body.alertRules && typeof body.alertRules === "object") db.alertRules = body.alertRules;
  if (Array.isArray(body.slaPolicies)) db.slaPolicies = body.slaPolicies;
  writeDb(db);
  res.json({ ok: true });
});

app.get("/api/inventory", (_req, res) => {
  const db = readDb();
  res.json(db.inventory);
});

app.post("/api/inventory", (req, res) => {
  const db = readDb();
  const payload = req.body || {};
  if (!payload.id) return res.status(400).json({ error: "id required" });
  const i = db.inventory.findIndex((x) => safeId(x.id) === safeId(payload.id));
  if (i >= 0) db.inventory[i] = { ...db.inventory[i], ...payload };
  else db.inventory.push(payload);
  writeDb(db);
  res.json({ ok: true });
});

app.put("/api/inventory/:id", (req, res) => {
  const db = readDb();
  const id = safeId(req.params.id);
  const i = db.inventory.findIndex((x) => safeId(x.id) === id);
  if (i < 0) return res.status(404).json({ error: "not found" });
  db.inventory[i] = { ...db.inventory[i], ...(req.body || {}), id: db.inventory[i].id };
  writeDb(db);
  res.json({ ok: true });
});

app.delete("/api/inventory/:id", (req, res) => {
  const db = readDb();
  const id = safeId(req.params.id);
  db.inventory = db.inventory.filter((x) => safeId(x.id) !== id);
  writeDb(db);
  res.json({ ok: true });
});

app.get("/api/consumables", (_req, res) => {
  const db = readDb();
  res.json(db.consumables);
});

app.post("/api/consumables", (req, res) => {
  const db = readDb();
  const payload = req.body || {};
  if (!payload.id) return res.status(400).json({ error: "id required" });
  const i = db.consumables.findIndex((x) => safeId(x.id) === safeId(payload.id));
  if (i >= 0) db.consumables[i] = { ...db.consumables[i], ...payload };
  else db.consumables.push(payload);
  writeDb(db);
  res.json({ ok: true });
});

app.put("/api/consumables/:id", (req, res) => {
  const db = readDb();
  const id = safeId(req.params.id);
  const i = db.consumables.findIndex((x) => safeId(x.id) === id);
  if (i < 0) return res.status(404).json({ error: "not found" });
  db.consumables[i] = { ...db.consumables[i], ...(req.body || {}), id: db.consumables[i].id };
  writeDb(db);
  res.json({ ok: true });
});

app.delete("/api/consumables/:id", (req, res) => {
  const db = readDb();
  const id = safeId(req.params.id);
  db.consumables = db.consumables.filter((x) => safeId(x.id) !== id);
  writeDb(db);
  res.json({ ok: true });
});

app.get("/api/consumables/logs", (_req, res) => {
  const db = readDb();
  res.json(db.consumableLogs);
});

app.post("/api/consumables/:id/movements", (req, res) => {
  const db = readDb();
  const id = safeId(req.params.id);
  const c = db.consumables.find((x) => safeId(x.id) === id);
  if (!c) return res.status(404).json({ error: "consumable not found" });

  const body = req.body || {};
  const type = String(body.type || "").toLowerCase();
  const qty = Number(body.qty || 0);
  const date = body.date || new Date().toISOString().slice(0, 10);
  const department = body.department || "-";
  const note = body.note || "";
  if (!["entree", "sortie"].includes(type)) return res.status(400).json({ error: "type must be entree/sortie" });
  if (!Number.isFinite(qty) || qty <= 0) return res.status(400).json({ error: "qty invalid" });
  if (type === "sortie" && qty > Number(c.stockActuel || 0)) return res.status(400).json({ error: "insufficient stock" });

  c.stockActuel = type === "entree" ? Number(c.stockActuel || 0) + qty : Number(c.stockActuel || 0) - qty;
  c.dernierMouvement = date;
  db.consumableLogs.push({ date, type, item: c.name, qty, department, stock: c.stockActuel, note });
  writeDb(db);
  res.json({ ok: true, stockActuel: c.stockActuel });
});

app.get("/api/dashboard/stats", (_req, res) => {
  const db = readDb();
  res.json(computeStats(db));
});

app.get("/api/tickets", (_req, res) => {
  const db = readDb();
  res.json(db.tickets);
});

app.post("/api/tickets", (req, res) => {
  const db = readDb();
  const payload = req.body || {};
  if (payload.id == null) return res.status(400).json({ error: "id required" });
  const i = db.tickets.findIndex((x) => safeId(x.id) === safeId(payload.id));
  if (i >= 0) db.tickets[i] = { ...db.tickets[i], ...payload };
  else db.tickets.push(payload);
  writeDb(db);
  res.json({ ok: true });
});

app.put("/api/tickets/:id", (req, res) => {
  const db = readDb();
  const id = safeId(req.params.id);
  const i = db.tickets.findIndex((x) => safeId(x.id) === id);
  if (i < 0) return res.status(404).json({ error: "not found" });
  db.tickets[i] = { ...db.tickets[i], ...(req.body || {}), id: db.tickets[i].id };
  writeDb(db);
  res.json({ ok: true });
});

app.delete("/api/tickets/:id", (req, res) => {
  const db = readDb();
  const id = safeId(req.params.id);
  db.tickets = db.tickets.filter((x) => safeId(x.id) !== id);
  writeDb(db);
  res.json({ ok: true });
});

app.get("/api/departments", (_req, res) => {
  const db = readDb();
  res.json(db.departments);
});

app.post("/api/departments", (req, res) => {
  const db = readDb();
  const payload = req.body || {};
  const name = safeId(payload.name).trim();
  if (!name) return res.status(400).json({ error: "name required" });
  const i = db.departments.findIndex((x) => safeId(x.name).toLowerCase() === name.toLowerCase());
  if (i >= 0) db.departments[i] = { ...db.departments[i], ...payload, name: db.departments[i].name };
  else db.departments.push({ ...payload, name });
  writeDb(db);
  res.json({ ok: true });
});

app.put("/api/departments/:name", (req, res) => {
  const db = readDb();
  const name = safeId(req.params.name).trim().toLowerCase();
  const i = db.departments.findIndex((x) => safeId(x.name).toLowerCase() === name);
  if (i < 0) return res.status(404).json({ error: "not found" });
  db.departments[i] = { ...db.departments[i], ...(req.body || {}), name: db.departments[i].name };
  writeDb(db);
  res.json({ ok: true });
});

app.delete("/api/departments/:name", (req, res) => {
  const db = readDb();
  const name = safeId(req.params.name).trim().toLowerCase();
  db.departments = db.departments.filter((x) => safeId(x.name).toLowerCase() !== name);
  writeDb(db);
  res.json({ ok: true });
});

app.get("/api/devices", (_req, res) => {
  const db = readDb();
  res.json(db.devices);
});

app.post("/api/devices", (req, res) => {
  const db = readDb();
  const payload = req.body || {};
  if (payload.id == null) return res.status(400).json({ error: "id required" });
  const i = db.devices.findIndex((x) => safeId(x.id) === safeId(payload.id));
  if (i >= 0) db.devices[i] = { ...db.devices[i], ...payload };
  else db.devices.push(payload);
  writeDb(db);
  res.json({ ok: true });
});

app.put("/api/devices/:id", (req, res) => {
  const db = readDb();
  const id = safeId(req.params.id);
  const i = db.devices.findIndex((x) => safeId(x.id) === id);
  if (i < 0) return res.status(404).json({ error: "not found" });
  db.devices[i] = { ...db.devices[i], ...(req.body || {}), id: db.devices[i].id };
  writeDb(db);
  res.json({ ok: true });
});

app.delete("/api/devices/:id", (req, res) => {
  const db = readDb();
  const id = safeId(req.params.id);
  db.devices = db.devices.filter((x) => safeId(x.id) !== id);
  writeDb(db);
  res.json({ ok: true });
});

app.get("/api/expenses", (_req, res) => {
  const db = readDb();
  res.json(db.expenses);
});

app.post("/api/expenses", (req, res) => {
  const db = readDb();
  const payload = req.body || {};
  if (payload.id == null) return res.status(400).json({ error: "id required" });
  const i = db.expenses.findIndex((x) => safeId(x.id) === safeId(payload.id));
  if (i >= 0) db.expenses[i] = { ...db.expenses[i], ...payload };
  else db.expenses.push(payload);
  writeDb(db);
  res.json({ ok: true });
});

app.put("/api/expenses/:id", (req, res) => {
  const db = readDb();
  const id = safeId(req.params.id);
  const i = db.expenses.findIndex((x) => safeId(x.id) === id);
  if (i < 0) return res.status(404).json({ error: "not found" });
  db.expenses[i] = { ...db.expenses[i], ...(req.body || {}), id: db.expenses[i].id };
  writeDb(db);
  res.json({ ok: true });
});

app.delete("/api/expenses/:id", (req, res) => {
  const db = readDb();
  const id = safeId(req.params.id);
  db.expenses = db.expenses.filter((x) => safeId(x.id) !== id);
  writeDb(db);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`TI Dashboard backend running on http://localhost:${PORT}`);
});
