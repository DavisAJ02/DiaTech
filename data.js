// ============================
// DiaTech – Shared Data Store (Centre Médical Diamant)
// ============================
// Users: DB.users + getUserById / getAssignableUsers / session helpers.
// Auth: validate credentials on a server; return user id; call setSessionUser(id).
// Never ship passwords, API keys, or JWTs inside this static file.

const DB = {
  /**
   * Tickets reference assignees by user id (DB.users[].id).
   * Passwords, refresh tokens, and sessions must live server-side only.
   */
  tickets: [
    { id: 1531, title: "Machine status unknown",      priority: "critical", status: "open",         sla: "+4d", slaClass: "ok",     assignedUserId: null, department: "IT", createdAt: "2026-03-01T09:00:00.000Z", resolvedAt: null },
    { id: 1532, title: "New employee onboarding",     priority: "low",      status: "open",         sla: "+1h", slaClass: "ok",     assignedUserId: null, department: "Secretariat", createdAt: "2026-03-02T10:15:00.000Z", resolvedAt: null },
    { id: 1533, title: "CPU temperature",             priority: "critical", status: "in-progress", sla: "+5d", slaClass: "ok",     assignedUserId: null, department: "IT", createdAt: "2026-03-04T08:35:00.000Z", resolvedAt: null },
    { id: 1553, title: "Fan speed (left side, right side)", priority: "medium", status: "open", sla: "-1h", slaClass: "breach", assignedUserId: null, department: "Maintenance", createdAt: "2026-03-08T11:00:00.000Z", resolvedAt: null },
    { id: 1534, title: "Disk space low – SRV01",      priority: "high",     status: "in-progress", sla: "+2h", slaClass: "warn",   assignedUserId: 2, department: "IT", createdAt: "2026-03-10T14:40:00.000Z", resolvedAt: null },
    { id: 1535, title: "VPN connection failed",       priority: "critical", status: "open",         sla: "-22h",slaClass: "breach", assignedUserId: 4, department: "IT", createdAt: "2026-03-14T07:20:00.000Z", resolvedAt: null },
    { id: 1536, title: "Antivirus out of date",       priority: "medium",   status: "resolved",     sla: "+3d", slaClass: "ok",     assignedUserId: 3, department: "Médical", createdAt: "2026-03-18T12:10:00.000Z", resolvedAt: "2026-03-20T16:30:00.000Z" },
    { id: 1537, title: "Windows update pending",      priority: "low",      status: "open",         sla: "+7d", slaClass: "ok",     assignedUserId: 3, department: "Facturation", createdAt: "2026-03-22T09:50:00.000Z", resolvedAt: null },
    { id: 1538, title: "Network switch unresponsive", priority: "critical", status: "in-progress", sla: "-6h", slaClass: "breach", assignedUserId: 4, department: "IT", createdAt: "2026-03-25T13:05:00.000Z", resolvedAt: null },
    { id: 1539, title: "Email queue backup",          priority: "high",     status: "open",         sla: "-2h", slaClass: "breach", assignedUserId: 2, department: "Finance & Comptabilité", createdAt: "2026-03-27T15:25:00.000Z", resolvedAt: null },
  ],

  departments: [
    { name: "Direction", tickets: 5, services: ["Pilotage", "Coordination"] },
    { name: "Secretariat", tickets: 8, services: ["Accueil", "Dossiers"] },
    { name: "Finance & Comptabilité", tickets: 6 },
    { name: "Facturation", tickets: 4 },
    { name: "Médical", tickets: 12, services: ["Consultation", "Suivi"] },
    { name: "Relation contractuelle", tickets: 9 },
    { name: "Nursing", tickets: 15 },
    { name: "Hospitalisation", tickets: 11 },
    { name: "Dialyse", tickets: 5 },
    { name: "Laboratoire", tickets: 10 },
    { name: "Imagerie", tickets: 8 },
    { name: "Pharmacie", tickets: 6 },
    { name: "IT", tickets: 20 },
    { name: "Maintenance", tickets: 9 },
    { name: "Logistique", tickets: 7 },
    { name: "Inventaire", tickets: 6 },
    { name: "Facilities Management", tickets: 5 },
    { name: "Achat", tickets: 4 },
    { name: "Qualité", tickets: 3 },
    { name: "Project Management", tickets: 4 },
    { name: "Marketing & Commercial", tickets: 2 },
  ],

  /**
   * IT hardware assets; optional localStorage mirror via persistInventory().
   * lifecycle: purchase → assignment → maintenance → retirement
   * linkedExpenseId ↔ expenses[].linkedAssetId kept in sync via setAssetExpenseLink / setExpenseAssetLink
   */
  inventory: [
    { id: "PC-001", category: "Ordinateur", name: "Lenovo T490", specs: "i7 / 16Go / 500Go", type: "Laptop", location: "Villa Covid", department: "Facility Manager", assignedUser: "David-Adrien", condition: "moyen", acquisitionYear: 2023, replacementYear: 2026, status: "in-use", lifecycle: "assignment" },
    { id: "PC-002", category: "Ordinateur", name: "Lenovo T460", specs: "i5 / 8Go / 500Go", type: "Laptop", location: "Villa Covid", department: "Cordon Inventaire", assignedUser: "Chanelle", condition: "mauvais", acquisitionYear: 2023, replacementYear: 2025, status: "in-use", lifecycle: "assignment" },
    { id: "PC-003", category: "Ordinateur", name: "HP 250 G6", specs: "Celeron / 4Go / 500Go", type: "Laptop", location: "Villa Covid", department: "Facturation", assignedUser: "Omer", condition: "bon", acquisitionYear: null, replacementYear: 2027, status: "in-use", lifecycle: "assignment" },
    { id: "PC-004", category: "Ordinateur", name: "HP 250 G7", specs: "i5 / 8Go / 1To", type: "Laptop", location: "Villa Covid", department: "Facturation", assignedUser: "Benjamin", condition: "moyen", acquisitionYear: null, replacementYear: 2026, status: "in-use", lifecycle: "assignment" },
    { id: "PC-005", category: "Ordinateur", name: "Lenovo T460", specs: "i5 / 16Go / 1To", type: "Laptop", location: "Villa Covid", department: "Facturation", assignedUser: "Derick", condition: "bon", acquisitionYear: 2023, replacementYear: 2027, status: "in-use", lifecycle: "assignment" },
    { id: "PC-006", category: "Ordinateur", name: "Lenovo", specs: "/ / ", type: "Laptop", location: "Villa Covid", department: "Facturation", assignedUser: "Jean-Nickel", condition: "bon", acquisitionYear: 2024, replacementYear: 2029, status: "in-use", lifecycle: "assignment" },
    { id: "PC-007", category: "Ordinateur", name: "Lenovo", specs: "/ / ", type: "Laptop", location: "Villa Covid", department: "Kinesitherapie", assignedUser: "Dorcas", condition: "moyen", acquisitionYear: null, replacementYear: 2025, status: "in-use", lifecycle: "assignment" },
    { id: "PC-008", category: "Ordinateur", name: "Lenovo 82NB", specs: "i5 / 8Go / 1To", type: "Laptop", location: "Rez-de-chaussee", department: "Salle de reunion", assignedUser: "-", condition: "bon", acquisitionYear: 2023, replacementYear: 2026, status: "in-use", lifecycle: "assignment" },
    { id: "PC-009", category: "Ordinateur", name: "HP Notebook 250 G8", specs: "i5 / 16Go / 500Go", type: "Laptop", location: "Rez-de-chaussee", department: "Ophtalmologie", assignedUser: "Dr. Jeremy", condition: "bon", acquisitionYear: 2024, replacementYear: 2027, status: "in-use", lifecycle: "assignment" },
    { id: "PC-010", category: "Ordinateur", name: "Lenovo", specs: "Celeron / 4Go / 500Go", type: "Desktop", location: "Rez-de-chaussee", department: "Ophtalmologie", assignedUser: "Dr. Mabo", condition: "bon", acquisitionYear: null, replacementYear: 2027, status: "in-use", lifecycle: "assignment" },
    { id: "PC-011", category: "Ordinateur", name: "HP Laptop-15s", specs: "i5 / 8Go / 500Go", type: "Laptop", location: "Rez-de-chaussee", department: "Urgences", assignedUser: "-", condition: "bon", acquisitionYear: null, replacementYear: 2027, status: "in-use", lifecycle: "assignment" },
    { id: "PC-012", category: "Ordinateur", name: "Lenovo", specs: "Celeron / 4Go / 500Go", type: "Laptop", location: "Rez-de-chaussee", department: "Triage RDC", assignedUser: "-", condition: "bon", acquisitionYear: null, replacementYear: 2027, status: "in-use", lifecycle: "assignment" },

    { id: "IMP-001", category: "Imprimante", name: "HP Laser MFP 137fnw", specs: "Laser MFP", type: "Imprimante", location: "Villa Covid", department: "Facturation", assignedUser: null, condition: "bon", acquisitionYear: 2024, replacementYear: 2027, status: "in-use", lifecycle: "assignment" },
    { id: "IMP-002", category: "Imprimante", name: "Samsung M2070", specs: "Laser", type: "Imprimante", location: "Villa Covid", department: "Facility Manager", assignedUser: null, condition: "mauvais", acquisitionYear: null, replacementYear: 2025, status: "in-use", lifecycle: "maintenance" },
    { id: "IMP-003", category: "Imprimante", name: "Samsung M2070", specs: "Laser", type: "Imprimante", location: "Rez-de-chaussee", department: "Pharmacie / Secretariat", assignedUser: null, condition: "mauvais", acquisitionYear: null, replacementYear: 2025, status: "in-use", lifecycle: "maintenance" },
    { id: "IMP-004", category: "Imprimante", name: "Samsung M2070", specs: "Laser", type: "Imprimante", location: "Rez-de-chaussee", department: "RH", assignedUser: null, condition: "moyen", acquisitionYear: null, replacementYear: 2025, status: "in-use", lifecycle: "assignment" },
    { id: "IMP-005", category: "Imprimante", name: "Canon ImageRUNNER 2206N", specs: "Laser MFP", type: "Imprimante", location: "Rez-de-chaussee", department: "Call Center / Hospit", assignedUser: null, condition: "bon", acquisitionYear: 2022, replacementYear: 2026, status: "in-use", lifecycle: "assignment" },
    { id: "IMP-006", category: "Imprimante", name: "Canon ImageRUNNER 2206N", specs: "Laser MFP", type: "Imprimante", location: "Rez-de-chaussee", department: "Secretariat Ophta", assignedUser: null, condition: "mauvais", acquisitionYear: 2022, replacementYear: 2025, status: "in-use", lifecycle: "maintenance" },
    { id: "IMP-007", category: "Imprimante", name: "Samsung M2071", specs: "Laser", type: "Imprimante", location: "Rez-de-chaussee", department: "Ophtalmologie", assignedUser: null, condition: "moyen", acquisitionYear: null, replacementYear: 2025, status: "in-use", lifecycle: "assignment" },
    { id: "IMP-008", category: "Imprimante", name: "Canon ImageRUNNER 2206N", specs: "Laser MFP", type: "Imprimante", location: "Premier niveau", department: "Secretariat", assignedUser: null, condition: "bon", acquisitionYear: 2022, replacementYear: 2027, status: "in-use", lifecycle: "assignment" },
    { id: "IMP-009", category: "Imprimante", name: "Samsung M2070", specs: "Laser", type: "Imprimante", location: "Premier niveau", department: "Medecin Superviseur", assignedUser: null, condition: "moyen", acquisitionYear: null, replacementYear: 2025, status: "in-use", lifecycle: "assignment" },
    { id: "IMP-010", category: "Imprimante", name: "Samsung M2070", specs: "Laser", type: "Imprimante", location: "Premier niveau", department: "Directrice des Finances", assignedUser: null, condition: "moyen", acquisitionYear: null, replacementYear: 2025, status: "in-use", lifecycle: "assignment" },
    { id: "IMP-011", category: "Imprimante", name: "Samsung M2070", specs: "Laser", type: "Imprimante", location: "Premier niveau", department: "Bureau DG", assignedUser: null, condition: "bon", acquisitionYear: 2022, replacementYear: 2027, status: "in-use", lifecycle: "assignment" },
    { id: "IMP-012", category: "Imprimante", name: "Canon ImageRUNNER 2206N", specs: "Laser MFP", type: "Imprimante", location: "Deuxieme niveau", department: "Laboratoire / Dialyse / TI", assignedUser: null, condition: "bon", acquisitionYear: 2022, replacementYear: 2027, status: "in-use", lifecycle: "assignment" },

    { id: "TAB-001", category: "Tablette", name: "Tablette double face 1", specs: "Android", type: "Tablette", location: "Rez-de-chaussee", department: "Secretariat", assignedUser: null, condition: "bon", acquisitionYear: null, replacementYear: 2027, status: "in-use", lifecycle: "assignment" },
    { id: "TAB-002", category: "Tablette", name: "Tablette double face 2", specs: "Android", type: "Tablette", location: "Rez-de-chaussee", department: "Secretariat", assignedUser: null, condition: "bon", acquisitionYear: null, replacementYear: 2027, status: "in-use", lifecycle: "assignment" },
    { id: "TAB-003", category: "Tablette", name: "Tablette iPad", specs: "iPadOS", type: "Tablette", location: "Rez-de-chaussee", department: "Secretariat", assignedUser: null, condition: "bon", acquisitionYear: null, replacementYear: 2027, status: "in-use", lifecycle: "assignment" },
    { id: "TAB-004", category: "Tablette", name: "Tablette iPad", specs: "iPadOS", type: "Tablette", location: "Rez-de-chaussee", department: "Observation EEG", assignedUser: null, condition: "bon", acquisitionYear: null, replacementYear: 2027, status: "in-use", lifecycle: "assignment" },
    { id: "TAB-005", category: "Tablette", name: "Tablette iPad", specs: "iPadOS", type: "Tablette", location: "Rez-de-chaussee", department: "Prelevement", assignedUser: null, condition: "bon", acquisitionYear: null, replacementYear: 2030, status: "in-use", lifecycle: "assignment" },
    { id: "TAB-006", category: "Tablette", name: "iPad Pro x2", specs: "iPadOS", type: "Tablette", location: "Stock IT", department: "Stock", assignedUser: null, condition: "bon", acquisitionYear: null, replacementYear: null, status: "in-stock", lifecycle: "purchase" },

    { id: "DYM-001", category: "Dymo", name: "Dymo 1", specs: "Etiqueteuse", type: "Dymo", location: "Rez-de-chaussee", department: "Pharmacie", assignedUser: null, condition: "mauvais", acquisitionYear: null, replacementYear: 2024, status: "in-use", lifecycle: "maintenance" },
    { id: "DYM-002", category: "Dymo", name: "Dymo 2", specs: "Etiqueteuse", type: "Dymo", location: "Rez-de-chaussee", department: "Pharmacie", assignedUser: null, condition: "bon", acquisitionYear: 2024, replacementYear: 2027, status: "in-use", lifecycle: "assignment" },
    { id: "DYM-003", category: "Dymo", name: "Dymo", specs: "Etiqueteuse", type: "Dymo", location: "Rez-de-chaussee", department: "Ophtalmologie", assignedUser: null, condition: "moyen", acquisitionYear: null, replacementYear: 2026, status: "in-use", lifecycle: "assignment" },
    { id: "DYM-004", category: "Dymo", name: "Dymo", specs: "Etiqueteuse", type: "Dymo", location: "Rez-de-chaussee", department: "Salle de Prelevement", assignedUser: null, condition: "moyen", acquisitionYear: null, replacementYear: 2026, status: "in-use", lifecycle: "assignment" },
    { id: "DYM-005", category: "Dymo", name: "Dymo", specs: "Etiqueteuse", type: "Dymo", location: "Premier niveau", department: "ICU", assignedUser: null, condition: "moyen", acquisitionYear: null, replacementYear: 2026, status: "in-use", lifecycle: "assignment" },
    { id: "DYM-006", category: "Dymo", name: "Dymo", specs: "Etiqueteuse", type: "Dymo", location: "Deuxieme niveau", department: "Dialyse", assignedUser: null, condition: "moyen", acquisitionYear: null, replacementYear: 2026, status: "in-use", lifecycle: "assignment" },

    { id: "CIS-001", category: "Telephone CISCO", name: "CISCO IP Phone", specs: "Poste 9109", type: "Telephone fixe", location: "Rez-de-chaussee", department: "Reception 2", assignedUser: null, condition: "moyen", acquisitionYear: null, replacementYear: 2025, status: "in-use", lifecycle: "assignment" },
    { id: "CIS-002", category: "Telephone CISCO", name: "CISCO IP Phone", specs: "Poste 9106", type: "Telephone fixe", location: "Rez-de-chaussee", department: "Reception RDC", assignedUser: null, condition: "moyen", acquisitionYear: null, replacementYear: 2025, status: "in-use", lifecycle: "assignment" },
    { id: "CIS-003", category: "Telephone CISCO", name: "CISCO IP Phone", specs: "Poste 9300", type: "Telephone fixe", location: "Rez-de-chaussee", department: "Urgences", assignedUser: null, condition: "moyen", acquisitionYear: null, replacementYear: 2025, status: "in-use", lifecycle: "assignment" },
    { id: "CIS-004", category: "Telephone CISCO", name: "CISCO IP Phone", specs: "Poste 9105", type: "Telephone fixe", location: "Rez-de-chaussee", department: "Pharmacie", assignedUser: null, condition: "moyen", acquisitionYear: null, replacementYear: 2025, status: "in-use", lifecycle: "assignment" },
    { id: "CIS-005", category: "Telephone CISCO", name: "CISCO IP Phone", specs: "Poste 9507", type: "Telephone fixe", location: "Rez-de-chaussee", department: "Box Cardiologie", assignedUser: null, condition: "moyen", acquisitionYear: null, replacementYear: 2025, status: "in-use", lifecycle: "assignment" }
  ],

  consumables: [
    { id: "CON-001", name: "Samsung 111S", category: "Cartouche", stockActuel: 2, stockMin: 3, unit: "unite", dernierMouvement: "2024-08-15", fournisseur: "Smartcom" },
    { id: "CON-002", name: "Canon C-EXV 42", category: "Cartouche", stockActuel: 8, stockMin: 3, unit: "unite", dernierMouvement: "2024-09-01", fournisseur: "Smartcom" },
    { id: "CON-003", name: "HP 307A Jaune", category: "Cartouche", stockActuel: 2, stockMin: 1, unit: "unite", dernierMouvement: "2024-07-10", fournisseur: "Smartcom" },
    { id: "CON-004", name: "HP 307A Magenta", category: "Cartouche", stockActuel: 2, stockMin: 1, unit: "unite", dernierMouvement: "2024-07-10", fournisseur: "Smartcom" },
    { id: "CON-005", name: "HP 307A Bleu", category: "Cartouche", stockActuel: 2, stockMin: 1, unit: "unite", dernierMouvement: "2024-07-10", fournisseur: "Smartcom" },
    { id: "CON-006", name: "HP 307A Noir", category: "Cartouche", stockActuel: 0, stockMin: 2, unit: "unite", dernierMouvement: "2024-05-29", fournisseur: "Smartcom" },
    { id: "CON-007", name: "Papier Dymo", category: "Papier Dymo", stockActuel: 18, stockMin: 10, unit: "rouleau", dernierMouvement: "2024-11-20", fournisseur: "-" }
  ],

  consumableLogs: [
    { date: "2024-05-20", type: "sortie", item: "Samsung 111S", qty: 1, department: "Facturation", stock: 8, note: "" },
    { date: "2024-05-29", type: "sortie", item: "HP 307A Noir", qty: 1, department: "Imagerie", stock: 0, note: "Stock vide" },
    { date: "2024-06-03", type: "sortie", item: "Canon C-EXV 42", qty: 1, department: "Printer RDC", stock: 1, note: "" },
    { date: "2024-06-10", type: "sortie", item: "Samsung 111S", qty: 1, department: "Reception Pharmacie", stock: 6, note: "" },
    { date: "2024-06-11", type: "sortie", item: "Samsung 111S", qty: 1, department: "ICU", stock: 5, note: "" },
    { date: "2024-06-20", type: "entree", item: "Canon C-EXV 42", qty: 1, department: "-", stock: 2, note: "Test USCT" },
    { date: "2024-06-24", type: "entree", item: "Canon C-EXV 42", qty: 12, department: "-", stock: 14, note: "Achat Smartcom" },
    { date: "2024-06-24", type: "entree", item: "HP 307A Noir", qty: 4, department: "-", stock: 4, note: "Achat Smartcom" },
    { date: "2024-07-05", type: "sortie", item: "Samsung 111S", qty: 1, department: "Reception Pharmacie", stock: 4, note: "" },
    { date: "2024-07-17", type: "sortie", item: "Samsung 111S", qty: 1, department: "ICU", stock: 2, note: "" }
  ],

  /** Monthly IT budget cap (demo). Remaining = cap − sum of expenses in the current calendar month. */
  expenseMonthlyBudget: 45000,

  /**
   * Thresholds for Alerts page (inventory / budget checks).
   * Low stock = count of assets in Purchase (storeroom) lifecycle below minimum.
   */
  alertRules: {
    minPurchaseStageAssets: 2,
  },

  /**
   * SLA policies by year: max resolution time in hours.
   * Example: 2026 -> 4h, 2027 -> 5h.
   */
  slaPolicies: [
    { year: 2026, targetHours: 4 },
    { year: 2027, targetHours: 5 },
  ],

  /** Budget line items; optional localStorage via persistExpenses() */
  expenses: [
    {
      id: 1,
      itemName: "Laptop fleet refresh (3×)",
      category: "IT Equipment",
      amount: 3897,
      date: "2026-03-02",
      supplier: "Dell Business",
      linkedAssetId: 1,
      approvedByUserId: 3,
    },
    {
      id: 2,
      itemName: "Microsoft 365 renewal",
      category: "Software",
      amount: 2840,
      date: "2026-03-10",
      supplier: "Microsoft",
      linkedAssetId: null,
      approvedByUserId: 3,
    },
    {
      id: 3,
      itemName: "Datacenter HVAC inspection",
      category: "Maintenance",
      amount: 1250,
      date: "2026-03-14",
      supplier: "CoolAir Services",
      linkedAssetId: null,
      approvedByUserId: 3,
    },
    {
      id: 4,
      itemName: "Monitor arms & docks",
      category: "IT Equipment",
      amount: 642,
      date: "2026-03-18",
      supplier: "Amazon Business",
      linkedAssetId: 4,
      approvedByUserId: 2,
    },
    {
      id: 5,
      itemName: "Backup SaaS annual",
      category: "Software",
      amount: 3600,
      date: "2026-02-26",
      supplier: "Veeam Partner",
      linkedAssetId: null,
      approvedByUserId: 3,
    },
    {
      id: 6,
      itemName: "UPS battery replacement",
      category: "Maintenance",
      amount: 890,
      date: "2026-02-12",
      supplier: "APC by Schneider",
      linkedAssetId: null,
      approvedByUserId: 3,
    },
  ],

  devices: {
    server: { online: 13, offline: 7  },
    pc:     { online: 0,  offline: 0  },
    mac:    { online: 181,offline: 9  },
    linux:  { online: 3,  offline: 0  },
    snmp:   { online: 2,  offline: 5  },
    /** Percent share for dashboard OS doughnut (Windows, Unknown, Mac, Other) */
    osDistribution: { windows: 57, unknown: 11, mac: 14, other: 18 },
  },

  ticketActivity: {
    "7d":  [14, 25, 11, 18, 25, 9,  15, 16, 15],
    "30d": [20, 15, 28, 12, 22, 30, 18, 10, 24, 16, 19, 11],
    "90d": [55, 70, 48, 60, 80, 72, 65, 58, 90, 75, 68, 82],
  },

  /** Dashboard analytics (per range for filters) */
  analytics: {
    ticketTrend: {
      "7d":  { labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], values: [18, 22, 19, 28, 31, 24, 27] },
      "30d": { labels: ["W1", "W2", "W3", "W4", "W5", "W6", "W7", "W8", "W9", "W10"], values: [42, 38, 55, 48, 62, 58, 71, 65, 74, 69] },
      "90d": { labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], values: [180, 195, 210, 188, 225, 240, 218, 232, 251, 238, 246, 260] },
    },
    ticketsByPriority: {
      "7d":  { critical: 4, high: 3, medium: 2, low: 2 },
      "30d": { critical: 14, high: 22, medium: 18, low: 12 },
      "90d": { critical: 48, high: 62, medium: 55, low: 38 },
    },
    slaCompliancePct: { "7d": 92, "30d": 86, "90d": 88 },
    slaSplitPct: {
      "7d":  { met: 72, warning: 18, breached: 10 },
      "30d": { met: 65, warning: 20, breached: 15 },
      "90d": { met: 68, warning: 19, breached: 13 },
    },
    avgResolutionHours: { "7d": 3.6, "30d": 5.4, "90d": 4.8 },
    insightVolumeChangePct: { "7d": 14.2, "30d": 8.7, "90d": 11.3 },
  },

  alertCategories: {
    labels: ["Hardware", "Disk", "Performance", "Exchange", "General"],
    values: [820, 60, 590, 270, 970],
    colors: ["#f43f5e", "#f59e0b", "#fb923c", "#3b82f6", "#0f172a"],
  },

  /**
   * Users (agents today; extend roles for admins, viewers, etc.).
   * Future auth: map username/email to IdP; issue JWT or session cookie from API.
   */
  users: [
    {
      id: 1,
      username: "papy.matala",
      email: "papy.matala@nexusops.example",
      name: "Papy",
      initials: "PY",
      avatarColor: "#8b5cf6",
      roles: ["agent"],
      active: true,
      authProvider: null,
      /** Demo only — remove; validate with your API */
      passwordDemo: "agent123",
    },
    {
      id: 2,
      username: "guy-roger.kabongo",
      email: "guy-roger.kabongo@nexusops.example",
      name: "Guy-Roger",
      initials: "GR",
      avatarColor: "#3b82f6",
      roles: ["agent"],
      active: true,
      authProvider: null,
      passwordDemo: "agent123",
    },
    {
      id: 3,
      username: "david-adrien.ntumba",
      email: "david-adrien.ntumba@nexusops.example",
      name: "David-Adrien",
      initials: "DA",
      avatarColor: "#10b981",
      roles: ["agent", "admin"],
      active: true,
      authProvider: null,
      passwordDemo: "admin123",
    },
    {
      id: 4,
      username: "zied.benali",
      email: "zied.benali@nexusops.example",
      name: "Zied",
      initials: "ZI",
      avatarColor: "#f59e0b",
      roles: ["agent"],
      active: true,
      authProvider: null,
      passwordDemo: "agent123",
    },
  ],

  /**
   * Assignee / custody events for hardware (append-only). Persisted via assetHistory storage.
   * type: baseline | created | assignee_changed | removed
   */
  assetHistory: [],

  /**
   * Populated after login (e.g. from API). Do not store secrets here.
   */
  session: {
    currentUserId: null,
    isAuthenticated: false,
  },
};

/** Pages agents may use when no custom restriction is set (excludes admin-only settings). */
const DEFAULT_AGENT_PAGES = [
  "index.html",
  "tickets.html",
  "departments.html",
  "devices.html",
  "inventory.html",
  "budget.html",
  "alerts.html",
  "reports.html",
  "it-analytics.html",
];

const INVENTORY_STORAGE_KEY = "nexusops_inventory_v2";

function loadInventoryFromStorage() {
  try {
    const raw = localStorage.getItem(INVENTORY_STORAGE_KEY);
    if (raw == null || raw === "") return;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) DB.inventory = parsed;
  } catch (e) {
    console.warn("Inventory load failed", e);
  }
}

function persistInventory() {
  try {
    localStorage.setItem(INVENTORY_STORAGE_KEY, JSON.stringify(DB.inventory));
  } catch (e) {
    console.warn("Inventory persist failed", e);
  }
}

function nextInventoryId() {
  return DB.inventory.reduce((m, a) => Math.max(m, Number(a.id) || 0), 0) + 1;
}

loadInventoryFromStorage();

const EXPENSES_STORAGE_KEY = "nexusops_expenses_v1";
const SLA_POLICIES_STORAGE_KEY = "nexusops_sla_policies_v1";

function loadExpensesFromStorage() {
  try {
    const raw = localStorage.getItem(EXPENSES_STORAGE_KEY);
    if (raw == null || raw === "") return;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) DB.expenses = parsed;
  } catch (e) {
    console.warn("Expenses load failed", e);
  }
}

function persistExpenses() {
  try {
    localStorage.setItem(EXPENSES_STORAGE_KEY, JSON.stringify(DB.expenses));
  } catch (e) {
    console.warn("Expenses persist failed", e);
  }
}

function loadSlaPoliciesFromStorage() {
  try {
    const raw = localStorage.getItem(SLA_POLICIES_STORAGE_KEY);
    if (raw == null || raw === "") return;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) DB.slaPolicies = parsed;
  } catch (e) {
    console.warn("SLA policies load failed", e);
  }
}

function persistSlaPolicies() {
  try {
    localStorage.setItem(SLA_POLICIES_STORAGE_KEY, JSON.stringify(DB.slaPolicies || []));
  } catch (e) {
    console.warn("SLA policies persist failed", e);
  }
}

function getSlaTargetHoursForDate(dateLike) {
  const d = dateLike ? new Date(dateLike) : new Date();
  const y = Number.isNaN(d.getTime()) ? new Date().getFullYear() : d.getFullYear();
  const policies = Array.isArray(DB.slaPolicies) ? DB.slaPolicies : [];
  const exact = policies.find((p) => Number(p.year) === y);
  if (exact && Number(exact.targetHours) > 0) return Number(exact.targetHours);
  const sorted = policies
    .map((p) => ({ year: Number(p.year), targetHours: Number(p.targetHours) }))
    .filter((p) => Number.isFinite(p.year) && Number.isFinite(p.targetHours) && p.targetHours > 0)
    .sort((a, b) => b.year - a.year);
  return sorted.length ? sorted[0].targetHours : 4;
}

function nextExpenseId() {
  return DB.expenses.reduce((m, x) => Math.max(m, Number(x.id) || 0), 0) + 1;
}

loadExpensesFromStorage();
loadSlaPoliciesFromStorage();

const ASSET_HISTORY_KEY = "nexusops_asset_history_v1";

function loadAssetHistoryFromStorage() {
  try {
    const raw = localStorage.getItem(ASSET_HISTORY_KEY);
    if (raw == null || raw === "") return;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) DB.assetHistory = parsed;
  } catch (e) {
    console.warn("Asset history load failed", e);
  }
}

function persistAssetHistory() {
  try {
    localStorage.setItem(ASSET_HISTORY_KEY, JSON.stringify(DB.assetHistory));
  } catch (e) {
    console.warn("Asset history persist failed", e);
  }
}

function nextAssetHistoryId() {
  return DB.assetHistory.reduce((m, h) => Math.max(m, Number(h.id) || 0), 0) + 1;
}

/**
 * @param {number} assetId
 * @param {{ type: string, fromUserId?: number|null, toUserId?: number|null, at?: string, actorUserId?: number|null }} ev
 */
function appendAssetHistoryEvent(assetId, ev) {
  if (!Array.isArray(DB.assetHistory)) DB.assetHistory = [];
  DB.assetHistory.push({
    id: nextAssetHistoryId(),
    assetId,
    at: ev.at || new Date().toISOString(),
    type: ev.type,
    fromUserId: ev.fromUserId != null ? ev.fromUserId : null,
    toUserId: ev.toUserId != null ? ev.toUserId : null,
    actorUserId: ev.actorUserId != null ? ev.actorUserId : null,
  });
  persistAssetHistory();
}

/** One-time baseline per asset (purchase date) when no rows exist yet. */
function ensureAssetHistoryBaselines() {
  if (!Array.isArray(DB.assetHistory)) DB.assetHistory = [];
  const hasRow = new Set(DB.assetHistory.map((h) => h.assetId));
  let added = false;
  (DB.inventory || []).forEach((a) => {
    if (hasRow.has(a.id)) return;
    const at = a.purchaseDate ? `${a.purchaseDate}T12:00:00.000Z` : new Date().toISOString();
    DB.assetHistory.push({
      id: nextAssetHistoryId(),
      assetId: a.id,
      at,
      type: "baseline",
      fromUserId: null,
      toUserId: a.assignedUserId != null ? a.assignedUserId : null,
      actorUserId: null,
    });
    hasRow.add(a.id);
    added = true;
  });
  if (added) persistAssetHistory();
}

function removeAssetHistoryForAsset(assetId) {
  if (!Array.isArray(DB.assetHistory)) return;
  const n = DB.assetHistory.length;
  DB.assetHistory = DB.assetHistory.filter((h) => h.assetId !== assetId);
  if (DB.assetHistory.length !== n) persistAssetHistory();
}

/** @param {number} assetId */
function getAssetHistory(assetId) {
  return (DB.assetHistory || [])
    .filter((h) => h.assetId === assetId)
    .slice()
    .sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

loadAssetHistoryFromStorage();

/**
 * Sync asset.linkedExpenseId with expense.linkedAssetId (one pair at a time).
 * @param {number} assetId
 * @param {number|null} expenseId - expense id or null to unlink
 */
function setAssetExpenseLink(assetId, expenseId) {
  const asset = DB.inventory.find((a) => a.id === assetId);
  if (!asset) return;

  if (asset.linkedExpenseId != null && asset.linkedExpenseId !== expenseId) {
    const prevE = DB.expenses.find((e) => e.id === asset.linkedExpenseId);
    if (prevE && prevE.linkedAssetId === assetId) prevE.linkedAssetId = null;
  }

  if (expenseId != null) {
    DB.inventory.forEach((a) => {
      if (a.id !== assetId && a.linkedExpenseId === expenseId) a.linkedExpenseId = null;
    });
  }

  DB.expenses.forEach((e) => {
    if (e.linkedAssetId === assetId && e.id !== expenseId) e.linkedAssetId = null;
  });

  asset.linkedExpenseId = expenseId != null ? expenseId : null;

  if (expenseId != null) {
    const e = DB.expenses.find((x) => x.id === expenseId);
    if (e) e.linkedAssetId = assetId;
  }
}

/**
 * Sync expense.linkedAssetId with asset.linkedExpenseId.
 * @param {number} expenseId
 * @param {number|null} assetId
 */
function setExpenseAssetLink(expenseId, assetId) {
  const exp = DB.expenses.find((e) => e.id === expenseId);
  if (!exp) return;

  if (exp.linkedAssetId != null && exp.linkedAssetId !== assetId) {
    const prevA = DB.inventory.find((a) => a.id === exp.linkedAssetId);
    if (prevA && prevA.linkedExpenseId === expenseId) prevA.linkedExpenseId = null;
  }

  if (assetId != null) {
    DB.inventory.forEach((a) => {
      if (a.linkedExpenseId === expenseId && a.id !== assetId) a.linkedExpenseId = null;
    });
    DB.expenses.forEach((e) => {
      if (e.id !== expenseId && e.linkedAssetId === assetId) e.linkedAssetId = null;
    });
  }

  exp.linkedAssetId = assetId != null ? assetId : null;

  if (assetId != null) {
    const a = DB.inventory.find((x) => x.id === assetId);
    if (a) a.linkedExpenseId = expenseId;
  } else {
    DB.inventory.forEach((a) => {
      if (a.linkedExpenseId === expenseId) a.linkedExpenseId = null;
    });
  }
}

function persistInventoryAndExpenses() {
  persistInventory();
  persistExpenses();
}

const USER_PATCHES_KEY = "nexusops_users_patches_v1";

function applyUserPatchesFromStorage() {
  try {
    const raw = localStorage.getItem(USER_PATCHES_KEY);
    if (!raw) return;
    const patches = JSON.parse(raw);
    if (!Array.isArray(patches)) return;
    patches.forEach((patch) => {
      if (!patch || patch.id == null) return;
      const i = DB.users.findIndex((u) => u.id === patch.id);
      if (i >= 0) Object.assign(DB.users[i], patch);
      else DB.users.push({ ...patch });
    });
  } catch (e) {
    console.warn("User patches load failed", e);
  }
}

applyUserPatchesFromStorage();

/**
 * Persist user field updates / new agents (admin UI). Merges into DB.users immediately.
 */
function saveUserPatch(patch) {
  if (!patch || patch.id == null) return;
  let patches = [];
  try {
    patches = JSON.parse(localStorage.getItem(USER_PATCHES_KEY) || "[]");
    if (!Array.isArray(patches)) patches = [];
  } catch {
    patches = [];
  }
  const idx = patches.findIndex((p) => p.id === patch.id);
  if (idx >= 0) patches[idx] = { ...patches[idx], ...patch };
  else patches.push({ ...patch });
  localStorage.setItem(USER_PATCHES_KEY, JSON.stringify(patches));
  const j = DB.users.findIndex((u) => u.id === patch.id);
  if (j >= 0) Object.assign(DB.users[j], patch);
  else DB.users.push({ ...patch });
}

function deleteUserPatch(userId) {
  let patches = [];
  try {
    patches = JSON.parse(localStorage.getItem(USER_PATCHES_KEY) || "[]");
    if (!Array.isArray(patches)) patches = [];
  } catch {
    patches = [];
  }
  patches = patches.filter((p) => p.id !== userId);
  localStorage.setItem(USER_PATCHES_KEY, JSON.stringify(patches));
}

function nextUserId() {
  return DB.users.reduce((m, u) => Math.max(m, u.id), 0) + 1;
}

/** null / undefined / [] = default agent modules. Non-empty array = whitelist. Admin → null (no limit). */
function getEffectiveAllowedPages(user) {
  if (!user || !user.active) return [];
  if (user.roles && user.roles.includes("admin")) return null;
  const ap = user.allowedPages;
  if (ap == null || (Array.isArray(ap) && ap.length === 0)) return DEFAULT_AGENT_PAGES;
  const set = new Set(ap.map((f) => String(f).toLowerCase()));
  set.add("index.html");
  return [...set];
}

function userCanAccessPage(filename, user) {
  if (!user || !user.active) return false;
  if (user.roles && user.roles.includes("admin")) return true;
  const allowed = getEffectiveAllowedPages(user);
  if (allowed === null) return true;
  const f = String(filename).toLowerCase();
  return allowed.includes(f);
}

function getUserById(userId) {
  if (userId == null || userId === "") return null;
  const id = typeof userId === "number" ? userId : Number(userId);
  return DB.users.find((u) => u.id === id) || null;
}

/** Assignee dropdown: active agents allowed to own tickets */
function getAssignableUsers() {
  return DB.users
    .filter((u) => u.active && u.roles.includes("agent"))
    .filter((u) => u.restrictions?.canBeAssignee !== false)
    .sort((a, b) => a.id - b.id);
}

/** In-memory session; persist with Auth.login / localStorage via auth.js */
function setSessionUser(userId) {
  DB.session.currentUserId = userId;
  DB.session.isAuthenticated = userId != null;
}

function getCurrentUser() {
  return getUserById(DB.session.currentUserId);
}

function clearSession() {
  DB.session.currentUserId = null;
  DB.session.isAuthenticated = false;
}

