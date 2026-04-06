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

/** Clé anon / publishable JWT — requise pour les routes /api/tickets-rls (RLS avec JWT utilisateur). */
function getSupabaseAnonKey() {
  return envTrim("SUPABASE_ANON_KEY") || envTrim("NEXT_PUBLIC_SUPABASE_ANON_KEY");
}

/** Client service_role uniquement (RPC, lecture profiles admin). */
function getSupabaseServiceOnly() {
  const url = envTrim("SUPABASE_URL");
  const key = envTrim("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function createUserScopedSupabaseClient(authHeader) {
  const url = envTrim("SUPABASE_URL");
  const anon = getSupabaseAnonKey();
  if (!url || !anon) return null;
  return createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function stripTicketTransportFields(body) {
  const t = { ...(body || {}) };
  delete t.assigneeEmail;
  delete t.assigneeCleared;
  delete t.createdByAuthId;
  delete t.assignedToAuthId;
  return t;
}

function diaTicketRowToAppTicket(row) {
  const p = row.payload && typeof row.payload === "object" ? { ...row.payload } : {};
  if (row.id != null) p.id = row.id;
  return p;
}

async function resolveAssigneeUuidFromEmail(serviceClient, email) {
  if (!serviceClient || !email || !String(email).trim()) return null;
  const { data, error } = await serviceClient.rpc("diatech_auth_id_by_email", {
    em: String(email).trim(),
  });
  if (error) {
    console.warn("[tickets-rls] diatech_auth_id_by_email:", error.message || error);
    return null;
  }
  return data || null;
}

/** @returns {Promise<'admin'|'agent'|'user'|null>} */
async function fetchProfileRole(serviceClient, userId) {
  if (!serviceClient || !userId) return null;
  const { data } = await serviceClient.from("profiles").select("role").eq("id", userId).maybeSingle();
  const r = String(data?.role || "").toLowerCase();
  if (r === "admin" || r === "agent" || r === "user") return r;
  return "user";
}

function profileMayAssignTickets(role) {
  return role === "admin" || role === "agent";
}

function sameTicketAssignedUserId(a, b) {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return Number(a) === Number(b);
}

/** Met à jour app_state.tickets depuis dia_tickets (service_role) pour /api/dashboard/stats et le reste. */
async function syncAppStateTicketsFromDiaIfEnabled() {
  if (String(envTrim("TICKETS_DUAL_WRITE_APP_STATE") || "").toLowerCase() !== "1") return;
  const svc = getSupabaseServiceOnly();
  if (!svc) return;
  const { data: rows, error } = await svc
    .from("dia_tickets")
    .select("id,payload")
    .order("id", { ascending: true });
  if (error) {
    console.warn("[tickets-rls] sync app_state:", error.message || error);
    return;
  }
  const tickets = (rows || []).map((r) => diaTicketRowToAppTicket(r));
  try {
    const db = await readDb();
    db.tickets = tickets;
    await writeDb(db);
  } catch (e) {
    console.warn("[tickets-rls] writeDb after sync:", e?.message || e);
  }
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

/** Tickets avec RLS Supabase (JWT utilisateur → politiques sur public.dia_tickets). */
app.get("/api/tickets-rls", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !String(authHeader).toLowerCase().startsWith("bearer ")) {
    return res.status(401).json({ error: "missing_bearer" });
  }
  const userClient = createUserScopedSupabaseClient(authHeader);
  if (!userClient) {
    return res.status(503).json({ error: "tickets_rls_misconfigured", detail: "SUPABASE_URL + SUPABASE_ANON_KEY" });
  }
  const { data, error } = await userClient
    .from("dia_tickets")
    .select("id,payload,created_by,assigned_to")
    .order("id", { ascending: true });
  if (error) return res.status(400).json({ error: error.message, code: error.code });
  res.json((data || []).map(diaTicketRowToAppTicket));
});

app.post("/api/tickets-rls", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !String(authHeader).toLowerCase().startsWith("bearer ")) {
    return res.status(401).json({ error: "missing_bearer" });
  }
  const token = String(authHeader).replace(/^Bearer\s+/i, "").trim();
  const url = envTrim("SUPABASE_URL");
  const anon = getSupabaseAnonKey();
  if (!url || !anon) {
    return res.status(503).json({ error: "tickets_rls_misconfigured", detail: "SUPABASE_URL + SUPABASE_ANON_KEY" });
  }

  const anonAuth = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: authErr } = await anonAuth.auth.getUser(token);
  if (authErr || !userData?.user) {
    return res.status(401).json({ error: "invalid_token" });
  }
  const uid = userData.user.id;

  const svc = getSupabaseServiceOnly();
  const profileRole = svc ? await fetchProfileRole(svc, uid) : null;
  const mayAssign = profileMayAssignTickets(profileRole);

  const body = req.body || {};
  const id = Number(body.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "id required (number)" });

  const userClient = createUserScopedSupabaseClient(authHeader);
  const { data: existing, error: exErr } = await userClient
    .from("dia_tickets")
    .select("id,payload,created_by,assigned_to")
    .eq("id", id)
    .maybeSingle();
  if (exErr) return res.status(400).json({ error: exErr.message });

  const base = existing?.payload && typeof existing.payload === "object" ? { ...existing.payload } : {};
  const merged = { ...base, ...stripTicketTransportFields(body) };
  merged.id = id;

  let created_by = existing ? existing.created_by : uid;
  let assigned_to = existing ? existing.assigned_to : null;

  if (!mayAssign) {
    const triesAssignTransport =
      body.assigneeCleared === true ||
      body.assigneeCleared === "true" ||
      (body.assigneeEmail != null && String(body.assigneeEmail).trim() !== "") ||
      (body.assignedToAuthId !== undefined &&
        body.assignedToAuthId !== null &&
        String(body.assignedToAuthId).trim() !== "");
    if (triesAssignTransport) {
      return res.status(403).json({
        error: "assign_forbidden",
        detail: "Only admin and agent may assign or unassign tickets.",
      });
    }
    if (existing && !sameTicketAssignedUserId(base.assignedUserId, merged.assignedUserId)) {
      return res.status(403).json({
        error: "assign_forbidden",
        detail: "Only admin and agent may change ticket assignee.",
      });
    }
    if (existing) {
      merged.assignedUserId = base.assignedUserId ?? null;
    } else {
      merged.assignedUserId = null;
    }
  } else if (svc) {
    if (body.assigneeCleared === true || body.assigneeCleared === "true") {
      assigned_to = null;
      merged.assignedUserId = null;
    } else if (body.assigneeEmail != null && String(body.assigneeEmail).trim() !== "") {
      const ru = await resolveAssigneeUuidFromEmail(svc, body.assigneeEmail);
      if (ru) assigned_to = ru;
    } else if (body.assignedToAuthId !== undefined && body.assignedToAuthId !== null && body.assignedToAuthId !== "") {
      assigned_to = String(body.assignedToAuthId);
    } else if (
      body.assigneeEmail === "" &&
      (body.assignedUserId === null || body.assignedUserId === undefined || body.assignedUserId === "")
    ) {
      assigned_to = null;
      merged.assignedUserId = null;
    }
  } else if (existing) {
    assigned_to = existing.assigned_to;
  }

  if (!existing) {
    const row = { id, payload: merged, created_by: uid, assigned_to };
    const { error: insErr } = await userClient.from("dia_tickets").insert(row);
    if (insErr) return res.status(400).json({ error: insErr.message, code: insErr.code });
    await syncAppStateTicketsFromDiaIfEnabled();
    return res.json({ ok: true });
  }

  const { error: upErr } = await userClient
    .from("dia_tickets")
    .update({
      payload: merged,
      assigned_to,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (upErr) return res.status(400).json({ error: upErr.message, code: upErr.code });
  await syncAppStateTicketsFromDiaIfEnabled();
  return res.json({ ok: true });
});

app.delete("/api/tickets-rls/:id", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !String(authHeader).toLowerCase().startsWith("bearer ")) {
    return res.status(401).json({ error: "missing_bearer" });
  }
  const userClient = createUserScopedSupabaseClient(authHeader);
  if (!userClient) {
    return res.status(503).json({ error: "tickets_rls_misconfigured" });
  }
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid id" });
  const { error } = await userClient.from("dia_tickets").delete().eq("id", id);
  if (error) return res.status(400).json({ error: error.message, code: error.code });
  await syncAppStateTicketsFromDiaIfEnabled();
  res.json({ ok: true });
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
