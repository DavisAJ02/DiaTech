// ============================
// DiaTech – Dashboard Logic (Centre Médical Diamant)
// ============================

/* ---- Date ---- */
const dateEl = document.getElementById('topbar-date');
if (dateEl) {
  dateEl.textContent = new Date().toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric', year:'numeric' });
}

/* ---- Dark Mode Toggle ---- */
const themeBtn = document.getElementById('theme-toggle');
const html = document.documentElement;
const saved = localStorage.getItem('theme');
if (saved) html.dataset.theme = saved;

themeBtn?.addEventListener('click', () => {
  const isDark = html.dataset.theme === 'dark';
  html.dataset.theme = isDark ? '' : 'dark';
  localStorage.setItem('theme', isDark ? '' : 'dark');
  try {
    rerenderCharts();
  } catch (e) {
    console.error('Dashboard error:', e);
  }
});

function getSafeInventory() {
  return Array.isArray(DB?.inventory) ? DB.inventory : [];
}

function getSafeConsumables() {
  return Array.isArray(DB?.consumables) ? DB.consumables : [];
}

function getSafeTickets() {
  return Array.isArray(DB?.tickets) ? DB.tickets : [];
}

/** @returns {'admin'|'agent'|'user'} */
function getDashboardRole() {
  const w =
    typeof window !== 'undefined' && window.currentUserRole != null && String(window.currentUserRole).trim() !== ''
      ? String(window.currentUserRole).toLowerCase().trim()
      : '';
  if (w === 'admin' || w === 'agent' || w === 'user') return w;
  if (typeof getPrimaryProfileRole === 'function') return getPrimaryProfileRole();
  return 'user';
}

function getDashboardActorUser() {
  return typeof getCurrentUser === 'function' ? getCurrentUser() : null;
}

function ticketMatchesCreatedBy(t, u) {
  if (!u) return false;
  const uid = Number(u.id);
  if (Number.isFinite(uid) && uid > 0) {
    if (t.createdByUserId != null && Number(t.createdByUserId) === uid) return true;
    if (t.created_by != null && Number(t.created_by) === uid) return true;
  }
  const em = String(u.email || '').trim().toLowerCase();
  if (!em) return false;
  const fields = [t.createdByEmail, t.requesterEmail, t.created_by_email, t.requester_user_email];
  for (let i = 0; i < fields.length; i++) {
    if (String(fields[i] || '').trim().toLowerCase() === em) return true;
  }
  return false;
}

function ticketMatchesAssignedTo(t, u) {
  if (!u || u.id == null) return false;
  const uid = Number(u.id);
  if (!Number.isFinite(uid) || uid <= 0) return false;
  return Number(t.assignedUserId) === uid;
}

/** Tickets visibles pour métriques / graphiques selon le rôle (admin = tout, agent = assignés, user = créés). */
function getDashboardTickets() {
  const all = getSafeTickets();
  const role = getDashboardRole();
  const u = getDashboardActorUser();
  if (role === 'admin') return all;
  if (role === 'agent') {
    if (!u || Number(u.id) <= 0) return [];
    return all.filter((x) => ticketMatchesAssignedTo(x, u));
  }
  if (role === 'user') return all.filter((x) => ticketMatchesCreatedBy(x, u));
  return all;
}

function ticketsForDashboardStats() {
  return getDashboardRole() === 'admin' ? getSafeTickets() : getDashboardTickets();
}

function ticketsForAnalytics() {
  return getDashboardRole() === 'admin' ? getSafeTickets() : getDashboardTickets();
}

function dashEscapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function computeTicketCountStats(tickets) {
  const list = Array.isArray(tickets) ? tickets : [];
  const openTickets = list.filter((t) => String(t?.status || '').toLowerCase() === 'open').length;
  const pendingTickets = list.filter((t) => {
    const s = String(t?.status || '').toLowerCase();
    return s === 'pending' || s === 'in-progress' || s === 'in_progress';
  }).length;
  const overdueTickets = list.filter((t) => {
    const slaStatus = String(t?.slaStatus || '').toLowerCase();
    const slaClass = String(t?.slaClass || '').toLowerCase();
    return slaStatus === 'overdue' || slaClass === 'breach';
  }).length;
  return { openTickets, pendingTickets, overdueTickets };
}

function applyDashboardRoleShell() {
  const role = getDashboardRole();
  document.body.classList.remove('dash-role-admin', 'dash-role-agent', 'dash-role-user');
  document.body.classList.add('dash-role-' + role);

  const heroLead = document.querySelector('.dashboard-hero-panel--lead');
  if (heroLead && role === 'agent') {
    const kicker = heroLead.querySelector('.dashboard-hero-kicker');
    const title = heroLead.querySelector('.dashboard-hero-title');
    const copy = heroLead.querySelector('.dashboard-hero-copy');
    const btnRep = heroLead.querySelector('.dashboard-hero-actions .btn-secondary');
    if (kicker) kicker.textContent = 'Espace agent';
    if (title) title.textContent = 'Vos tickets assignés et charge de travail';
    if (copy) copy.textContent = 'Vue filtrée : seuls les tickets qui vous sont assignés comptent dans les indicateurs ci-dessous.';
    if (btnRep) {
      btnRep.style.display = 'none';
    }
  }
  if (heroLead && role === 'admin') {
    const btnRep = heroLead.querySelector('.dashboard-hero-actions .btn-secondary');
    if (btnRep) btnRep.style.display = '';
  }

  const critCard = document.getElementById('critical-tickets-card');
  const critH2 = critCard?.querySelector('.card-header h2');
  if (critH2) {
    critH2.textContent =
      role === 'agent' ? 'Mes tickets critiques & retard SLA' : 'Critiques & en retard';
  }

  const pageTitle = document.getElementById('dash-page-title');
  if (pageTitle) {
    if (role === 'user') pageTitle.textContent = 'Mon espace';
    else if (role === 'agent') pageTitle.textContent = 'Tableau de bord — Agent';
    else pageTitle.textContent = 'Tableau de bord';
  }
}

/** i18n string with {placeholders}; falls back to English template if I18n missing. */
function dashTf(key, vars, enFallback) {
  if (typeof I18n !== 'undefined' && I18n.tf) return I18n.tf(key, vars || {}, enFallback);
  let s = enFallback != null ? String(enFallback) : String(key);
  if (vars && s) {
    Object.keys(vars).forEach((k) => {
      s = s.split(`{${k}}`).join(String(vars[k]));
    });
  }
  return s;
}

const DASHBOARD_API_BASE = (() => {
  const fromWindow = typeof window !== 'undefined' ? String(window.__API_BASE__ || '').trim() : '';
  const fromStorage = typeof localStorage !== 'undefined' ? String(localStorage.getItem('ti_api_base') || '').trim() : '';
  let explicit = (fromWindow || fromStorage).replace(/\/+$/, '');
  const host = String(window?.location?.hostname || '').toLowerCase();
  const onDeployed = Boolean(host && host !== 'localhost' && host !== '127.0.0.1' && host !== '0.0.0.0');
  const localApi =
    explicit.toLowerCase().startsWith('http://localhost') ||
    explicit.toLowerCase().startsWith('http://127.0.0.1') ||
    explicit.toLowerCase().startsWith('http://0.0.0.0');
  if (onDeployed && localApi) explicit = '';
  if (explicit) return explicit;
  if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0') return 'http://localhost:3001/api';
  return `${window.location.origin}/api`;
})();
let dashboardApiStats = null;
let lastDashboardApiPull = 0;
let dashboardApiInFlight = false;
let dashboardApiBootstrapTried = false;

async function pullDashboardStatsFromApi(force = false) {
  const now = Date.now();
  if (!force && now - lastDashboardApiPull < 10000) return;
  if (dashboardApiInFlight) return;
  dashboardApiInFlight = true;
  try {
    const res = await fetch(`${DASHBOARD_API_BASE}/dashboard/stats`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    let payload = await res.json();
    const localInv = getSafeInventory();
    const apiTotal = Number(payload?.totalDevices || 0);
    if (!dashboardApiBootstrapTried && apiTotal === 0 && localInv.length > 0) {
      dashboardApiBootstrapTried = true;
      await fetch(`${DASHBOARD_API_BASE}/bootstrap`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inventory: localInv,
          consumables: getSafeConsumables(),
          consumableLogs: Array.isArray(DB?.consumableLogs) ? DB.consumableLogs : [],
          tickets: getSafeTickets(),
        }),
      });
      const res2 = await fetch(`${DASHBOARD_API_BASE}/dashboard/stats`);
      if (res2.ok) payload = await res2.json();
    }
    if (payload && typeof payload === 'object') {
      dashboardApiStats = payload;
      lastDashboardApiPull = Date.now();
      renderUnifiedKpis();
      buildAlertDonut();
    }
  } catch (_e) {
    // API unavailable: keep local fallback stats
  } finally {
    dashboardApiInFlight = false;
  }
}

async function hydrateDashboardFromApi() {
  try {
    const res = await fetch(`${DASHBOARD_API_BASE}/app-data`);
    if (!res.ok) return false;
    const payload = await res.json();
    if (!payload || typeof payload !== 'object') return false;
    if (Array.isArray(payload.tickets)) DB.tickets = payload.tickets;
    if (Array.isArray(payload.inventory)) DB.inventory = payload.inventory;
    if (Array.isArray(payload.consumables)) DB.consumables = payload.consumables;
    if (Array.isArray(payload.consumableLogs)) DB.consumableLogs = payload.consumableLogs;
    if (Array.isArray(payload.departments)) DB.departments = payload.departments;
    if (Array.isArray(payload.devices)) DB.devices = payload.devices;
    if (Array.isArray(payload.expenses)) DB.expenses = payload.expenses;
    if (payload.expenseMonthlyBudget != null) DB.expenseMonthlyBudget = Number(payload.expenseMonthlyBudget) || 0;
    if (payload.alertRules && typeof payload.alertRules === 'object') DB.alertRules = payload.alertRules;
    if (Array.isArray(payload.slaPolicies)) DB.slaPolicies = payload.slaPolicies;
    return true;
  } catch (_e) {
    return false;
  }
}

let dashboardFullRefreshTimer = null;
function scheduleDashboardFullRefresh() {
  if (dashboardFullRefreshTimer) clearTimeout(dashboardFullRefreshTimer);
  dashboardFullRefreshTimer = setTimeout(() => {
    dashboardFullRefreshTimer = null;
    void (async () => {
      try {
        await hydrateDashboardFromApi();
        rerenderCharts();
        await pullDashboardStatsFromApi(true);
      } catch (_e) {
        try {
          rerenderCharts();
        } catch (e2) {
          console.error('Dashboard error:', e2);
        }
      }
    })();
  }, 250);
}

function computeInventoryStats() {
  const inv = getSafeInventory();
  const cons = getSafeConsumables();
  const year = new Date().getFullYear();

  return {
    totalDevices: inv.length || 0,
    goodDevices: inv.filter(i => i.condition === 'bon').length || 0,
    criticalDevices: inv.filter(i => i.condition === 'mauvais').length || 0,
    warningDevices: inv.filter(i =>
      i.condition === 'moyen' ||
      (i.replacementYear && i.replacementYear <= year + 1)
    ).length || 0,
    unassignedDevices: inv.filter(i =>
      !i.assignedUser || i.assignedUser === '-'
    ).length || 0,
    nearReplacement: inv.filter(i =>
      i.replacementYear && i.replacementYear <= year + 1
    ).length || 0,
    lowStock: cons.filter(c =>
      c.stockActuel <= c.stockMin
    ).length || 0
  };
}

window.getInventoryStats = computeInventoryStats;
window.getInventoryData = () => getSafeInventory();
window.getTicketsData = () => getSafeTickets();

function getDashboardStats() {
  const role = getDashboardRole();
  const scopedTix = ticketsForDashboardStats();
  const tixCounts = computeTicketCountStats(scopedTix);

  if (dashboardApiStats && typeof dashboardApiStats === 'object') {
    if (role === 'admin') {
      return {
        openTickets: Number(dashboardApiStats.openTickets || 0),
        pendingTickets: Number(dashboardApiStats.pendingTickets || 0),
        overdueTickets: Number(dashboardApiStats.overdueTickets || 0),
        devicesHealthy: Number(dashboardApiStats.devicesHealthy || 0),
        criticalDevices: Number(dashboardApiStats.criticalDevices || 0),
        replacementSoon: Number(dashboardApiStats.replacementSoon || 0),
      };
    }
    return {
      openTickets: tixCounts.openTickets,
      pendingTickets: tixCounts.pendingTickets,
      overdueTickets: tixCounts.overdueTickets,
      devicesHealthy: Number(dashboardApiStats.devicesHealthy || 0),
      criticalDevices: Number(dashboardApiStats.criticalDevices || 0),
      replacementSoon: Number(dashboardApiStats.replacementSoon || 0),
    };
  }
  const tickets = scopedTix;
  const inventory = window.getInventoryData ? window.getInventoryData() : [];
  const year = new Date().getFullYear();

  const openTickets = tixCounts.openTickets;
  const pendingTickets = tixCounts.pendingTickets;
  const overdueTickets = tixCounts.overdueTickets;

  const devicesHealthy = inventory.filter((d) => {
    const st = String(d?.status || '').toLowerCase();
    const cond = String(d?.condition || '').toLowerCase();
    return st === 'good' || st === 'in-use' || cond === 'bon';
  }).length;
  const criticalDevices = inventory.filter((d) => {
    const st = String(d?.status || '').toLowerCase();
    const cond = String(d?.condition || '').toLowerCase();
    return st === 'critical' || cond === 'mauvais';
  }).length;
  const replacementSoon = inventory.filter(
    (d) =>
      String(d?.status || '').toLowerCase() === 'warning' ||
      String(d?.condition || '').toLowerCase() === 'moyen' ||
      (d.replacementYear && Number(d.replacementYear) <= year + 1)
  ).length;

  return {
    openTickets,
    pendingTickets,
    overdueTickets,
    devicesHealthy,
    criticalDevices,
    replacementSoon,
  };
}
window.getDashboardStats = getDashboardStats;

const MS_DAY = 86400000;

function analyticsRangeStartMs(range) {
  const now = Date.now();
  if (range === '30d') return now - 30 * MS_DAY;
  if (range === '90d') return now - 90 * MS_DAY;
  return now - 7 * MS_DAY;
}

function ticketCreatedMs(t) {
  if (!t?.createdAt) return null;
  const d = new Date(t.createdAt);
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}

function isTicketResolvedDash(t) {
  const s = String(t?.status || '').toLowerCase();
  return s === 'resolved' || s === 'resolue' || s === 'résolue' || s === 'closed' || s === 'ferme' || s === 'fermé';
}

function ticketSlaClassLive(t) {
  const fallback = String(t?.slaClass || 'ok').toLowerCase();
  const createdAt = t?.createdAt || null;
  if (!createdAt) return fallback === 'breach' ? 'breach' : 'ok';
  const targetHours =
    typeof getSlaTargetHoursForDate === 'function' ? Number(getSlaTargetHoursForDate(createdAt)) || 4 : 4;
  const isResolved = isTicketResolvedDash(t);
  const endAt = isResolved ? (t?.resolvedAt ? new Date(t.resolvedAt) : new Date()) : new Date();
  const start = new Date(createdAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(endAt.getTime())) return fallback === 'breach' ? 'breach' : 'ok';
  const elapsed = (endAt.getTime() - start.getTime()) / 3600000;
  const delta = targetHours - elapsed;
  if (delta < 0) return 'breach';
  if (delta <= Math.max(1, targetHours * 0.25)) return 'warn';
  return 'ok';
}

function ticketResolvedInCurrentMonth(t) {
  if (!isTicketResolvedDash(t)) return false;
  const r = t?.resolvedAt ? new Date(t.resolvedAt) : null;
  if (!r || Number.isNaN(r.getTime())) return false;
  const now = new Date();
  return r.getFullYear() === now.getFullYear() && r.getMonth() === now.getMonth();
}

/** % of month-to-date closures that were not in SLA breach at resolution (warn counts as on track). */
function computeHeroSlaPulse(tickets) {
  const list = Array.isArray(tickets) ? tickets : [];
  const closedMonth = list.filter(ticketResolvedInCurrentMonth);
  if (closedMonth.length > 0) {
    const ok = closedMonth.filter((t) => ticketSlaClassLive(t) !== 'breach').length;
    const pct = Math.round((100 * ok) / closedMonth.length);
    const bad = closedMonth.length - ok;
    if (bad === 0) return { pct, slaKey: 'index.hero.sla.note.on_target_month', slaVars: null };
    const breachKey = bad === 1 ? 'index.hero.sla.note.breach_one' : 'index.hero.sla.note.breach_many';
    return { pct, slaKey: breachKey, slaVars: { bad, total: closedMonth.length } };
  }
  const open = list.filter((t) => !isTicketResolvedDash(t));
  if (open.length === 0) return { pct: 100, slaKey: 'index.hero.sla.note.no_open', slaVars: null };
  const breachOpen = open.filter((t) => ticketSlaClassLive(t) === 'breach').length;
  const pct = Math.max(0, Math.min(100, Math.round(100 * (1 - breachOpen / open.length))));
  if (breachOpen === 0) return { pct, slaKey: 'index.hero.sla.note.queue_ok', slaVars: null };
  const overKey = breachOpen === 1 ? 'index.hero.sla.note.over_one' : 'index.hero.sla.note.over_many';
  return { pct, slaKey: overKey, slaVars: { n: breachOpen } };
}

function isCriticalOrHighPriority(t) {
  const p = String(t?.priority || '').toLowerCase();
  return p === 'critical' || p === 'high';
}

function computeHeroCriticalLoad(tickets) {
  const list = Array.isArray(tickets) ? tickets : [];
  const active = list.filter((t) => !isTicketResolvedDash(t) && isCriticalOrHighPriority(t));
  const needNow = active.filter(
    (t) =>
      t.assignedUserId == null ||
      t.assignedUserId === '' ||
      ticketSlaClassLive(t) === 'breach' ||
      String(t?.status || '').toLowerCase() === 'open'
  );
  return { total: active.length, needNow: needNow.length };
}

function countHealthyFleetDevices() {
  const devs = Array.isArray(DB?.devices) ? DB.devices : [];
  return devs.filter((d) => {
    const s = String(d?.status || '').toLowerCase();
    return s === 'online' || s === 'good' || s === 'active' || s === 'in-use' || s === 'healthy';
  }).length;
}

function computeHeroDailyFocus(stats, tickets, criticalHero) {
  const overdue = Number(stats?.overdueTickets || 0);
  if (overdue > 0) {
    return {
      titleKey: 'index.hero.focus.title.backlog',
      noteKey: 'index.hero.focus.note.backlog',
      noteVars: { n: overdue },
    };
  }
  if (criticalHero.needNow > 0) {
    return {
      titleKey: 'index.hero.focus.title.critical_queue',
      noteKey: 'index.hero.focus.note.critical',
      noteVars: { n: criticalHero.needNow },
    };
  }
  const unassigned = (Array.isArray(tickets) ? tickets : []).filter(
    (t) => !isTicketResolvedDash(t) && (t.assignedUserId == null || t.assignedUserId === '')
  ).length;
  if (unassigned > 0) {
    return {
      titleKey: 'index.hero.focus.title.assignments',
      noteKey: 'index.hero.focus.note.unassigned',
      noteVars: { n: unassigned },
    };
  }
  const open = Number(stats?.openTickets || 0);
  if (open > 0) {
    const noteKey = open === 1 ? 'index.hero.focus.note.open_one' : 'index.hero.focus.note.open_many';
    return {
      titleKey: 'index.hero.focus.title.queue',
      noteKey,
      noteVars: { n: open },
    };
  }
  return {
    titleKey: 'index.hero.focus.title.steady',
    noteKey: 'index.hero.focus.note.steady',
    noteVars: null,
  };
}

function renderHeroSignals() {
  const tickets = ticketsForDashboardStats();
  const stats = getDashboardStats();
  const sla = computeHeroSlaPulse(tickets);
  const crit = computeHeroCriticalLoad(tickets);
  const fleetOnline = countHealthyFleetDevices();
  const invHealthy = Number(stats.devicesHealthy || 0);
  const fleetTotal = invHealthy + fleetOnline;
  const focus = computeHeroDailyFocus(stats, tickets, crit);

  const elSlaV = document.getElementById('hero-sla-value');
  const elSlaN = document.getElementById('hero-sla-note');
  const elCritV = document.getElementById('hero-critical-value');
  const elCritN = document.getElementById('hero-critical-note');
  const elFleetV = document.getElementById('hero-fleet-value');
  const elFleetN = document.getElementById('hero-fleet-note');
  const elFocusT = document.getElementById('hero-focus-title');
  const elFocusN = document.getElementById('hero-focus-note');

  if (elSlaV) elSlaV.textContent = `${sla.pct}%`;
  if (elSlaN) {
    elSlaN.textContent = dashTf(
      sla.slaKey,
      sla.slaVars || {},
      sla.slaKey === 'index.hero.sla.note.on_target_month'
        ? 'On target this month'
        : sla.slaKey === 'index.hero.sla.note.breach_one'
          ? '{bad} closure past SLA · {total} closed MTD'
          : sla.slaKey === 'index.hero.sla.note.breach_many'
            ? '{bad} closures past SLA · {total} closed MTD'
            : sla.slaKey === 'index.hero.sla.note.no_open'
              ? 'No open tickets'
              : sla.slaKey === 'index.hero.sla.note.queue_ok'
                ? 'Queue within SLA right now'
                : sla.slaKey === 'index.hero.sla.note.over_one'
                  ? '{n} active ticket over SLA'
                  : '{n} active tickets over SLA'
    );
  }
  if (elCritV) elCritV.textContent = String(crit.total);
  if (elCritN) {
    elCritN.textContent =
      crit.needNow > 0
        ? dashTf('index.hero.critical.need_now', { n: crit.needNow }, '{n} need action now')
        : crit.total > 0
          ? dashTf('index.hero.critical.all_moving', {}, 'All critical/high owned & in motion')
          : dashTf('index.hero.critical.none', {}, 'No critical/high in queue');
  }
  if (elFleetV) elFleetV.textContent = String(fleetTotal);
  if (elFleetN) {
    elFleetN.textContent =
      fleetTotal > 0
        ? dashTf(
            'index.hero.fleet.breakdown',
            { inv: invHealthy, online: fleetOnline },
            '{inv} inventory · {online} fleet online'
          )
        : dashTf('index.hero.fleet.empty', {}, 'Add inventory or fleet devices to track health');
  }
  if (elFocusT) {
    elFocusT.textContent = dashTf(
      focus.titleKey,
      {},
      focus.titleKey === 'index.hero.focus.title.backlog'
        ? 'Backlog'
        : focus.titleKey === 'index.hero.focus.title.critical_queue'
          ? 'Critical queue'
          : focus.titleKey === 'index.hero.focus.title.assignments'
            ? 'Assignments'
            : focus.titleKey === 'index.hero.focus.title.queue'
              ? 'Queue'
              : 'Steady'
    );
  }
  if (elFocusN) {
    const fk = focus.noteKey;
    const fv = focus.noteVars || {};
    const enFall =
      fk === 'index.hero.focus.note.backlog'
        ? '{n} overdue SLA · resolve breaches first'
        : fk === 'index.hero.focus.note.critical'
          ? '{n} critical/high need action now'
          : fk === 'index.hero.focus.note.unassigned'
            ? '{n} unassigned · pick up ownership'
            : fk === 'index.hero.focus.note.open_one'
              ? '{n} open ticket · keep flow moving'
              : fk === 'index.hero.focus.note.open_many'
                ? '{n} open tickets · keep flow moving'
                : 'No urgent SLA or assignment flags';
    elFocusN.textContent = dashTf(fk, fv, enFall);
  }
}

function toSlaSplitPct(met, warn, breach) {
  const t = met + warn + breach;
  if (t === 0) return { met: 100, warning: 0, breached: 0 };
  const m = Math.round((met / t) * 100);
  const w = Math.round((warn / t) * 100);
  const b = Math.max(0, 100 - m - w);
  return { met: m, warning: w, breached: b };
}

function bucketDailyCounts(tickets, numDays) {
  const labels = [];
  const values = [];
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setTime(start.getTime() - (numDays - 1) * MS_DAY);
  for (let i = 0; i < numDays; i++) {
    const dayStart = new Date(start);
    dayStart.setDate(dayStart.getDate() + i);
    const dayEnd = new Date(dayStart);
    dayEnd.setHours(23, 59, 59, 999);
    labels.push(dayStart.toLocaleDateString(undefined, { weekday: 'short' }));
    const c0 = dayStart.getTime();
    const c1 = dayEnd.getTime();
    values.push(
      tickets.filter((t) => {
        const cm = ticketCreatedMs(t);
        return cm != null && cm >= c0 && cm <= c1;
      }).length
    );
  }
  return { labels, values };
}

function buildTicketTrendSeries(range, tickets) {
  const now = Date.now();
  if (range === '7d') return bucketDailyCounts(tickets, 7);
  if (range === '30d') {
    const startMs = analyticsRangeStartMs('30d');
    const n = 10;
    const step = (now - startMs) / n;
    const labels = [];
    const values = [];
    for (let i = 0; i < n; i++) {
      const a = startMs + i * step;
      const b = startMs + (i + 1) * step;
      labels.push(`W${i + 1}`);
      values.push(
        tickets.filter((t) => {
          const cm = ticketCreatedMs(t);
          return cm != null && cm >= a && cm < b;
        }).length
      );
    }
    return { labels, values };
  }
  const labels = [];
  const values = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    const next = new Date(d);
    next.setMonth(next.getMonth() + 1);
    labels.push(d.toLocaleString('default', { month: 'short' }));
    const c0 = d.getTime();
    const c1 = next.getTime();
    values.push(
      tickets.filter((t) => {
        const cm = ticketCreatedMs(t);
        return cm != null && cm >= c0 && cm < c1;
      }).length
    );
  }
  return { labels, values };
}

function bucketVolumeForRange(tickets, range) {
  const startMs = analyticsRangeStartMs(range);
  const now = Date.now();
  const span = Math.max(MS_DAY, now - startMs);
  const n = 9;
  const step = span / n;
  const values = [];
  for (let i = 0; i < n; i++) {
    const a = startMs + i * step;
    const b = startMs + (i + 1) * step;
    values.push(
      tickets.filter((t) => {
        const cm = ticketCreatedMs(t);
        return cm != null && cm >= a && cm < b;
      }).length
    );
  }
  return values;
}

function computeAlertCategoriesFromTickets(tickets) {
  const labels = ['Hardware', 'Disk', 'Performance', 'Exchange', 'General'];
  const counts = [0, 0, 0, 0, 0];
  const titleOf = (t) => `${t?.title || ''} ${t?.description || ''}`.toLowerCase();
  tickets.forEach((t) => {
    const s = titleOf(t);
    let idx = 4;
    if (/\b(disk|storage|space|drive|volume)\b/.test(s)) idx = 1;
    else if (/\b(cpu|performance|slow|memory|ram|lag)\b/.test(s)) idx = 2;
    else if (/\b(exchange|email|mail|outlook|smtp)\b/.test(s)) idx = 3;
    else if (/\b(hardware|printer|network|vpn|machine|laptop|server|fan|temperature)\b/.test(s)) idx = 0;
    counts[idx]++;
  });
  const base = (typeof DB !== 'undefined' && DB.alertCategories?.colors) || [
    '#f43f5e',
    '#f59e0b',
    '#fb923c',
    '#3b82f6',
    '#0f172a',
  ];
  return { labels, values: counts, colors: base };
}

function inferOsCountsFromInventory(inv) {
  const raw = { windows: 0, unknown: 0, mac: 0, other: 0 };
  (Array.isArray(inv) ? inv : []).forEach((item) => {
    const specs = String(item?.specs || '').toLowerCase();
    const name = String(item?.name || '').toLowerCase();
    const type = String(item?.type || '').toLowerCase();
    const blob = `${specs} ${name} ${type}`;
    if (/ipad|ipados|macos|apple|macbook|\bmac\b/.test(blob)) raw.mac++;
    else if (/android|chromebook|linux/.test(blob)) raw.other++;
    else if (/hp |lenovo|dell|asus|acer|windows|surface/.test(blob) || /laptop|desktop|ordinateur|notebook/.test(type))
      raw.windows++;
    else if (blob.trim()) raw.other++;
    else raw.unknown++;
  });
  return raw;
}

function getOsChartSeriesFromData() {
  const fallbackLabels = ['Windows', 'Unknown', 'Mac', 'Other'];
  try {
    const dev = typeof DB !== 'undefined' ? DB.devices : null;
    if (dev && typeof dev === 'object' && !Array.isArray(dev)) {
      const od = dev.osDistribution;
      if (od && typeof od === 'object') {
        const data = [
          Number(od.windows) || 0,
          Number(od.unknown) || 0,
          Number(od.mac) || 0,
          Number(od.other) || 0,
        ];
        const total = data.reduce((a, b) => a + b, 0);
        if (total > 0) return { labels: [...fallbackLabels], data };
      }
    }
  } catch (_e) {}
  const inv = getSafeInventory();
  const raw = inferOsCountsFromInventory(inv);
  const data = [raw.windows, raw.unknown, raw.mac, raw.other];
  const total = data.reduce((a, b) => a + b, 0);
  if (total <= 0) return { labels: [...fallbackLabels], data: [...OS_PLATFORM_FALLBACK_DATA] };
  return { labels: [...fallbackLabels], data };
}

function ticketMatchesDepartmentName(ticket, deptName) {
  const a = String(ticket?.department || '').trim().toLowerCase();
  const b = String(deptName || '').trim().toLowerCase();
  return a !== '' && a === b;
}

function countOpenTicketsInDepartment(deptName) {
  return getSafeTickets().filter((t) => {
    if (String(t?.status || '').toLowerCase() === 'resolved') return false;
    return ticketMatchesDepartmentName(t, deptName);
  }).length;
}

function departmentAlertPillCounts(deptName) {
  const open = getSafeTickets().filter((t) => {
    if (String(t?.status || '').toLowerCase() === 'resolved') return false;
    return ticketMatchesDepartmentName(t, deptName);
  });
  const p1 = open.filter((t) => t.priority === 'critical' || ticketSlaClassLive(t) === 'breach').length;
  const p2 = open.filter((t) => {
    if (t.priority === 'critical' || ticketSlaClassLive(t) === 'breach') return false;
    return ticketSlaClassLive(t) === 'warn' || t.priority === 'high';
  }).length;
  const p3 = Math.max(0, open.length - p1 - p2);
  return [p1, p2, p3];
}

function computeLiveAnalytics(range) {
  const tickets = ticketsForAnalytics();
  const startMs = analyticsRangeStartMs(range);
  const now = Date.now();
  const inRange = tickets.filter((t) => {
    const cm = ticketCreatedMs(t);
    return cm != null && cm >= startMs && cm <= now;
  });
  const priSource =
    inRange.length > 0
      ? inRange
      : tickets.filter((t) => String(t?.status || '').toLowerCase() !== 'resolved');
  const pri = { critical: 0, high: 0, medium: 0, low: 0 };
  priSource.forEach((t) => {
    const p = String(t.priority || 'low').toLowerCase();
    if (pri[p] !== undefined) pri[p]++;
  });
  const slaSource =
    inRange.length > 0
      ? inRange
      : tickets.filter((t) => String(t?.status || '').toLowerCase() !== 'resolved');
  let met = 0;
  let warn = 0;
  let breach = 0;
  slaSource.forEach((t) => {
    const c = ticketSlaClassLive(t);
    if (c === 'breach') breach++;
    else if (c === 'warn') warn++;
    else met++;
  });
  const slaSplitPct = toSlaSplitPct(met, warn, breach);
  const resolvedInRange = inRange.filter(
    (t) => String(t?.status || '').toLowerCase() === 'resolved' && t?.resolvedAt
  );
  let sumH = 0;
  let nRes = 0;
  resolvedInRange.forEach((t) => {
    const c = ticketCreatedMs(t);
    const r = new Date(t.resolvedAt).getTime();
    if (c != null && !Number.isNaN(r)) {
      sumH += (r - c) / 3600000;
      nRes++;
    }
  });
  const avgResolutionHours = nRes > 0 ? Math.round((sumH / nRes) * 10) / 10 : null;
  const prevStart = startMs - (now - startMs);
  const prevCount = tickets.filter((t) => {
    const cm = ticketCreatedMs(t);
    return cm != null && cm >= prevStart && cm < startMs;
  }).length;
  const curCount = inRange.length;
  let volPct = 0;
  if (prevCount > 0) volPct = Math.round(((curCount - prevCount) / prevCount) * 1000) / 10;
  else if (curCount > 0) volPct = 100;
  let resolvedOk = 0;
  let resolvedTotal = 0;
  resolvedInRange.forEach((t) => {
    resolvedTotal++;
    if (ticketSlaClassLive(t) !== 'breach') resolvedOk++;
  });
  let slaCompliancePct = 100;
  if (resolvedTotal > 0) slaCompliancePct = Math.round((resolvedOk / resolvedTotal) * 100);
  else if (slaSource.length > 0) slaCompliancePct = slaSplitPct.met;
  return {
    ticketTrend: buildTicketTrendSeries(range, tickets),
    ticketsByPriority: pri,
    slaSplitPct,
    avgResolutionHours,
    insightVolumeChangePct: volPct,
    slaCompliancePct,
  };
}

function getEffectiveAnalytics(range) {
  return computeLiveAnalytics(range);
}

function updateAlertStatusNumbers() {
  const stats = dashboardApiStats || {};
  const local = computeInventoryStats();
  const w = Number(stats.replacementSoon ?? stats.warningDevices ?? local.warningDevices ?? 0);
  const c = Number(stats.criticalDevices ?? local.criticalDevices ?? 0);
  const ew = document.getElementById('alert-num-warning');
  const ec = document.getElementById('alert-num-critical');
  if (ew) ew.textContent = String(w);
  if (ec) ec.textContent = String(c);
}

function updateOsDevicesTotalLine() {
  const el = document.getElementById('os-devices-total');
  if (!el) return;
  const n = getSafeInventory().length;
  el.textContent = `${n} Devices total`;
}

function renderAvailabilityTable() {
  const tbody = document.getElementById('avail-table-body');
  if (!tbody) return;
  const dev = typeof DB !== 'undefined' ? DB.devices : null;
  if (dev && typeof dev === 'object' && !Array.isArray(dev) && dev.server && typeof dev.server.online === 'number') {
    const rows = [
      ['Server', dev.server?.online, dev.server?.offline],
      ['PC', dev.pc?.online, dev.pc?.offline],
      ['Mac', dev.mac?.online, dev.mac?.offline],
      ['Linux', dev.linux?.online, dev.linux?.offline],
      ['SNMP', dev.snmp?.online, dev.snmp?.offline],
    ];
    tbody.innerHTML = rows
      .map(([name, on, off]) => {
        const o = on != null && Number(on) > 0 ? `<span class="dot-green">${on}</span>` : '<span class="dot-green">—</span>';
        const f = off != null && Number(off) > 0 ? `<span class="dot-red">${off}</span>` : '<span class="dot-red">—</span>';
        return `<tr><td>${name}</td><td>${o}</td><td>${f}</td></tr>`;
      })
      .join('');
    return;
  }
  const inv = getSafeInventory();
  const groups = {
    Server: { on: 0, off: 0 },
    PC: { on: 0, off: 0 },
    Mac: { on: 0, off: 0 },
    Other: { on: 0, off: 0 },
  };
  inv.forEach((item) => {
    const specs = String(item?.specs || '').toLowerCase();
    const name = String(item?.name || '').toLowerCase();
    const type = String(item?.type || '').toLowerCase();
    const blob = `${specs} ${name} ${type}`;
    let g = 'Other';
    if (/server|srv-|srv_/.test(blob)) g = 'Server';
    else if (/ipad|ipados|macos|apple|macbook|\bmac\b/.test(blob)) g = 'Mac';
    else if (/laptop|desktop|ordinateur|notebook|pc-|workstation/.test(blob)) g = 'PC';
    const bad =
      String(item?.condition || '').toLowerCase() === 'mauvais' ||
      String(item?.status || '').toLowerCase() === 'critical';
    if (bad) groups[g].off++;
    else groups[g].on++;
  });
  tbody.innerHTML = ['Server', 'PC', 'Mac', 'Other']
    .map((name) => {
      const { on, off } = groups[name];
      const o = on > 0 ? `<span class="dot-green">${on}</span>` : '<span class="dot-green">—</span>';
      const f = off > 0 ? `<span class="dot-red">${off}</span>` : '<span class="dot-red">—</span>';
      return `<tr><td>${name}</td><td>${o}</td><td>${f}</td></tr>`;
    })
    .join('');
}

function updateSatisfactionFromSla(range) {
  const a = getEffectiveAnalytics(range);
  const pct = Math.max(0, Math.min(100, Number(a.slaCompliancePct) || 0));
  const stars = Math.max(1, Math.min(5, Math.round(pct / 20)));
  for (let i = 1; i <= 3; i++) {
    const f = document.getElementById(`sat-fill-${i}`);
    const s = document.getElementById(`sat-score-${i}`);
    if (f) f.style.width = `${pct}%`;
    if (s) s.textContent = String(stars);
  }
  const wrap = document.querySelector('.satisfaction-rows')?.parentElement;
  const starEl = wrap?.querySelector('.stars');
  if (starEl) starEl.textContent = '★'.repeat(stars) + '☆'.repeat(5 - stars);
}

function renderUnifiedKpis() {
  const stats = getDashboardStats();
  const elOpen = document.getElementById('kpi-open-tickets');
  const elPending = document.getElementById('kpi-pending-tickets');
  const elOverdue = document.getElementById('kpi-overdue-tickets');
  const elHealthy = document.getElementById('kpi-devices-healthy');
  const elCritical = document.getElementById('kpi-critical-devices');
  const elReplacement = document.getElementById('kpi-replacement-soon');
  if (elOpen) elOpen.textContent = String(stats.openTickets ?? 0);
  if (elPending) elPending.textContent = String(stats.pendingTickets ?? 0);
  if (elOverdue) elOverdue.textContent = String(stats.overdueTickets ?? 0);
  if (elHealthy) elHealthy.textContent = String(stats.devicesHealthy ?? 0);
  if (elCritical) elCritical.textContent = String(stats.criticalDevices ?? 0);
  if (elReplacement) elReplacement.textContent = String(stats.replacementSoon ?? 0);
  renderHeroSignals();
}

/* ---- KPI Counter Animation ---- */
document.querySelectorAll('.kpi-value[data-target]').forEach(el => {
  const target = parseInt(el.dataset.target, 10);
  let current = 0;
  const step = Math.ceil(target / 40);
  const interval = setInterval(() => {
    current = Math.min(current + step, target);
    el.textContent = current.toLocaleString();
    if (current >= target) clearInterval(interval);
  }, 20);
});

/* ---- Helpers ---- */
function getCSS(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }
function priorityBadge(p) {
  const cls = { critical:'critical', high:'high', medium:'medium', low:'low' }[p] || 'low';
  return `<span class="priority-badge ${cls}">${p.charAt(0).toUpperCase()+p.slice(1)}</span>`;
}
function slaBadge(sla, cls) {
  return `<span class="sla-badge ${cls}">${sla}</span>`;
}
function techAvatar(assignedUserId) {
  const canAssign =
    typeof RoleUi === 'undefined' ||
    (typeof RoleUi.canAssignTickets === 'function' && RoleUi.canAssignTickets());
  if (assignedUserId == null || assignedUserId === '') {
    if (!canAssign) {
      return '<span class="ticket-assign-placeholder" style="color:var(--text-muted);font-size:12px">—</span>';
    }
    return `<button type="button" class="assign-btn" onclick="window.location.href='tickets.html'" title="Assign in Tickets">Assign</button>`;
  }
  const u = getUserById(assignedUserId) || { avatarColor: '#64748b', initials: '?', name: 'Unknown' };
  return `<div class="assignee-cell"><div class="tech-avatar" style="background:${u.avatarColor}" title="${u.name}">${u.initials}</div><span class="assignee-name">${u.name}</span></div>`;
}

window.assignTicket = function(id, btn) {
  btn.textContent = 'Assigned ✓';
  btn.style.background = '#10b981';
  btn.disabled = true;
};

function renderRoleDashboardTables() {
  const role = getDashboardRole();
  const userBody = document.getElementById('dash-user-my-tickets-body');
  if (userBody) {
    if (role !== 'user') {
      userBody.innerHTML = '';
    } else {
      const mine = getDashboardTickets().slice().sort((a, b) => Number(b.id) - Number(a.id));
      if (mine.length === 0) {
        userBody.innerHTML =
          '<tr><td colspan="5" style="color:var(--text-muted);font-size:13px">Aucun ticket associé à votre compte (créateur). Les nouveaux tickets apparaîtront ici.</td></tr>';
      } else {
        userBody.innerHTML = mine
          .map(
            (t) => `
    <tr>
      <td><span class="ticket-id">#${t.id}</span></td>
      <td class="ticket-name">${dashEscapeHtml(t.title)}</td>
      <td>${dashEscapeHtml(String(t.status || '—'))}</td>
      <td>${priorityBadge(String(t.priority || 'low').toLowerCase())}</td>
      <td><a href="tickets.html" class="card-link">Ouvrir</a></td>
    </tr>`
          )
          .join('');
      }
    }
  }

  const agentBody = document.getElementById('dash-agent-assigned-body');
  if (agentBody) {
    if (role !== 'agent') {
      agentBody.innerHTML =
        '<tr><td colspan="5" style="color:var(--text-muted);font-size:13px">—</td></tr>';
    } else {
      const openAssigned = getDashboardTickets()
        .filter((t) => !isTicketResolvedDash(t))
        .slice()
        .sort((a, b) => Number(b.id) - Number(a.id));
      if (openAssigned.length === 0) {
        agentBody.innerHTML =
          '<tr><td colspan="5" style="color:var(--text-muted);font-size:13px">Aucun ticket ouvert ne vous est assigné.</td></tr>';
      } else {
        agentBody.innerHTML = openAssigned
          .map(
            (t) => `
    <tr>
      <td><span class="ticket-id">#${t.id}</span></td>
      <td class="ticket-name">${dashEscapeHtml(t.title)}</td>
      <td>${priorityBadge(String(t.priority || 'low').toLowerCase())}</td>
      <td>${slaBadge(t.sla, t.slaClass)}</td>
      <td>${dashEscapeHtml(String(t.status || '—'))}</td>
    </tr>`
          )
          .join('');
      }
    }
  }
}

function renderDashboardSidePanels() {
  const depts = Array.isArray(DB?.departments) ? DB.departments : [];
  const role = getDashboardRole();

  const critBody = document.getElementById('critical-tickets-body');
  if (critBody) {
    const critTickets = getDashboardTickets()
      .filter((t) => t.slaClass === 'breach' || t.priority === 'critical')
      .slice(0, 5);
    critBody.innerHTML = critTickets.map(t => `
    <tr>
      <td><span class="ticket-id">#${t.id}</span> <span class="ticket-name">${t.title}</span></td>
      <td>${techAvatar(t.assignedUserId)}</td>
      <td>${priorityBadge(t.priority)}</td>
      <td>${slaBadge(t.sla, t.slaClass)}</td>
    </tr>
  `).join('');
  }

  const unassignedBody = document.getElementById('unassigned-body');
  if (unassignedBody) {
    if (role !== 'admin') {
      unassignedBody.innerHTML = '';
    } else {
    const unassigned = getSafeTickets().filter(t => !t.assignedUserId);
    unassignedBody.innerHTML = unassigned.map(t => `
    <tr>
      <td><span class="ticket-id">#${t.id}</span></td>
      <td class="ticket-name">${t.title}</td>
      <td>${priorityBadge(t.priority)}</td>
      <td>${slaBadge(t.sla, t.slaClass)}</td>
      <td><button class="assign-btn" onclick="assignTicket(${t.id}, this)">Assign</button></td>
    </tr>
  `).join('');
    }
  }

  const deptAlertsList = document.getElementById('department-alerts-list');
  if (deptAlertsList && depts.length && role === 'admin') {
    deptAlertsList.innerHTML = depts
      .map((d) => {
        const [a, b, c] = departmentAlertPillCounts(d.name);
        return `
    <div class="cust-row">
      <span class="cust-name">${d.name}</span>
      ${[a, b, c].map((x, i) => `<span class="alert-pill p${i + 1}">${x}</span>`).join('')}
    </div>
  `;
      })
      .join('');
  }

  const deptTicketsList = document.getElementById('department-tickets-list');
  if (deptTicketsList && depts.length && role === 'admin') {
    deptTicketsList.innerHTML = depts
      .map(
        (d) => `
    <div class="ct-row">
      <span class="ct-name">${d.name}</span>
      <span class="ct-count">${countOpenTicketsInDepartment(d.name)}</span>
    </div>
  `
      )
      .join('');
  }
}

/* ---- Charts & analytics ---- */
let trendChartInst, volumeChartInst, slaChartInst, priorityChartInst, alertDonutInst, osChartInst, alertCatInst;
let analyticsRange = '7d';

const PRIORITY_ORDER = ['critical', 'high', 'medium', 'low'];
const PRIORITY_LABELS = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' };
const SLA_DRILL = ['ok', 'warn', 'breach'];

function chartDefaults() {
  const isDark = html.dataset.theme === 'dark';
  return {
    gridColor: isDark ? 'rgba(255,255,255,.08)' : 'rgba(15,23,42,.06)',
    textColor: isDark ? '#9aa3b5' : '#697386',
    tooltipBg: isDark ? '#1a1e28' : '#ffffff',
    tooltipText: isDark ? '#f0f2f7' : '#0c111d',
    tooltipBorder: isDark ? 'rgba(255,255,255,.08)' : 'rgba(15,23,42,.08)',
  };
}

function tooltipPlugin(d) {
  return {
    enabled: true,
    backgroundColor: d.tooltipBg,
    titleColor: d.tooltipText,
    bodyColor: d.tooltipText,
    borderColor: d.tooltipBorder,
    borderWidth: 1,
    padding: 12,
    cornerRadius: 10,
    displayColors: true,
    boxPadding: 6,
    usePointStyle: true,
    titleFont: { family: 'Mona Sans', size: 12, weight: '600' },
    bodyFont: { family: 'DM Sans', size: 12 },
    caretSize: 6,
    caretPadding: 10,
  };
}

const chartAnim = {
  duration: 900,
  easing: 'easeOutQuart',
};

function barGradient(ctx, chartArea, color) {
  if (!chartArea) return color;
  const g = ctx.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);
  g.addColorStop(0, color + '55');
  g.addColorStop(1, color);
  return g;
}

function drillTickets(query) {
  window.location.href = `tickets.html${query || ''}`;
}

function updateAvgResolution(range) {
  const el = document.getElementById('avg-resolution-value');
  if (!el) return;
  const a = getEffectiveAnalytics(range);
  const v = a.avgResolutionHours;
  el.textContent = typeof v === 'number' && Number.isFinite(v) ? v.toFixed(1) : '—';
}

function renderInsights(range) {
  const panel = document.getElementById('insights-panel');
  if (!panel) return;
  const a = getEffectiveAnalytics(range);
  const volPct = a.insightVolumeChangePct;
  const slaPct = a.slaCompliancePct;
  const volVerb = volPct >= 0 ? 'increased' : 'decreased';
  const volAbs = Math.abs(volPct);
  const critN = a.ticketsByPriority.critical || 0;
  const highNote =
    range === '90d' && critN <= 1
      ? 'Critical load is <strong>stable</strong> — keep monitoring breach trends.'
      : critN >= 3
        ? '<strong>Critical tickets elevated</strong> — prioritize staffing on breach and critical queues.'
        : '<strong>Monitor priority mix</strong> — align staffing on critical &amp; overdue.';

  panel.innerHTML = `
    <div class="insight-item insight-item--up">
      <span class="insight-label">Volume</span>
      <p>Ticket activity <strong>${volVerb} by ${volAbs}%</strong> compared to the prior ${range === '7d' ? 'week' : range === '30d' ? 'month' : 'quarter'}.</p>
    </div>
    <div class="insight-item insight-item--warn">
      <span class="insight-label">Priority</span>
      <p>${highNote}</p>
    </div>
    <div class="insight-item insight-item--ok">
      <span class="insight-label">SLA</span>
      <p><strong>${slaPct}%</strong> of tickets met SLA targets in this window.</p>
    </div>
  `;
}

function buildTicketTrendChart(range) {
  const canvas = document.getElementById('chartTicketTrend');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (trendChartInst) trendChartInst.destroy();
  const series = getEffectiveAnalytics(range).ticketTrend;
  if (!series?.labels?.length) return;
  const d = chartDefaults();

  trendChartInst = new Chart(ctx, {
    type: 'line',
    data: {
      labels: series.labels,
      datasets: [
        {
          label: 'Tickets',
          data: series.values,
          borderColor: '#635bff',
          borderWidth: 2.5,
          tension: 0.35,
          fill: true,
          pointRadius: 4,
          pointHoverRadius: 7,
          pointBackgroundColor: '#fff',
          pointBorderColor: '#635bff',
          pointBorderWidth: 2,
          pointHoverBackgroundColor: '#635bff',
          pointHoverBorderColor: '#fff',
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'nearest', intersect: false, axis: 'x' },
      animation: chartAnim,
      animations: {
        colors: chartAnim,
        numbers: chartAnim,
      },
      transitions: {
        active: { animation: { duration: 350, easing: 'easeOutCubic' } },
      },
      onClick(_e, elements) {
        if (elements.length) drillTickets('');
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          ...tooltipPlugin(d),
          callbacks: {
            label: (c) => ` ${c.parsed.y} tickets`,
            afterLabel: () => 'Click chart to open tickets',
          },
        },
      },
      scales: {
        x: {
          grid: { color: d.gridColor, drawTicks: false },
          ticks: { color: d.textColor, font: { family: 'DM Sans', size: 11 }, maxRotation: 0 },
        },
        y: {
          beginAtZero: true,
          grid: { color: d.gridColor },
          ticks: { color: d.textColor, font: { family: 'DM Sans', size: 11 } },
        },
      },
    },
    plugins: [
      {
        id: 'lineGradient',
        afterLayout(chart) {
          const ds = chart.data.datasets[0];
          const { ctx, chartArea } = chart;
          if (!chartArea) return;
          const g = ctx.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);
          g.addColorStop(0, 'rgba(99, 91, 255, 0.04)');
          g.addColorStop(0.5, 'rgba(99, 91, 255, 0.15)');
          g.addColorStop(1, 'rgba(99, 91, 255, 0.38)');
          ds.backgroundColor = g;
        },
      },
    ],
  });
}

function buildTicketVolumeChart(range) {
  const canvas = document.getElementById('chartTicketVolume');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (volumeChartInst) volumeChartInst.destroy();
  const data = bucketVolumeForRange(ticketsForAnalytics(), range);
  const d = chartDefaults();
  const labels = data.map((_, i) => `P${i + 1}`);

  volumeChartInst = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Volume',
          data,
          borderRadius: 8,
          borderSkipped: false,
          maxBarThickness: 36,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: chartAnim,
      interaction: { mode: 'index', intersect: false },
      onClick(_e, elements) {
        if (elements.length) drillTickets('');
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          ...tooltipPlugin(d),
          callbacks: {
            label: (c) => ` ${c.parsed.y} tickets`,
            afterLabel: () => 'Click to view tickets',
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: d.textColor, font: { family: 'DM Sans', size: 10 } },
        },
        y: {
          beginAtZero: true,
          grid: { color: d.gridColor },
          ticks: { color: d.textColor, font: { family: 'DM Sans', size: 11 } },
        },
      },
    },
    plugins: [
      {
        id: 'barGradVolume',
        beforeDatasetsDraw(chart) {
          const ds = chart.data.datasets[0];
          const { ctx, chartArea } = chart;
          if (!chartArea) return;
          ds.backgroundColor = data.map((_, i) => barGradient(ctx, chartArea, i % 2 === 0 ? '#e94d67' : '#f472b6'));
        },
      },
    ],
  });
}

function buildSlaChart(range) {
  const canvas = document.getElementById('chartSlaCompliance');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (slaChartInst) slaChartInst.destroy();
  const split = getEffectiveAnalytics(range).slaSplitPct;
  const d = chartDefaults();
  const labels = ['Within SLA', 'At risk', 'Breached'];
  const values = [split.met, split.warning, split.breached];
  const colors = ['#0d9f6e', '#d97706', '#e94d67'];

  slaChartInst = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [
        {
          data: values,
          backgroundColor: colors,
          borderWidth: 2,
          borderColor: d.tooltipBg,
          hoverOffset: 10,
          hoverBorderWidth: 3,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '68%',
      animation: chartAnim,
      onClick(_e, elements) {
        if (!elements.length) return;
        const i = elements[0].index;
        drillTickets(`?sla=${SLA_DRILL[i]}`);
      },
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: d.textColor,
            font: { family: 'DM Sans', size: 10 },
            boxWidth: 10,
            padding: 10,
            usePointStyle: true,
          },
        },
        tooltip: {
          ...tooltipPlugin(d),
          callbacks: {
            label: (c) => {
              const pct = c.parsed;
              return ` ${c.label}: ${pct}%`;
            },
            afterLabel: () => 'Click to filter tickets',
          },
        },
      },
    },
  });
}

function buildPriorityChart(range) {
  const canvas = document.getElementById('chartPriority');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (priorityChartInst) priorityChartInst.destroy();
  const src = getEffectiveAnalytics(range).ticketsByPriority;
  const labels = PRIORITY_ORDER.map((k) => PRIORITY_LABELS[k]);
  const data = PRIORITY_ORDER.map((k) => src[k]);
  const colors = ['#e94d67', '#ea580c', '#ca8a04', '#0d9f6e'];
  const d = chartDefaults();

  priorityChartInst = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Tickets',
          data,
          backgroundColor: colors,
          hoverBackgroundColor: colors.map((c) => c + 'dd'),
          borderRadius: 8,
          borderSkipped: false,
          maxBarThickness: 28,
        },
      ],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      animation: chartAnim,
      onClick(_e, elements) {
        if (!elements.length) return;
        const i = elements[0].index;
        drillTickets(`?priority=${PRIORITY_ORDER[i]}`);
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          ...tooltipPlugin(d),
          callbacks: {
            label: (c) => ` ${c.parsed.x} tickets`,
            afterLabel: () => 'Click to drill down',
          },
        },
      },
      scales: {
        x: {
          beginAtZero: true,
          grid: { color: d.gridColor },
          ticks: { color: d.textColor, font: { family: 'DM Sans', size: 11 } },
        },
        y: {
          grid: { display: false },
          ticks: { color: d.textColor, font: { family: 'DM Sans', size: 11 } },
        },
      },
    },
  });
}

function buildAlertDonut() {
  const canvas = document.getElementById('alertDonut');
  if (!canvas || !(canvas instanceof HTMLCanvasElement)) return;
  if (alertDonutInst) alertDonutInst.destroy();
  const d = chartDefaults();
  const stats = dashboardApiStats || {};
  const localStats = computeInventoryStats();
  const warning = Number(stats.replacementSoon ?? stats.warningDevices ?? localStats.warningDevices ?? 0);
  const critical = Number(stats.criticalDevices ?? localStats.criticalDevices ?? 0);
  alertDonutInst = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: ['Warning', 'Critical'],
      datasets: [
        {
          data: [warning, critical],
          backgroundColor: ['#d97706', '#e94d67'],
          borderWidth: 2,
          borderColor: d.tooltipBg,
          hoverOffset: 12,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '70%',
      animation: chartAnim,
      onClick() {
        drillTickets('');
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          ...tooltipPlugin(d),
          callbacks: {
            afterLabel: () => 'Click to open tickets',
          },
        },
      },
    },
  });
}

const OS_PLATFORM_LABELS = ['Windows', 'Unknown', 'Mac', 'Other'];
const OS_PLATFORM_COLORS = ['#e94d67', '#94a3b8', '#4f6df5', '#0d9f6e'];
const OS_PLATFORM_FALLBACK_DATA = [57, 11, 14, 18];

/** OS doughnut from inventory inference or DB.devices.osDistribution. */
function getOsPlatformChartData() {
  try {
    return getOsChartSeriesFromData();
  } catch (e) {
    console.warn('OS chart: fallback', e);
    return { labels: [...OS_PLATFORM_LABELS], data: [...OS_PLATFORM_FALLBACK_DATA] };
  }
}

function updateOsLegendDOM(series) {
  const ul = document.getElementById('os-legend');
  if (!ul || !series?.labels || !series?.data) return;
  const total = series.data.reduce((a, b) => a + Number(b || 0), 0);
  ul.innerHTML = series.labels
    .map((label, i) => {
      const v = Number(series.data[i]) || 0;
      const pct = total > 0 ? Math.round((v / total) * 100) : 0;
      const color = OS_PLATFORM_COLORS[i] || '#8891a4';
      return `<li><span class="dot" style="background:${color}"></span>${label} <strong>${pct}%</strong></li>`;
    })
    .join('');
}

function buildOsChart() {
  try {
    if (typeof Chart === 'undefined') {
      console.warn('OS chart: Chart.js is not loaded');
      return;
    }
    const ctx = document.getElementById('osChart');
    if (!ctx || !(ctx instanceof HTMLCanvasElement)) {
      console.warn('OS chart: #osChart canvas element not found');
      return;
    }

    const series = getOsPlatformChartData();

    if (osChartInst) {
      try {
        osChartInst.destroy();
      } catch (_) {}
      osChartInst = null;
    }

    let d;
    try {
      d = chartDefaults();
    } catch (e) {
      console.warn('OS chart: chartDefaults failed, using plain tooltip colors', e);
      d = {
        gridColor: 'rgba(15,23,42,.06)',
        textColor: '#697386',
        tooltipBg: '#ffffff',
        tooltipText: '#0c111d',
        tooltipBorder: 'rgba(15,23,42,.08)',
      };
    }

    osChartInst = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: series.labels,
        datasets: [
          {
            data: series.data,
            backgroundColor: OS_PLATFORM_COLORS,
            borderWidth: 2,
            borderColor: d.tooltipBg,
            hoverOffset: 10,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '65%',
        animation: chartAnim,
        plugins: {
          legend: { display: false },
          tooltip: {
            ...tooltipPlugin(d),
            callbacks: {
              label: (c) => {
                const arr = c.dataset?.data;
                const total = Array.isArray(arr) ? arr.reduce((a, b) => a + Number(b || 0), 0) : 0;
                const v = Number(c.raw) || 0;
                const pct = total > 0 ? Math.round((v / total) * 100) : 0;
                return ` ${c.label}: ${pct}% (${v})`;
              },
            },
          },
        },
      },
    });

    updateOsLegendDOM(series);
  } catch (e) {
    console.error('OS chart: failed to create chart', e);
  }
}

function buildAlertCatChart() {
  const ctx = document.getElementById('alertCatChart')?.getContext('2d');
  if (!ctx) return;
  if (alertCatInst) alertCatInst.destroy();
  const d = chartDefaults();
  const cat = computeAlertCategoriesFromTickets(ticketsForAnalytics());

  alertCatInst = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: cat.labels,
      datasets: [
        {
          data: cat.values,
          borderRadius: 8,
          borderSkipped: false,
          maxBarThickness: 32,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: chartAnim,
      interaction: { mode: 'index', intersect: false },
      onClick() {
        drillTickets('');
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          ...tooltipPlugin(d),
          callbacks: {
            label: (c) => ` ${c.parsed.y.toLocaleString()} alerts`,
            afterLabel: () => 'Click to explore',
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: d.textColor, font: { family: 'DM Sans', size: 10 }, maxRotation: 35 },
        },
        y: {
          grid: { color: d.gridColor },
          ticks: { color: d.textColor, font: { family: 'DM Sans', size: 11 } },
        },
      },
    },
    plugins: [
      {
        id: 'catGrad',
        beforeDatasetsDraw(chart) {
          const { ctx, chartArea } = chart;
          if (!chartArea) return;
          chart.data.datasets[0].backgroundColor = cat.colors.map((hex, i) =>
            barGradient(ctx, chartArea, hex)
          );
        },
      },
    ],
  });
}

function rerenderAnalytics() {
  const r = analyticsRange;
  renderInsights(r);
  updateAvgResolution(r);
  buildTicketTrendChart(r);
  buildTicketVolumeChart(r);
  buildSlaChart(r);
  buildPriorityChart(r);
}

function rerenderCharts() {
  applyDashboardRoleShell();
  renderUnifiedKpis();
  void pullDashboardStatsFromApi();
  updateAlertStatusNumbers();
  updateOsDevicesTotalLine();
  renderAvailabilityTable();
  renderRoleDashboardTables();
  renderDashboardSidePanels();
  rerenderAnalytics();
  updateSatisfactionFromSla(analyticsRange);
  buildAlertDonut();
  buildOsChart();
  buildAlertCatChart();
  rebuildLiveNotifications();
  syncNotifBadge();
}

try {
  rerenderCharts();
} catch (e) {
  console.error('Dashboard error:', e);
}

void (async () => {
  try {
    await hydrateDashboardFromApi();
    rerenderCharts();
    await pullDashboardStatsFromApi(true);
  } catch (e) {
    console.error('Dashboard error:', e);
  }
})();

window.addEventListener('diatech:data-changed', () => scheduleDashboardFullRefresh());

window.addEventListener('i18n:change', () => {
  try {
    applyDashboardRoleShell();
    renderRoleDashboardTables();
    renderHeroSignals();
  } catch (e) {
    console.error('Dashboard error:', e);
  }
});

window.addEventListener('storage', () => {
  scheduleDashboardFullRefresh();
});

window.addEventListener('focus', () => {
  scheduleDashboardFullRefresh();
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  scheduleDashboardFullRefresh();
});

document.querySelectorAll('.chip[data-analytics-range]').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.chip[data-analytics-range]').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    analyticsRange = btn.dataset.analyticsRange;
    rerenderAnalytics();
    updateSatisfactionFromSla(analyticsRange);
  });
});

const DASHBOARD_POLL_MS = 60000;
setInterval(() => {
  if (document.visibilityState === 'visible') scheduleDashboardFullRefresh();
}, DASHBOARD_POLL_MS);

// —— Notification panel (built from tickets + consumables)
let notifications = [];

function relTime(ts) {
  const d = typeof ts === 'number' ? ts : new Date(ts || Date.now()).getTime();
  const sec = Math.max(0, Math.floor((Date.now() - d) / 1000));
  if (sec < 60) return 'just now';
  if (sec < 3600) return `${Math.floor(sec / 60)} min ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

function rebuildLiveNotifications() {
  const items = [];
  const tickets = getDashboardRole() === 'admin' ? getSafeTickets() : getDashboardTickets();
  tickets
    .filter((t) => String(t?.priority || '').toLowerCase() === 'critical' && String(t?.status || '').toLowerCase() !== 'resolved')
    .slice(0, 4)
    .forEach((t) => {
      const ts = ticketCreatedMs(t) || Date.now();
      items.push({
        id: `t-${t.id}`,
        text: `Critical: ${t.title || '#' + t.id}`,
        time: relTime(ts),
        unread: true,
      });
    });
  tickets
    .filter((t) => ticketSlaClassLive(t) === 'breach' && String(t?.status || '').toLowerCase() !== 'resolved')
    .slice(0, 3)
    .forEach((t) => {
      if (items.some((x) => x.id === `t-${t.id}`)) return;
      const ts = ticketCreatedMs(t) || Date.now();
      items.push({
        id: `b-${t.id}`,
        text: `SLA breach: ${t.title || '#' + t.id}`,
        time: relTime(ts),
        unread: true,
      });
    });
  getSafeConsumables()
    .filter((c) => Number(c?.stockActuel) <= Number(c?.stockMin))
    .slice(0, 3)
    .forEach((c) => {
      items.push({
        id: `c-${c.id}`,
        text: `Low stock: ${c.name || c.id}`,
        time: 'inventory',
        unread: true,
      });
    });
  if (items.length === 0) {
    items.push({ id: 'ok', text: 'No urgent alerts right now.', time: 'live', unread: false });
  }
  notifications = items;
}

function syncNotifBadge() {
  const badge = document.getElementById('notif-badge');
  if (!badge) return;
  const n = notifications.filter((x) => x.unread).length;
  if (n === 0) {
    badge.style.display = 'none';
  } else {
    badge.style.display = 'flex';
    badge.textContent = String(n);
  }
}

function renderNotifPanel() {
  const list = document.getElementById('notif-list');
  if (!list) return;
  list.innerHTML = notifications
    .map(
      (n) => `
    <div class="notif-item ${n.unread ? 'unread' : ''}">
      ${n.unread ? '<div class="notif-dot"></div>' : '<div style="width:8px;flex-shrink:0"></div>'}
      <div>
        <div class="notif-text">${n.text}</div>
        <div class="notif-time">${n.time}</div>
      </div>
    </div>
  `
    )
    .join('');
}

rebuildLiveNotifications();
syncNotifBadge();

document.getElementById('notif-btn')?.addEventListener('click', () => {
  document.getElementById('notif-panel')?.classList.add('open');
  document.getElementById('notif-backdrop')?.classList.add('open');
  document.getElementById('notif-backdrop')?.setAttribute('aria-hidden', 'false');
  renderNotifPanel();
});

document.getElementById('notif-backdrop')?.addEventListener('click', () => {
  document.getElementById('notif-panel')?.classList.remove('open');
  document.getElementById('notif-backdrop')?.classList.remove('open');
  document.getElementById('notif-backdrop')?.setAttribute('aria-hidden', 'true');
});

document.getElementById('notif-clear')?.addEventListener('click', (e) => {
  e.stopPropagation();
  notifications.forEach((n) => {
    n.unread = false;
  });
  syncNotifBadge();
  renderNotifPanel();
});

// —— Command palette
const CMD_ITEMS_STATIC = [
  { label: 'Dashboard', type: 'Page', href: 'index.html' },
  { label: 'Tickets', type: 'Page', href: 'tickets.html' },
  { label: 'Devices', type: 'Page', href: 'devices.html' },
  { label: 'Départements', type: 'Page', href: 'departments.html' },
  { label: 'Alerts', type: 'Page', href: 'alerts.html' },
  { label: 'Reports', type: 'Page', href: 'reports.html' },
  { label: 'IT Analytics', type: 'Page', href: 'it-analytics.html' },
  { label: 'Inventory', type: 'Page', href: 'inventory.html' },
  { label: 'Budget', type: 'Page', href: 'budget.html' },
  { label: 'Settings', type: 'Page', href: 'settings.html' },
  { label: 'Direction', type: 'Département', href: 'departments.html' },
  { label: 'Médical', type: 'Département', href: 'departments.html' },
  { label: 'SRV-WIN-01', type: 'Device', href: 'devices.html' },
];

function getCmdItemsMerged() {
  const fromTickets = getSafeTickets().slice(0, 12).map((t) => ({
    label: `#${t.id} ${t.title || 'Ticket'}`,
    type: 'Ticket',
    href: 'tickets.html',
  }));
  return [...fromTickets, ...CMD_ITEMS_STATIC];
}

let cmdFiltered = [];
let cmdSelected = 0;

function closeCmd() {
  document.getElementById('cmd-palette')?.classList.remove('open');
}

function updateCmdHighlight() {
  document.querySelectorAll('.cmd-result-item').forEach((el, idx) => {
    el.classList.toggle('selected', idx === cmdSelected);
  });
}

function renderCmd(query) {
  const resultsEl = document.getElementById('cmd-results');
  if (!resultsEl) return;
  const q = query.toLowerCase().trim();
  const cmdItems = getCmdItemsMerged();
  cmdFiltered = q ? cmdItems.filter((i) => i.label.toLowerCase().includes(q)) : cmdItems.slice();
  cmdSelected = 0;
  resultsEl.innerHTML =
    cmdFiltered.length > 0
      ? cmdFiltered
          .map(
            (i, idx) => `
        <div class="cmd-result-item ${idx === cmdSelected ? 'selected' : ''}" data-href="${i.href}">
          <span class="cmd-result-type">${i.type}</span>
          <span>${i.label}</span>
        </div>`
          )
          .join('')
      : '<div style="padding:20px;text-align:center;color:var(--text-subtle);font-size:13px">No results</div>';
  resultsEl.querySelectorAll('.cmd-result-item').forEach((el) => {
    el.addEventListener('click', () => {
      const href = el.getAttribute('data-href');
      if (href) window.location.href = href;
    });
  });
}

function openCmd() {
  const pal = document.getElementById('cmd-palette');
  const inp = document.getElementById('cmd-input');
  if (!pal || !inp) return;
  pal.classList.add('open');
  inp.value = '';
  renderCmd('');
  inp.focus();
}

document.getElementById('cmd-input')?.addEventListener('input', (e) => renderCmd(e.target.value));

document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault();
    const pal = document.getElementById('cmd-palette');
    if (pal?.classList.contains('open')) closeCmd();
    else openCmd();
    return;
  }

  if (e.key === 'Escape') {
    const pal = document.getElementById('cmd-palette');
    if (pal?.classList.contains('open')) {
      e.preventDefault();
      closeCmd();
      return;
    }
    const notifPanel = document.getElementById('notif-panel');
    if (notifPanel?.classList.contains('open')) {
      e.preventDefault();
      notifPanel.classList.remove('open');
      document.getElementById('notif-backdrop')?.classList.remove('open');
      document.getElementById('notif-backdrop')?.setAttribute('aria-hidden', 'true');
    }
    return;
  }

  const pal = document.getElementById('cmd-palette');
  if (!pal?.classList.contains('open')) return;

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (cmdFiltered.length) cmdSelected = Math.min(cmdFiltered.length - 1, cmdSelected + 1);
    updateCmdHighlight();
    return;
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (cmdFiltered.length) cmdSelected = Math.max(0, cmdSelected - 1);
    updateCmdHighlight();
    return;
  }
  if (e.key === 'Enter') {
    const item = cmdFiltered[cmdSelected];
    if (item?.href) {
      e.preventDefault();
      window.location.href = item.href;
    }
  }
});

document.getElementById('cmd-palette')?.addEventListener('click', (e) => {
  if (e.target.id === 'cmd-palette') closeCmd();
});

document.querySelector('.search-box input')?.addEventListener('focus', () => {
  openCmd();
});

