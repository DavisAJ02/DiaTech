(function () {
  const html = document.documentElement;
  if (localStorage.getItem("theme")) html.dataset.theme = localStorage.getItem("theme");
  document.getElementById("theme-toggle")?.addEventListener("click", () => {
    const d = html.dataset.theme === "dark";
    html.dataset.theme = d ? "" : "dark";
    localStorage.setItem("theme", d ? "" : "dark");
  });

  const THIS_YEAR = new Date().getFullYear();
  const DEPARTMENTS = [
    "Direction",
    "Secretariat",
    "Finance & Comptabilité",
    "Facturation",
    "Médical",
    "Relation Contractuelle",
    "Nursing",
    "Hospitalisation",
    "Dialyse",
    "Laboratoire",
    "Imagerie",
    "Pharmacie",
    "IT",
    "Maintenance",
    "Logistique",
    "Inventaire",
    "Facilities Management",
    "Achat",
    "Qualité",
    "Project Management",
    "Marketing & Commercial"
  ];
  const STORAGE_LOCATIONS = ["Stock TI", "Stock warehouse"];

  let currentTab = "all";
  let lastSavedAssetId = null;
  const CONSUMABLES_KEY = "cmd_consumables_v1";
  const CONSUMABLE_LOGS_KEY = "cmd_consumable_logs_v1";
  const API_BASE = (() => {
    const fromWindow = typeof window !== "undefined" ? String(window.__API_BASE__ || "").trim() : "";
    const fromStorage = typeof localStorage !== "undefined" ? String(localStorage.getItem("ti_api_base") || "").trim() : "";
    const explicit = (fromWindow || fromStorage).replace(/\/+$/, "");
    if (explicit) return explicit;
    const host = String(window?.location?.hostname || "").toLowerCase();
    if (host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0") return "http://localhost:3001/api";
    return `${window.location.origin}/api`;
  })();
  const consRowMenu = document.getElementById("cons-row-menu");
  let activeConsumableId = null;
  let activeConsumableRow = null;
  let apiOnline = false;

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function normStr(v, fallback = "") {
    return typeof v === "string" ? v.trim() : fallback;
  }

  function normalizeCondition(v) {
    const x = String(v || "").toLowerCase();
    if (x === "bon" || x === "moyen" || x === "mauvais") return x;
    return "bon";
  }

  function normalizeStatus(v) {
    const x = String(v || "");
    if (x === "in-use" || x === "in-stock" || x === "retired") return x;
    return "in-use";
  }

  function normalizeLifecycle(v) {
    const x = String(v || "");
    if (x === "purchase" || x === "assignment" || x === "maintenance" || x === "retirement") return x;
    return "assignment";
  }

  function parseYear(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function normalizeDepartment(dep) {
    const raw = normStr(dep, "");
    if (DEPARTMENTS.includes(raw)) return raw;
    return "";
  }

  function safePrefixFromCategory(category) {
    const map = {
      Ordinateur: "PC",
      Imprimante: "IMP",
      "Téléphone CISCO": "CIS",
      "Telephone CISCO": "CIS",
      Tablette: "TAB",
      Dymo: "DYM"
    };
    if (map[category]) return map[category];
    const raw = String(category || "EQ").replace(/[^A-Za-z]/g, "").toUpperCase();
    return (raw.slice(0, 3) || "EQ");
  }

  function ensureUniqueId(candidate, used) {
    if (!used.has(candidate)) return candidate;
    const m = String(candidate).match(/^([A-Z]+)-(\d+)$/);
    if (!m) {
      let i = 2;
      let next = `${candidate}-${i}`;
      while (used.has(next)) {
        i += 1;
        next = `${candidate}-${i}`;
      }
      return next;
    }
    const prefix = m[1];
    let n = Number(m[2]);
    let next = candidate;
    while (used.has(next)) {
      n += 1;
      next = `${prefix}-${String(n).padStart(3, "0")}`;
    }
    return next;
  }

  function normalizeAsset(asset, usedIds) {
    const idRaw = normStr(asset?.id != null ? String(asset.id) : "", "");
    const category = normStr(asset?.category, "Ordinateur");
    const baseId = idRaw || `${safePrefixFromCategory(category)}-001`;
    const id = ensureUniqueId(baseId, usedIds);
    usedIds.add(id);

    return {
      id,
      name: normStr(asset?.name, "Equipement sans nom"),
      category,
      department: normalizeDepartment(asset?.department),
      location: normStr(asset?.location, ""),
      assignedUser: normStr(asset?.assignedUser, "-") || "-",
      condition: normalizeCondition(asset?.condition),
      acquisitionYear: parseYear(asset?.acquisitionYear),
      replacementYear: parseYear(asset?.replacementYear),
      status: normalizeStatus(asset?.status),
      lifecycle: normalizeLifecycle(asset?.lifecycle),
      specs: normStr(asset?.specs, ""),
      type: normStr(asset?.type, "")
    };
  }

  function normalizeInventory() {
    const used = new Set();
    DB.inventory = (DB.inventory || []).map((a) => normalizeAsset(a, used));
    if (typeof persistInventory === "function") persistInventory();
  }

  function condBadge(c) {
    const map = {
      bon: ["ok", "Bon etat"],
      moyen: ["warn", "Etat moyen"],
      mauvais: ["breach", "Mauvais etat"]
    };
    const pair = map[c] || ["flat", "—"];
    return `<span class="sla-badge ${pair[0]}">${pair[1]}</span>`;
  }

  function replBadge(year) {
    if (!year) return '<span style="color:var(--text-subtle)">—</span>';
    if (year < THIS_YEAR) return `<span class="sla-badge breach">${year} !</span>`;
    if (year <= THIS_YEAR + 1) return `<span class="sla-badge warn">${year}</span>`;
    return `<span class="sla-badge ok">${year}</span>`;
  }

  function titleForTab(tab) {
    if (tab === "all") return "Tous les equipements";
    if (tab === "Ordinateur") return "Ordinateurs";
    if (tab === "Imprimante") return "Imprimantes";
    if (tab === "Téléphone CISCO" || tab === "Telephone CISCO") return "Telephones CISCO";
    return `${tab}s`;
  }

  function getCategoryList() {
    const set = new Set(["Ordinateur", "Imprimante", "Téléphone CISCO", "Tablette", "Dymo"]);
    (DB.inventory || []).forEach((i) => i.category && set.add(i.category));
    return [...set];
  }

  function fillCategorySelect(selectedValue) {
    const sel = document.getElementById("asset-category");
    if (!sel) return;
    const cats = getCategoryList();
    sel.innerHTML = "";
    cats.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c;
      opt.textContent = c;
      sel.appendChild(opt);
    });
    const custom = document.createElement("option");
    custom.value = "__custom__";
    custom.textContent = "Autre (creer categorie)...";
    sel.appendChild(custom);
    sel.value = cats.includes(selectedValue) ? selectedValue : cats[0];
  }

  function syncCategoryCustomInput() {
    const sel = document.getElementById("asset-category");
    const wrap = document.getElementById("asset-category-new-wrap");
    if (!sel || !wrap) return;
    wrap.style.display = sel.value === "__custom__" ? "flex" : "none";
  }

  function fillDepartmentSelect(selectedValue) {
    const sel = document.getElementById("asset-department");
    if (!sel) return;
    sel.innerHTML = '<option value="">Selectionner departement</option>';
    DEPARTMENTS.forEach((d) => {
      const opt = document.createElement("option");
      opt.value = d;
      opt.textContent = d;
      sel.appendChild(opt);
    });
    if (selectedValue && DEPARTMENTS.includes(selectedValue)) sel.value = selectedValue;
  }

  function showFeedback(message) {
    const box = document.getElementById("inv-feedback");
    if (!box) return;
    box.textContent = message;
    box.classList.add("show");
    window.setTimeout(() => box.classList.remove("show"), 2800);
  }

  function todayIso() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function loadConsumablesFromStorage() {
    try {
      const raw = localStorage.getItem(CONSUMABLES_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) DB.consumables = parsed;
    } catch (e) {
      console.warn("Consumables load failed", e);
    }
  }

  function persistConsumables() {
    try {
      localStorage.setItem(CONSUMABLES_KEY, JSON.stringify(DB.consumables || []));
    } catch (e) {
      console.warn("Consumables persist failed", e);
    }
  }

  function loadConsumableLogsFromStorage() {
    try {
      const raw = localStorage.getItem(CONSUMABLE_LOGS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) DB.consumableLogs = parsed;
    } catch (e) {
      console.warn("Consumable logs load failed", e);
    }
  }

  function persistConsumableLogs() {
    try {
      localStorage.setItem(CONSUMABLE_LOGS_KEY, JSON.stringify(DB.consumableLogs || []));
    } catch (e) {
      console.warn("Consumable logs persist failed", e);
    }
  }

  async function apiRequest(path, options = {}) {
    try {
      const method = String(options.method || "GET").toUpperCase();
      const res = await fetch(`${API_BASE}${path}`, {
        method: options.method || "GET",
        headers: {
          "Content-Type": "application/json",
          ...(options.headers || {})
        },
        body: options.body,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      apiOnline = true;
      if (method !== "GET" && method !== "HEAD" && typeof window.diatechNotifyDataChanged === "function") {
        window.diatechNotifyDataChanged("inventory");
      }
      if (res.status === 204) return null;
      return await res.json();
    } catch (e) {
      apiOnline = false;
      return null;
    }
  }

  async function hydrateFromApi() {
    const localInventory = Array.isArray(DB.inventory) ? DB.inventory.slice() : [];
    const localConsumables = Array.isArray(DB.consumables) ? DB.consumables.slice() : [];
    const localLogs = Array.isArray(DB.consumableLogs) ? DB.consumableLogs.slice() : [];
    const [inv, cons, logs] = await Promise.all([
      apiRequest("/inventory"),
      apiRequest("/consumables"),
      apiRequest("/consumables/logs"),
    ]);
    if (inv === null && cons === null && logs === null) return;

    if (Array.isArray(inv) && (inv.length > 0 || localInventory.length === 0)) DB.inventory = inv;
    if (Array.isArray(cons) && (cons.length > 0 || localConsumables.length === 0)) DB.consumables = cons;
    if (Array.isArray(logs) && (logs.length > 0 || localLogs.length === 0)) DB.consumableLogs = logs;

    if (apiOnline && Array.isArray(inv) && inv.length === 0 && localInventory.length > 0) {
      await apiRequest("/bootstrap", {
        method: "POST",
        body: JSON.stringify({
          inventory: localInventory,
          consumables: localConsumables,
          consumableLogs: localLogs,
          tickets: Array.isArray(DB.tickets) ? DB.tickets : []
        }),
      });
      const inv2 = await apiRequest("/inventory");
      const cons2 = await apiRequest("/consumables");
      const logs2 = await apiRequest("/consumables/logs");
      if (Array.isArray(inv2)) DB.inventory = inv2;
      if (Array.isArray(cons2)) DB.consumables = cons2;
      if (Array.isArray(logs2)) DB.consumableLogs = logs2;
    }
  }

  function upsertInventoryApi(asset) {
    if (!asset) return;
    void apiRequest("/inventory", {
      method: "POST",
      body: JSON.stringify(asset),
    });
  }

  function upsertConsumableApi(consumable) {
    if (!consumable) return;
    void apiRequest("/consumables", {
      method: "POST",
      body: JSON.stringify(consumable),
    });
  }

  function deleteConsumableApi(id) {
    if (id == null) return;
    void apiRequest(`/consumables/${encodeURIComponent(String(id))}`, {
      method: "DELETE",
    });
  }

  function postConsumableMovementApi(consumableId, payload) {
    if (!consumableId || !payload) return;
    void apiRequest(`/consumables/${encodeURIComponent(String(consumableId))}/movements`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  function closeConsumableRowMenu() {
    if (consRowMenu) {
      consRowMenu.classList.remove("show");
      consRowMenu.setAttribute("aria-hidden", "true");
    }
    if (activeConsumableRow) activeConsumableRow.classList.remove("menu-open");
    activeConsumableId = null;
    activeConsumableRow = null;
  }

  function openConsumableRowMenu(id, row, point) {
    if (!consRowMenu || !row) return;
    const rect = row.getBoundingClientRect();
    const clickX = point && typeof point.clientX === "number" ? point.clientX : rect.right;
    const clickY = point && typeof point.clientY === "number" ? point.clientY : rect.top + rect.height / 2;
    const openSame = activeConsumableId === id && consRowMenu.classList.contains("show");
    closeConsumableRowMenu();
    if (openSame) return;

    activeConsumableId = id;
    activeConsumableRow = row;
    row.classList.add("menu-open");
    consRowMenu.classList.add("show");
    consRowMenu.style.visibility = "hidden";

    const menuWidth = consRowMenu.offsetWidth || 170;
    const menuHeight = consRowMenu.offsetHeight || 176;
    const desiredLeft = clickX + 6;
    const desiredTop = clickY - 12;
    const maxLeft = window.innerWidth - menuWidth - 12;
    const maxTop = window.innerHeight - menuHeight - 12;
    consRowMenu.style.left = Math.max(12, Math.min(desiredLeft, maxLeft)) + "px";
    consRowMenu.style.top = Math.max(12, Math.min(desiredTop, maxTop)) + "px";
    consRowMenu.style.visibility = "";
    consRowMenu.setAttribute("aria-hidden", "false");
  }

  function sortItems(items) {
    const sortVal = document.getElementById("inv-sort")?.value || "name-asc";
    const [key, direction] = sortVal.split("-");
    const dir = direction === "desc" ? -1 : 1;
    const condOrder = { bon: 0, moyen: 1, mauvais: 2 };
    items.sort((a, b) => {
      if (key === "replacementYear") {
        const av = a.replacementYear == null ? 99999 : a.replacementYear;
        const bv = b.replacementYear == null ? 99999 : b.replacementYear;
        return (av - bv) * dir;
      }
      if (key === "condition") {
        return ((condOrder[a.condition] ?? 9) - (condOrder[b.condition] ?? 9)) * dir;
      }
      const av = String(a[key] || "").toLowerCase();
      const bv = String(b[key] || "").toLowerCase();
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
    return items;
  }

  function renderKPIs() {
    const inv = DB.inventory || [];
    const cons = DB.consumables || [];
    const total = inv.length;
    const good = inv.filter((i) => i.condition === "bon").length;
    const goodPct = total > 0 ? Math.round((good / total) * 100) : 0;
    const nearReplacement = inv.filter((i) => i.replacementYear && i.replacementYear <= THIS_YEAR + 1).length;
    const unassigned = inv.filter((i) => !i.assignedUser || i.assignedUser === "-").length;

    document.getElementById("inv-kpi-total").textContent = String(total);
    document.getElementById("inv-kpi-bon").textContent = String(good);
    document.getElementById("inv-kpi-moyen").textContent = String(inv.filter((i) => i.condition === "moyen").length);
    document.getElementById("inv-kpi-mauvais").textContent = String(inv.filter((i) => i.condition === "mauvais").length);
    document.getElementById("inv-kpi-replace").textContent = String(nearReplacement);
    document.getElementById("inv-kpi-stock").textContent = String(cons.filter((c) => c.stockActuel <= c.stockMin).length);

    const subTotal = document.getElementById("inv-kpi-sub-total");
    const subGood = document.getElementById("inv-kpi-sub-bon");
    if (subTotal) subTotal.textContent = `${unassigned} non assignes`;
    if (subGood) subGood.textContent = `${goodPct}% operationnels`;
  }

  function renderTable() {
    const search = (document.getElementById("inv-search")?.value || "").toLowerCase();
    const condF = document.getElementById("inv-filter-condition")?.value || "";
    const locF = document.getElementById("inv-filter-location")?.value || "";

    const items = (DB.inventory || []).filter((i) => {
      if (currentTab !== "all" && i.category !== currentTab) return false;
      if (condF && i.condition !== condF) return false;
      if (locF && i.location !== locF) return false;
      if (search) {
        const pool = [i.id, i.name, i.category, i.department, i.location, i.assignedUser, i.specs];
        const hit = pool.some((v) => v && String(v).toLowerCase().includes(search));
        if (!hit) return false;
      }
      return true;
    });

    sortItems(items);
    document.getElementById("inv-table-count").textContent = `${items.length} equipement(s)`;
    document.getElementById("inv-table-title").textContent = titleForTab(currentTab);

    document.getElementById("inv-table-body").innerHTML =
      items
        .map((i) => {
          const rowClass = String(i.id) === String(lastSavedAssetId) ? "inv-row-flash" : "";
          return `
      <tr class="${rowClass}" data-row-id="${escapeHtml(i.id)}">
        <td><span class="ticket-id">${escapeHtml(i.id)}</span></td>
        <td>
          <div class="ticket-name">${escapeHtml(i.name)}</div>
          <div style="font-size:11px;color:var(--text-subtle)">${escapeHtml(i.specs || "")}</div>
        </td>
        <td>${escapeHtml(i.category || "—")}</td>
        <td>${escapeHtml(i.department || "—")}</td>
        <td><span style="font-size:12px;color:var(--text-muted)">${escapeHtml(i.location || "—")}</span></td>
        <td>${i.assignedUser && i.assignedUser !== "-" ? `<span style="font-size:12px;font-weight:500">${escapeHtml(i.assignedUser)}</span>` : '<span style="color:var(--text-subtle)">—</span>'}</td>
        <td>${condBadge(i.condition)}</td>
        <td><span style="font-size:12px">${escapeHtml(i.acquisitionYear || "—")}</span></td>
        <td>${replBadge(i.replacementYear)}</td>
        <td><button class="btn-secondary" data-edit-id="${escapeHtml(i.id)}" style="font-size:11px;padding:4px 10px">Modifier</button></td>
      </tr>`;
        })
        .join("") ||
      '<tr><td colspan="10" style="text-align:center;color:var(--text-muted);padding:32px">Aucun resultat</td></tr>';

    if (lastSavedAssetId != null) {
      window.setTimeout(() => {
        document.querySelectorAll("[data-row-id]").forEach((row) => {
          if (row.getAttribute("data-row-id") === String(lastSavedAssetId)) {
            row.classList.remove("inv-row-flash");
          }
        });
        lastSavedAssetId = null;
      }, 1900);
    }
  }

  function validateForm(payload) {
    if (!payload.name) return "Le nom est obligatoire.";
    if (!payload.category) return "La categorie est obligatoire.";
    if (!payload.department) return "Le departement est obligatoire.";
    if (payload.acquisitionYear != null && payload.acquisitionYear > THIS_YEAR) {
      return "L'annee d'acquisition doit etre inferieure ou egale a l'annee courante.";
    }
    if (
      payload.acquisitionYear != null &&
      payload.replacementYear != null &&
      payload.replacementYear < payload.acquisitionYear
    ) {
      return "L'annee de remplacement doit etre superieure ou egale a l'annee d'acquisition.";
    }
    return "";
  }

  function getAssetById(id) {
    return (DB.inventory || []).find((a) => String(a.id) === String(id)) || null;
  }

  function openAssetModal(assetId) {
    const modal = document.getElementById("asset-modal");
    const err = document.getElementById("asset-form-error");
    if (!modal) return;
    if (err) err.textContent = "";
    fillCategorySelect();
    fillDepartmentSelect();

    const title = document.getElementById("asset-modal-title");
    const current = assetId ? getAssetById(assetId) : null;
    if (assetId && !current) return;

    document.getElementById("asset-id").value = current ? String(current.id) : "";
    document.getElementById("asset-name").value = current?.name || "";
    fillCategorySelect(current?.category || "");
    document.getElementById("asset-specs").value = current?.specs || "";
    document.getElementById("asset-type").value = current?.type || "";
    document.getElementById("asset-assignee").value = current?.assignedUser && current.assignedUser !== "-" ? current.assignedUser : "";
    fillDepartmentSelect(current?.department || "");
    document.getElementById("asset-location").value = current?.location || "";
    document.getElementById("asset-condition").value = current?.condition || "bon";
    document.getElementById("asset-acquisition-year").value = current?.acquisitionYear ?? "";
    document.getElementById("asset-replacement-year").value = current?.replacementYear ?? "";
    document.getElementById("asset-status").value = current?.status || "in-use";
    document.getElementById("asset-lifecycle").value = current?.lifecycle || "assignment";
    document.getElementById("asset-category-new").value = "";
    syncCategoryCustomInput();

    if (title) title.textContent = current ? "Modifier equipement" : "Ajouter equipement";
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
  }

  function closeAssetModal() {
    const modal = document.getElementById("asset-modal");
    if (!modal) return;
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
  }

  function nextAssetId(category) {
    const prefix = safePrefixFromCategory(category);
    const re = new RegExp(`^${prefix}-(\\d+)$`);
    const used = new Set((DB.inventory || []).map((a) => String(a.id)));
    const maxN = (DB.inventory || []).reduce((m, a) => {
      const mm = String(a.id || "").match(re);
      if (!mm) return m;
      const n = Number(mm[1]);
      return Number.isFinite(n) ? Math.max(m, n) : m;
    }, 0);
    let candidate = `${prefix}-${String(maxN + 1).padStart(3, "0")}`;
    while (used.has(candidate)) {
      const cur = Number(candidate.split("-")[1] || "0") + 1;
      candidate = `${prefix}-${String(cur).padStart(3, "0")}`;
    }
    return candidate;
  }

  function saveAsset() {
    const err = document.getElementById("asset-form-error");
    if (err) err.textContent = "";

    const idValue = document.getElementById("asset-id").value;
    const categoryRaw = document.getElementById("asset-category").value;
    const categoryCustom = normStr(document.getElementById("asset-category-new").value, "");
    const category = categoryRaw === "__custom__" ? categoryCustom : categoryRaw;
    const payload = {
      id: idValue,
      name: normStr(document.getElementById("asset-name").value, ""),
      category: normStr(category, ""),
      department: normStr(document.getElementById("asset-department").value, ""),
      location: normStr(document.getElementById("asset-location").value, ""),
      assignedUser: normStr(document.getElementById("asset-assignee").value, "-") || "-",
      condition: normalizeCondition(document.getElementById("asset-condition").value),
      acquisitionYear: parseYear(document.getElementById("asset-acquisition-year").value),
      replacementYear: parseYear(document.getElementById("asset-replacement-year").value),
      status: normalizeStatus(document.getElementById("asset-status").value),
      lifecycle: normalizeLifecycle(document.getElementById("asset-lifecycle").value),
      specs: normStr(document.getElementById("asset-specs").value, ""),
      type: normStr(document.getElementById("asset-type").value, "")
    };

    const validationError = validateForm(payload);
    if (validationError) {
      if (err) err.textContent = validationError;
      return;
    }

    if (idValue) {
      const row = getAssetById(idValue);
      if (!row) {
        if (err) err.textContent = "Equipement introuvable.";
        return;
      }
      Object.assign(row, {
        name: payload.name,
        category: payload.category,
        department: payload.department,
        location: payload.location,
        assignedUser: payload.assignedUser,
        condition: payload.condition,
        acquisitionYear: payload.acquisitionYear,
        replacementYear: payload.replacementYear,
        status: payload.status,
        lifecycle: payload.lifecycle,
        specs: payload.specs,
        type: payload.type
      });
      lastSavedAssetId = row.id;
    } else {
      const used = new Set((DB.inventory || []).map((a) => String(a.id)));
      const generated = ensureUniqueId(nextAssetId(payload.category), used);
      DB.inventory.push({
        id: generated,
        name: payload.name,
        category: payload.category,
        department: payload.department,
        location: payload.location,
        assignedUser: payload.assignedUser,
        condition: payload.condition,
        acquisitionYear: payload.acquisitionYear,
        replacementYear: payload.replacementYear,
        status: payload.status,
        lifecycle: payload.lifecycle,
        specs: payload.specs,
        type: payload.type
      });
      lastSavedAssetId = generated;
    }

    normalizeInventory();
    if (typeof persistInventory === "function") persistInventory();
    const savedAsset = getAssetById(lastSavedAssetId);
    upsertInventoryApi(savedAsset);
    closeAssetModal();
    renderKPIs();
    renderTable();
    fillCategorySelect();
    showFeedback("Equipement enregistre avec succes.");
  }

  function getConsumableById(id) {
    return (DB.consumables || []).find((c) => String(c.id) === String(id)) || null;
  }

  function nextConsumableId() {
    const used = new Set((DB.consumables || []).map((c) => String(c.id)));
    let n = 1;
    let id = `CON-${String(n).padStart(3, "0")}`;
    while (used.has(id)) {
      n += 1;
      id = `CON-${String(n).padStart(3, "0")}`;
    }
    return id;
  }

  function openConsumableModal(consumableId) {
    const modal = document.getElementById("consumable-modal");
    const err = document.getElementById("cons-form-error");
    const title = document.getElementById("consumable-modal-title");
    if (!modal) return;
    if (err) err.textContent = "";
    const c = consumableId ? getConsumableById(consumableId) : null;
    document.getElementById("cons-id").value = c ? String(c.id) : "";
    document.getElementById("cons-name").value = c?.name || "";
    document.getElementById("cons-category").value = c?.category || "Cartouche";
    document.getElementById("cons-stock").value = c?.stockActuel ?? 0;
    document.getElementById("cons-min").value = c?.stockMin ?? 0;
    document.getElementById("cons-unit").value = c?.unit || "unite";
    document.getElementById("cons-last-move").value = c?.dernierMouvement || todayIso();
    document.getElementById("cons-supplier").value = c?.fournisseur || "-";
    if (title) title.textContent = c ? "Modifier consommable" : "Ajouter consommable";
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
  }

  function closeConsumableModal() {
    const modal = document.getElementById("consumable-modal");
    if (!modal) return;
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
  }

  function saveConsumable() {
    const err = document.getElementById("cons-form-error");
    if (err) err.textContent = "";
    const idValue = document.getElementById("cons-id").value;
    const name = normStr(document.getElementById("cons-name").value, "");
    const category = normStr(document.getElementById("cons-category").value, "");
    const stockActuel = Math.max(0, Number(document.getElementById("cons-stock").value) || 0);
    const stockMin = Math.max(0, Number(document.getElementById("cons-min").value) || 0);
    const unit = normStr(document.getElementById("cons-unit").value, "unite");
    const dernierMouvement = document.getElementById("cons-last-move").value || todayIso();
    const fournisseur = normStr(document.getElementById("cons-supplier").value, "-");

    if (!name) return void (err.textContent = "Le nom du consommable est requis.");
    if (!category) return void (err.textContent = "La categorie est requise.");

    let savedConsumableId = idValue || "";
    if (idValue) {
      const row = getConsumableById(idValue);
      if (!row) return void (err.textContent = "Consommable introuvable.");
      Object.assign(row, { name, category, stockActuel, stockMin, unit, dernierMouvement, fournisseur });
      savedConsumableId = row.id;
    } else {
      DB.consumables = DB.consumables || [];
      const newId = nextConsumableId();
      DB.consumables.push({
        id: newId,
        name,
        category,
        stockActuel,
        stockMin,
        unit,
        dernierMouvement,
        fournisseur
      });
      savedConsumableId = newId;
    }

    persistConsumables();
    upsertConsumableApi(getConsumableById(savedConsumableId));
    closeConsumableModal();
    renderKPIs();
    renderConsumables();
    showFeedback("Consommable enregistre avec succes.");
  }

  function openConsumableMoveModal(type) {
    const c = getConsumableById(activeConsumableId);
    const modal = document.getElementById("cons-move-modal");
    const err = document.getElementById("cons-move-error");
    const title = document.getElementById("cons-move-title");
    if (!c || !modal) return;
    if (err) err.textContent = "";
    document.getElementById("cons-move-type").value = type;
    document.getElementById("cons-move-date").value = todayIso();
    fillConsumableMoveItems(c.id);
    fillConsumableMoveDepartments("");
    fillConsumableMoveStorage("");
    document.getElementById("cons-move-qty").value = "";
    document.getElementById("cons-move-department-new").value = "";
    document.getElementById("cons-move-storage-new").value = "";
    syncConsumableMoveContextByType(type);
    if (title) title.textContent = type === "entree" ? `Entree stock - ${c.name}` : `Sortie stock - ${c.name}`;
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
  }

  function fillConsumableMoveItems(selectedId) {
    const sel = document.getElementById("cons-move-item");
    if (!sel) return;
    sel.innerHTML = "";
    (DB.consumables || []).forEach((c) => {
      const opt = document.createElement("option");
      opt.value = String(c.id);
      opt.textContent = c.name;
      sel.appendChild(opt);
    });
    if (selectedId != null) sel.value = String(selectedId);
  }

  function fillConsumableMoveDepartments(selectedValue) {
    const sel = document.getElementById("cons-move-department");
    if (!sel) return;
    sel.innerHTML = '<option value="">Selectionner departement</option>';
    DEPARTMENTS.forEach((d) => {
      const opt = document.createElement("option");
      opt.value = d;
      opt.textContent = d;
      sel.appendChild(opt);
    });
    const custom = document.createElement("option");
    custom.value = "__custom__";
    custom.textContent = "Autre (ajouter departement)...";
    sel.appendChild(custom);
    if (selectedValue && DEPARTMENTS.includes(selectedValue)) sel.value = selectedValue;
    else sel.value = "";
    syncConsumableMoveDepartmentCustom();
  }

  function syncConsumableMoveDepartmentCustom() {
    const sel = document.getElementById("cons-move-department");
    const wrap = document.getElementById("cons-move-department-new-wrap");
    if (!sel || !wrap) return;
    wrap.style.display = sel.value === "__custom__" ? "flex" : "none";
  }

  function fillConsumableMoveStorage(selectedValue) {
    const sel = document.getElementById("cons-move-storage");
    if (!sel) return;
    sel.innerHTML = '<option value="">Selectionner stockage</option>';
    STORAGE_LOCATIONS.forEach((s) => {
      const opt = document.createElement("option");
      opt.value = s;
      opt.textContent = s;
      sel.appendChild(opt);
    });
    const custom = document.createElement("option");
    custom.value = "__custom__";
    custom.textContent = "Autre (ajouter stockage)...";
    sel.appendChild(custom);
    if (selectedValue && STORAGE_LOCATIONS.includes(selectedValue)) sel.value = selectedValue;
    else sel.value = "";
    syncConsumableMoveStorageCustom();
  }

  function syncConsumableMoveStorageCustom() {
    const sel = document.getElementById("cons-move-storage");
    const wrap = document.getElementById("cons-move-storage-new-wrap");
    if (!sel || !wrap) return;
    wrap.style.display = sel.value === "__custom__" ? "flex" : "none";
  }

  function syncConsumableMoveContextByType(type) {
    const isEntry = type === "entree";
    const deptWrap = document.getElementById("cons-move-department-wrap");
    const deptNewWrap = document.getElementById("cons-move-department-new-wrap");
    const storageWrap = document.getElementById("cons-move-storage-wrap");
    const storageNewWrap = document.getElementById("cons-move-storage-new-wrap");
    if (deptWrap) deptWrap.style.display = isEntry ? "none" : "flex";
    if (deptNewWrap) {
      const depSel = document.getElementById("cons-move-department");
      deptNewWrap.style.display = !isEntry && depSel?.value === "__custom__" ? "flex" : "none";
    }
    if (storageWrap) storageWrap.style.display = isEntry ? "flex" : "none";
    if (storageNewWrap) {
      const stSel = document.getElementById("cons-move-storage");
      storageNewWrap.style.display = isEntry && stSel?.value === "__custom__" ? "flex" : "none";
    }
  }

  function closeConsumableMoveModal() {
    const modal = document.getElementById("cons-move-modal");
    if (!modal) return;
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
  }

  function saveConsumableMovement() {
    const err = document.getElementById("cons-move-error");
    if (err) err.textContent = "";
    const selectedItemId = document.getElementById("cons-move-item").value;
    const c = getConsumableById(selectedItemId || activeConsumableId);
    if (!c) return void (err.textContent = "Consommable introuvable.");
    const type = document.getElementById("cons-move-type").value;
    const qty = Number(document.getElementById("cons-move-qty").value);
    const date = document.getElementById("cons-move-date").value || todayIso();
    const depRaw = document.getElementById("cons-move-department").value;
    const depCustom = normStr(document.getElementById("cons-move-department-new").value, "");
    const storageRaw = document.getElementById("cons-move-storage").value;
    const storageCustom = normStr(document.getElementById("cons-move-storage-new").value, "");
    const department = depRaw === "__custom__" ? depCustom : normStr(depRaw, "");
    const storage = storageRaw === "__custom__" ? storageCustom : normStr(storageRaw, "");
    const sourceLabel = type === "entree" ? storage : department;
    if (!Number.isFinite(qty) || qty <= 0) return void (err.textContent = "Quantite invalide.");
    if (!sourceLabel) {
      return void (err.textContent = type === "entree" ? "Le stockage est requis." : "Le departement est requis.");
    }
    if (type === "sortie" && qty > Number(c.stockActuel || 0)) {
      return void (err.textContent = "Stock insuffisant pour cette sortie.");
    }

    c.stockActuel = type === "entree" ? Number(c.stockActuel || 0) + qty : Number(c.stockActuel || 0) - qty;
    c.dernierMouvement = date;
    DB.consumableLogs = DB.consumableLogs || [];
    DB.consumableLogs.push({
      date,
      type,
      item: c.name,
      qty,
      department: sourceLabel,
      stock: c.stockActuel,
      note: ""
    });
    postConsumableMovementApi(c.id, {
      date,
      type,
      qty,
      department: sourceLabel,
      note: ""
    });

    persistConsumables();
    persistConsumableLogs();
    closeConsumableMoveModal();
    closeConsumableRowMenu();
    renderKPIs();
    renderConsumables();
    showFeedback(type === "entree" ? "Entree enregistree." : "Sortie enregistree.");
  }

  function deleteConsumable(id) {
    const c = getConsumableById(id);
    if (!c) return;
    if (!confirm(`Supprimer le consommable "${c.name}" ?`)) return;
    DB.consumables = (DB.consumables || []).filter((x) => String(x.id) !== String(id));
    deleteConsumableApi(id);
    persistConsumables();
    closeConsumableRowMenu();
    renderKPIs();
    renderConsumables();
    showFeedback("Consommable supprime.");
  }

  function updateActionButtonByTab() {
    const btn = document.getElementById("btn-add-asset");
    if (!btn) return;
    if (currentTab === "consumables") {
      btn.innerHTML = '<svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Ajouter consommable';
      return;
    }
    btn.innerHTML = '<svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Ajouter equipement';
  }

  function renderConsumables() {
    document.getElementById("cons-stock-body").innerHTML = (DB.consumables || [])
      .map((c) => {
        const low = c.stockActuel <= c.stockMin;
        const empty = c.stockActuel === 0;
        const badge = empty
          ? '<span class="sla-badge breach">Stock vide</span>'
          : low
            ? '<span class="sla-badge warn">Stock faible</span>'
            : '<span class="sla-badge ok">OK</span>';
        return `<tr data-cons-id="${escapeHtml(c.id)}">
          <td><strong>${escapeHtml(c.name)}</strong></td>
          <td>${escapeHtml(c.category)}</td>
          <td><strong style="color:${empty ? "var(--accent)" : low ? "var(--accent4)" : "var(--accent3)"}">${escapeHtml(c.stockActuel)}</strong> ${escapeHtml(c.unit)}</td>
          <td>${escapeHtml(c.stockMin)} ${escapeHtml(c.unit)}</td>
          <td>${badge}</td>
        </tr>`;
      })
      .join("");

    document.getElementById("cons-log-body").innerHTML = (DB.consumableLogs || [])
      .slice()
      .reverse()
      .slice(0, 15)
      .map((l) => {
        const isIn = l.type === "entree";
        return `<tr>
          <td style="font-size:12px">${escapeHtml(l.date)}</td>
          <td><span class="sla-badge ${isIn ? "ok" : "breach"}">${isIn ? "↑ Entree" : "↓ Sortie"}</span></td>
          <td style="font-size:12px;font-weight:500">${escapeHtml(l.item)}</td>
          <td><strong>${escapeHtml(l.qty)}</strong></td>
          <td style="font-size:12px">${escapeHtml(l.department)}</td>
        </tr>`;
      })
      .join("");

    document.querySelectorAll("#cons-stock-body tr[data-cons-id]").forEach((row) => {
      row.addEventListener("click", (e) => {
        e.stopPropagation();
        openConsumableRowMenu(row.getAttribute("data-cons-id"), row, e);
      });
    });
  }

  document.querySelectorAll(".tab[data-inv-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab[data-inv-tab]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      currentTab = btn.dataset.invTab;
      const isConsumables = currentTab === "consumables";
      closeConsumableRowMenu();
      document.getElementById("inv-equipment-section").style.display = isConsumables ? "none" : "";
      document.getElementById("inv-consumables-section").style.display = isConsumables ? "" : "none";
      if (!isConsumables) renderTable();
      else renderConsumables();
      updateActionButtonByTab();
    });
  });

  document.getElementById("inv-search")?.addEventListener("input", renderTable);
  document.getElementById("inv-filter-condition")?.addEventListener("change", renderTable);
  document.getElementById("inv-filter-location")?.addEventListener("change", renderTable);
  document.getElementById("inv-sort")?.addEventListener("change", renderTable);
  document.getElementById("btn-add-asset")?.addEventListener("click", () => {
    if (currentTab === "consumables") openConsumableModal(null);
    else openAssetModal(null);
  });
  document.getElementById("asset-category")?.addEventListener("change", syncCategoryCustomInput);
  document.getElementById("asset-modal-cancel")?.addEventListener("click", closeAssetModal);
  document.getElementById("asset-modal-save")?.addEventListener("click", saveAsset);
  document.getElementById("asset-modal")?.addEventListener("click", (e) => {
    if (e.target?.id === "asset-modal") closeAssetModal();
  });
  document.getElementById("inv-table-body")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-edit-id]");
    if (!btn) return;
    openAssetModal(btn.getAttribute("data-edit-id"));
  });
  document.getElementById("cons-cancel")?.addEventListener("click", closeConsumableModal);
  document.getElementById("cons-save")?.addEventListener("click", saveConsumable);
  document.getElementById("consumable-modal")?.addEventListener("click", (e) => {
    if (e.target?.id === "consumable-modal") closeConsumableModal();
  });
  document.getElementById("cons-row-edit")?.addEventListener("click", () => {
    if (activeConsumableId != null) openConsumableModal(activeConsumableId);
    closeConsumableRowMenu();
  });
  document.getElementById("cons-row-delete")?.addEventListener("click", () => {
    if (activeConsumableId != null) deleteConsumable(activeConsumableId);
  });
  document.getElementById("cons-row-in")?.addEventListener("click", () => {
    openConsumableMoveModal("entree");
  });
  document.getElementById("cons-row-out")?.addEventListener("click", () => {
    openConsumableMoveModal("sortie");
  });
  document.getElementById("cons-move-cancel")?.addEventListener("click", closeConsumableMoveModal);
  document.getElementById("cons-move-save")?.addEventListener("click", saveConsumableMovement);
  document.getElementById("cons-move-department")?.addEventListener("change", syncConsumableMoveDepartmentCustom);
  document.getElementById("cons-move-storage")?.addEventListener("change", syncConsumableMoveStorageCustom);
  document.getElementById("cons-move-modal")?.addEventListener("click", (e) => {
    if (e.target?.id === "cons-move-modal") closeConsumableMoveModal();
  });
  consRowMenu?.addEventListener("click", (e) => e.stopPropagation());
  document.addEventListener("click", closeConsumableRowMenu);

  loadConsumablesFromStorage();
  loadConsumableLogsFromStorage();
  normalizeInventory();
  renderKPIs();
  fillCategorySelect();
  fillDepartmentSelect();
  renderTable();
  updateActionButtonByTab();

  void hydrateFromApi().then(() => {
    normalizeInventory();
    if (typeof persistInventory === "function") persistInventory();
    persistConsumables();
    persistConsumableLogs();
    renderKPIs();
    fillCategorySelect();
    fillDepartmentSelect();
    if (currentTab === "consumables") renderConsumables();
    else renderTable();
  });

  document.querySelectorAll("#inv-kpis .kpi-value").forEach((el) => {
    const target = parseInt(el.textContent, 10);
    if (Number.isNaN(target)) return;
    let c = 0;
    const iv = setInterval(() => {
      c = Math.min(c + Math.ceil(target / 30), target);
      el.textContent = String(c);
      if (c >= target) clearInterval(iv);
    }, 25);
  });

  if (typeof Auth !== "undefined" && Auth.enhanceUI) Auth.enhanceUI();
})();
