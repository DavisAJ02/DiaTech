const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const app = express();
const PORT = Number(process.env.PORT || 3001);
const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), "backend", "db.json");
const APP_STATE_TABLE = process.env.SUPABASE_APP_STATE_TABLE || "app_state";
const DATA_KEYS = [
  "inventory",
  "consumables",
  "consumableLogs",
  "tickets",
  "departments",
  "devices",
  "expenses",
  "expenseMonthlyBudget",
  "alertRules",
  "slaPolicies",
];

let supabase = null;

app.use(cors({ origin: true, credentials: false }));
app.use(express.json({ limit: "1mb" }));

function envTrim(name) {
  const v = process.env[name];
  if (v == null) return "";
  return String(v).replace(/\r/g, "").trim();
}

function emptyDb() {
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

function hasSupabaseConfig() {
  const url = envTrim("SUPABASE_URL");
  const key = envTrim("SUPABASE_SERVICE_ROLE_KEY") || envTrim("SUPABASE_ANON_KEY");
  return Boolean(url && key);
}

function getSupabase() {
  if (!hasSupabaseConfig()) return null;
  if (supabase) return supabase;
  const url = envTrim("SUPABASE_URL");
  const key = envTrim("SUPABASE_SERVICE_ROLE_KEY") || envTrim("SUPABASE_ANON_KEY");
  supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return supabase;
}

function sanitizeDb(parsed) {
  return {
    inventory: Array.isArray(parsed.inventory) ? parsed.inventory : [],
    consumables: Array.isArray(parsed.consumables) ? parsed.consumables : [],
    consumableLogs: Array.isArray(parsed.consumableLogs) ? parsed.consumableLogs : [],
    tickets: Array.isArray(parsed.tickets) ? parsed.tickets : [],
    departments: Array.isArray(parsed.departments) ? parsed.departments : [],
    devices: Array.isArray(parsed.devices) ? parsed.devices : [],
    expenses: Array.isArray(parsed.expenses) ? parsed.expenses : [],
    expenseMonthlyBudget: Number(parsed.expenseMonthlyBudget) || 0,
    alertRules:
      parsed.alertRules && typeof parsed.alertRules === "object" && !Array.isArray(parsed.alertRules)
        ? parsed.alertRules
        : {},
    slaPolicies: Array.isArray(parsed.slaPolicies) ? parsed.slaPolicies : [],
  };
}

/** Deep JSON-safe value for jsonb (no undefined, no Date/BigInt loss). */
function cloneJsonbValue(key, v) {
  try {
    return JSON.parse(
      JSON.stringify(v, (_prop, val) => {
        if (typeof val === "bigint") return Number(val);
        return val;
      })
    );
  } catch (e) {
    throw new Error(`app_state key "${key}" is not JSON-serializable: ${e?.message || e}`);
  }
}

async function readDbFromSupabase() {
  const client = getSupabase();
  if (!client) return null;
  const { data, error } = await client
    .from(APP_STATE_TABLE)
    .select("key,value")
    .in("key", DATA_KEYS);
  if (error) throw error;

  const db = emptyDb();
  (data || []).forEach((row) => {
    if (!row || !DATA_KEYS.includes(row.key)) return;
    db[row.key] = row.value;
  });
  return sanitizeDb(db);
}

async function writeDbToSupabase(db) {
  const client = getSupabase();
  if (!client) return false;
  const normalized = sanitizeDb(db);
  const rows = DATA_KEYS.map((key) => ({ key, value: cloneJsonbValue(key, normalized[key]) }));

  let { error } = await client.from(APP_STATE_TABLE).upsert(rows, { onConflict: "key" });
  if (!error) return true;

  console.warn("Bulk app_state upsert failed, retrying per-key:", error.message || error);

  for (const row of rows) {
    const r = await client.from(APP_STATE_TABLE).upsert([row], { onConflict: "key" });
    if (r.error) {
      const msg = [r.error.message, r.error.details, r.error.hint].filter(Boolean).join(" | ");
      throw new Error(`Supabase app_state["${row.key}"]: ${msg || JSON.stringify(r.error)}`);
    }
  }
  return true;
}

function isDbEffectivelyEmpty(db) {
  if (!db) return true;
  const inv = Array.isArray(db.inventory) ? db.inventory.length : 0;
  const tix = Array.isArray(db.tickets) ? db.tickets.length : 0;
  const dep = Array.isArray(db.departments) ? db.departments.length : 0;
  const dev = Array.isArray(db.devices) ? db.devices.length : 0;
  const exp = Array.isArray(db.expenses) ? db.expenses.length : 0;
  const cons = Array.isArray(db.consumables) ? db.consumables.length : 0;
  return inv + tix + dep + dev + exp + cons === 0;
}

async function loadBundledSeedDb() {
  const candidates = [
    path.join(__dirname, "..", "backend", "db.json"),
    path.join(process.cwd(), "backend", "db.json"),
  ];
  for (const p of candidates) {
    try {
      const raw = await fs.promises.readFile(p, "utf8");
      const parsed = JSON.parse(raw);
      return sanitizeDb(parsed);
    } catch (_e) {
      continue;
    }
  }
  return null;
}

async function readDbFromFile() {
  try {
    const raw = await fs.promises.readFile(DB_PATH, "utf8");
    return sanitizeDb(JSON.parse(raw));
  } catch (_e) {
    return emptyDb();
  }
}

async function writeDbToFile(data) {
  await fs.promises.writeFile(DB_PATH, JSON.stringify(data, null, 2), "utf8");
}

async function readDb() {
  if (hasSupabaseConfig()) {
    try {
      const db = await readDbFromSupabase();
      if (db && isDbEffectivelyEmpty(db)) {
        const seed = await loadBundledSeedDb();
        if (seed && !isDbEffectivelyEmpty(seed)) {
          try {
            await writeDbToSupabase(seed);
            return seed;
          } catch (e) {
            console.error("Auto-seed to Supabase failed (serving bundled data for this request):", e?.message || e);
            return seed;
          }
        }
      }
      if (db) return db;
    } catch (e) {
      console.error("Supabase read failed, fallback to file DB:", e?.message || e);
    }
  }
  return readDbFromFile();
}

async function writeDb(data) {
  const db = sanitizeDb(data);
  if (hasSupabaseConfig()) {
    try {
      await writeDbToSupabase(db);
      return;
    } catch (e) {
      console.error("Supabase write failed:", e?.message || e);
      throw e;
    }
  }
  await writeDbToFile(db);
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
  res.json({
    ok: true,
    service: "ti-dashboard-api",
    storage: hasSupabaseConfig() ? "supabase" : "file",
  });
});

app.post("/api/bootstrap", async (req, res) => {
  const body = req.body || {};
  const db = await readDb();
  if (Array.isArray(body.inventory) && db.inventory.length === 0) db.inventory = body.inventory;
  if (Array.isArray(body.consumables) && db.consumables.length === 0) db.consumables = body.consumables;
  if (Array.isArray(body.consumableLogs) && db.consumableLogs.length === 0) db.consumableLogs = body.consumableLogs;
  if (Array.isArray(body.tickets) && db.tickets.length === 0) db.tickets = body.tickets;
  if (Array.isArray(body.departments) && db.departments.length === 0) db.departments = body.departments;
  if (Array.isArray(body.devices) && db.devices.length === 0) db.devices = body.devices;
  if (Array.isArray(body.expenses) && db.expenses.length === 0) db.expenses = body.expenses;
  if (body.expenseMonthlyBudget != null && !db.expenseMonthlyBudget) db.expenseMonthlyBudget = Number(body.expenseMonthlyBudget) || 0;
  if (body.alertRules && typeof body.alertRules === "object" && Object.keys(db.alertRules || {}).length === 0) db.alertRules = body.alertRules;
  if (Array.isArray(body.slaPolicies) && db.slaPolicies.length === 0) db.slaPolicies = body.slaPolicies;
  await writeDb(db);
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
    },
  });
});

app.get("/api/app-data", async (_req, res) => {
  const db = await readDb();
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

app.post("/api/app-data", async (req, res) => {
  const db = await readDb();
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
  await writeDb(db);
  res.json({ ok: true });
});

app.get("/api/inventory", async (_req, res) => {
  const db = await readDb();
  res.json(db.inventory);
});

app.post("/api/inventory", async (req, res) => {
  const db = await readDb();
  const payload = req.body || {};
  if (!payload.id) return res.status(400).json({ error: "id required" });
  const i = db.inventory.findIndex((x) => safeId(x.id) === safeId(payload.id));
  if (i >= 0) db.inventory[i] = { ...db.inventory[i], ...payload };
  else db.inventory.push(payload);
  await writeDb(db);
  res.json({ ok: true });
});

app.put("/api/inventory/:id", async (req, res) => {
  const db = await readDb();
  const id = safeId(req.params.id);
  const i = db.inventory.findIndex((x) => safeId(x.id) === id);
  if (i < 0) return res.status(404).json({ error: "not found" });
  db.inventory[i] = { ...db.inventory[i], ...(req.body || {}), id: db.inventory[i].id };
  await writeDb(db);
  res.json({ ok: true });
});

app.delete("/api/inventory/:id", async (req, res) => {
  const db = await readDb();
  const id = safeId(req.params.id);
  db.inventory = db.inventory.filter((x) => safeId(x.id) !== id);
  await writeDb(db);
  res.json({ ok: true });
});

app.get("/api/consumables", async (_req, res) => {
  const db = await readDb();
  res.json(db.consumables);
});

app.post("/api/consumables", async (req, res) => {
  const db = await readDb();
  const payload = req.body || {};
  if (!payload.id) return res.status(400).json({ error: "id required" });
  const i = db.consumables.findIndex((x) => safeId(x.id) === safeId(payload.id));
  if (i >= 0) db.consumables[i] = { ...db.consumables[i], ...payload };
  else db.consumables.push(payload);
  await writeDb(db);
  res.json({ ok: true });
});

app.put("/api/consumables/:id", async (req, res) => {
  const db = await readDb();
  const id = safeId(req.params.id);
  const i = db.consumables.findIndex((x) => safeId(x.id) === id);
  if (i < 0) return res.status(404).json({ error: "not found" });
  db.consumables[i] = { ...db.consumables[i], ...(req.body || {}), id: db.consumables[i].id };
  await writeDb(db);
  res.json({ ok: true });
});

app.delete("/api/consumables/:id", async (req, res) => {
  const db = await readDb();
  const id = safeId(req.params.id);
  db.consumables = db.consumables.filter((x) => safeId(x.id) !== id);
  await writeDb(db);
  res.json({ ok: true });
});

app.get("/api/consumables/logs", async (_req, res) => {
  const db = await readDb();
  res.json(db.consumableLogs);
});

app.post("/api/consumables/:id/movements", async (req, res) => {
  const db = await readDb();
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
  await writeDb(db);
  res.json({ ok: true, stockActuel: c.stockActuel });
});

app.get("/api/dashboard/stats", async (_req, res) => {
  const db = await readDb();
  res.json(computeStats(db));
});

app.get("/api/tickets", async (_req, res) => {
  const db = await readDb();
  res.json(db.tickets);
});

app.post("/api/tickets", async (req, res) => {
  const db = await readDb();
  const payload = req.body || {};
  if (payload.id == null) return res.status(400).json({ error: "id required" });
  const i = db.tickets.findIndex((x) => safeId(x.id) === safeId(payload.id));
  if (i >= 0) db.tickets[i] = { ...db.tickets[i], ...payload };
  else db.tickets.push(payload);
  await writeDb(db);
  res.json({ ok: true });
});

app.put("/api/tickets/:id", async (req, res) => {
  const db = await readDb();
  const id = safeId(req.params.id);
  const i = db.tickets.findIndex((x) => safeId(x.id) === id);
  if (i < 0) return res.status(404).json({ error: "not found" });
  db.tickets[i] = { ...db.tickets[i], ...(req.body || {}), id: db.tickets[i].id };
  await writeDb(db);
  res.json({ ok: true });
});

app.delete("/api/tickets/:id", async (req, res) => {
  const db = await readDb();
  const id = safeId(req.params.id);
  db.tickets = db.tickets.filter((x) => safeId(x.id) !== id);
  await writeDb(db);
  res.json({ ok: true });
});

app.get("/api/departments", async (_req, res) => {
  const db = await readDb();
  res.json(db.departments);
});

app.post("/api/departments", async (req, res) => {
  const db = await readDb();
  const payload = req.body || {};
  const name = safeId(payload.name).trim();
  if (!name) return res.status(400).json({ error: "name required" });
  const i = db.departments.findIndex((x) => safeId(x.name).toLowerCase() === name.toLowerCase());
  if (i >= 0) db.departments[i] = { ...db.departments[i], ...payload, name: db.departments[i].name };
  else db.departments.push({ ...payload, name });
  await writeDb(db);
  res.json({ ok: true });
});

app.put("/api/departments/:name", async (req, res) => {
  const db = await readDb();
  const name = safeId(req.params.name).trim().toLowerCase();
  const i = db.departments.findIndex((x) => safeId(x.name).toLowerCase() === name);
  if (i < 0) return res.status(404).json({ error: "not found" });
  db.departments[i] = { ...db.departments[i], ...(req.body || {}), name: db.departments[i].name };
  await writeDb(db);
  res.json({ ok: true });
});

app.delete("/api/departments/:name", async (req, res) => {
  const db = await readDb();
  const name = safeId(req.params.name).trim().toLowerCase();
  db.departments = db.departments.filter((x) => safeId(x.name).toLowerCase() !== name);
  await writeDb(db);
  res.json({ ok: true });
});

app.get("/api/devices", async (_req, res) => {
  const db = await readDb();
  res.json(db.devices);
});

app.post("/api/devices", async (req, res) => {
  const db = await readDb();
  const payload = req.body || {};
  if (payload.id == null) return res.status(400).json({ error: "id required" });
  const i = db.devices.findIndex((x) => safeId(x.id) === safeId(payload.id));
  if (i >= 0) db.devices[i] = { ...db.devices[i], ...payload };
  else db.devices.push(payload);
  await writeDb(db);
  res.json({ ok: true });
});

app.put("/api/devices/:id", async (req, res) => {
  const db = await readDb();
  const id = safeId(req.params.id);
  const i = db.devices.findIndex((x) => safeId(x.id) === id);
  if (i < 0) return res.status(404).json({ error: "not found" });
  db.devices[i] = { ...db.devices[i], ...(req.body || {}), id: db.devices[i].id };
  await writeDb(db);
  res.json({ ok: true });
});

app.delete("/api/devices/:id", async (req, res) => {
  const db = await readDb();
  const id = safeId(req.params.id);
  db.devices = db.devices.filter((x) => safeId(x.id) !== id);
  await writeDb(db);
  res.json({ ok: true });
});

app.get("/api/expenses", async (_req, res) => {
  const db = await readDb();
  res.json(db.expenses);
});

app.post("/api/expenses", async (req, res) => {
  const db = await readDb();
  const payload = req.body || {};
  if (payload.id == null) return res.status(400).json({ error: "id required" });
  const i = db.expenses.findIndex((x) => safeId(x.id) === safeId(payload.id));
  if (i >= 0) db.expenses[i] = { ...db.expenses[i], ...payload };
  else db.expenses.push(payload);
  await writeDb(db);
  res.json({ ok: true });
});

app.put("/api/expenses/:id", async (req, res) => {
  const db = await readDb();
  const id = safeId(req.params.id);
  const i = db.expenses.findIndex((x) => safeId(x.id) === id);
  if (i < 0) return res.status(404).json({ error: "not found" });
  db.expenses[i] = { ...db.expenses[i], ...(req.body || {}), id: db.expenses[i].id };
  await writeDb(db);
  res.json({ ok: true });
});

app.delete("/api/expenses/:id", async (req, res) => {
  const db = await readDb();
  const id = safeId(req.params.id);
  db.expenses = db.expenses.filter((x) => safeId(x.id) !== id);
  await writeDb(db);
  res.json({ ok: true });
});

app.use((err, _req, res, _next) => {
  if (res.headersSent) return;
  console.error("API error:", err?.message || err);
  res.status(500).json({ error: "internal_error", message: String(err?.message || err) });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`TI Dashboard API running on http://localhost:${PORT}`);
  });
}

module.exports = app;
