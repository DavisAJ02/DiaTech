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

const DASHBOARD_INVENTORY_KEY = 'nexusops_inventory_v2';
const DASHBOARD_CONSUMABLES_KEY = 'cmd_consumables_v1';
const DASHBOARD_API_BASE = (() => {
  const fromWindow = typeof window !== 'undefined' ? String(window.__API_BASE__ || '').trim() : '';
  const fromStorage = typeof localStorage !== 'undefined' ? String(localStorage.getItem('ti_api_base') || '').trim() : '';
  const explicit = (fromWindow || fromStorage).replace(/\/+$/, '');
  if (explicit) return explicit;
  const host = String(window?.location?.hostname || '').toLowerCase();
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

function hydrateDashboardLiveDataFromStorage() {
  try {
    const invRaw = localStorage.getItem(DASHBOARD_INVENTORY_KEY);
    if (invRaw) {
      const invParsed = JSON.parse(invRaw);
      if (Array.isArray(invParsed)) DB.inventory = invParsed;
    }
  } catch (e) {
    console.warn('Dashboard inventory hydrate failed', e);
  }
  try {
    const consRaw = localStorage.getItem(DASHBOARD_CONSUMABLES_KEY);
    if (consRaw) {
      const consParsed = JSON.parse(consRaw);
      if (Array.isArray(consParsed)) DB.consumables = consParsed;
    }
  } catch (e) {
    console.warn('Dashboard consumables hydrate failed', e);
  }
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
  if (dashboardApiStats && typeof dashboardApiStats === 'object') {
    return {
      openTickets: Number(dashboardApiStats.openTickets || 0),
      pendingTickets: Number(dashboardApiStats.pendingTickets || 0),
      overdueTickets: Number(dashboardApiStats.overdueTickets || 0),
      devicesHealthy: Number(dashboardApiStats.devicesHealthy || 0),
      criticalDevices: Number(dashboardApiStats.criticalDevices || 0),
      replacementSoon: Number(dashboardApiStats.replacementSoon || 0),
    };
  }
  const tickets = window.getTicketsData ? window.getTicketsData() : getSafeTickets();
  const inventory = window.getInventoryData ? window.getInventoryData() : [];
  const year = new Date().getFullYear();

  const openTickets = tickets.filter((t) => String(t?.status || '').toLowerCase() === 'open').length;
  const pendingTickets = tickets.filter((t) => {
    const s = String(t?.status || '').toLowerCase();
    return s === 'pending' || s === 'in-progress' || s === 'in_progress';
  }).length;
  const overdueTickets = tickets.filter((t) => {
    const slaStatus = String(t?.slaStatus || '').toLowerCase();
    const slaClass = String(t?.slaClass || '').toLowerCase();
    return slaStatus === 'overdue' || slaClass === 'breach';
  }).length;

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

function renderUnifiedKpis() {
  const stats = getDashboardStats();
  console.log('Dashboard stats:', stats);
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
}

console.log('Inventory:', DB.inventory);
console.log('Consumables:', DB.consumables);

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
  if (assignedUserId == null || assignedUserId === '') return `<button class="assign-btn">Assign</button>`;
  const u = getUserById(assignedUserId) || { avatarColor: '#64748b', initials: '?', name: 'Unknown' };
  return `<div class="assignee-cell"><div class="tech-avatar" style="background:${u.avatarColor}" title="${u.name}">${u.initials}</div><span class="assignee-name">${u.name}</span></div>`;
}

/* ---- Critical Tickets Table ---- */
const critBody = document.getElementById('critical-tickets-body');
if (critBody) {
  const critTickets = getSafeTickets().filter(t => t.slaClass === 'breach' || t.priority === 'critical').slice(0, 5);
  critBody.innerHTML = critTickets.map(t => `
    <tr>
      <td><span class="ticket-id">#${t.id}</span> <span class="ticket-name">${t.title}</span></td>
      <td>${techAvatar(t.assignedUserId)}</td>
      <td>${priorityBadge(t.priority)}</td>
      <td>${slaBadge(t.sla, t.slaClass)}</td>
    </tr>
  `).join('');
}

/* ---- Unassigned Tickets Table ---- */
const unassignedBody = document.getElementById('unassigned-body');
if (unassignedBody) {
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

window.assignTicket = function(id, btn) {
  btn.textContent = 'Assigned ✓';
  btn.style.background = '#10b981';
  btn.disabled = true;
};

/* ---- Department Alerts ---- */
const deptAlertsList = document.getElementById('department-alerts-list');
if (deptAlertsList && Array.isArray(DB?.departments)) {
  deptAlertsList.innerHTML = DB.departments.map(d => `
    <div class="cust-row">
      <span class="cust-name">${d.name}</span>
      ${[
        Math.max(0, Math.round((d.tickets || 0) * 0.6)),
        Math.max(0, Math.round((d.tickets || 0) * 0.3)),
        Math.max(0, Math.round((d.tickets || 0) * 0.1))
      ].map((a, i) => `<span class="alert-pill p${i+1}">${a}</span>`).join('')}
    </div>
  `).join('');
}

/* ---- Department Tickets ---- */
const deptTicketsList = document.getElementById('department-tickets-list');
if (deptTicketsList && Array.isArray(DB?.departments)) {
  deptTicketsList.innerHTML = DB.departments.map(d => `
    <div class="ct-row">
      <span class="ct-name">${d.name}</span>
      <span class="ct-count">${d.tickets}</span>
    </div>
  `).join('');
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
  if (!el || !DB.analytics?.avgResolutionHours) return;
  const v = DB.analytics.avgResolutionHours[range];
  el.textContent = typeof v === 'number' ? v.toFixed(1) : '—';
}

function renderInsights(range) {
  const panel = document.getElementById('insights-panel');
  if (!panel || !DB.analytics) return;
  const volPct = DB.analytics.insightVolumeChangePct[range];
  const slaPct = DB.analytics.slaCompliancePct[range];
  const highNote =
    range === '90d'
      ? 'Critical load is <strong>stable</strong> — keep monitoring breach trends.'
      : '<strong>High priority tickets rising</strong> — align staffing on critical &amp; overdue.';

  panel.innerHTML = `
    <div class="insight-item insight-item--up">
      <span class="insight-label">Volume</span>
      <p>Ticket activity <strong>increased by ${volPct}%</strong> compared to the prior ${range === '7d' ? 'week' : range === '30d' ? 'month' : 'quarter'}.</p>
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
  if (!canvas || !DB.analytics?.ticketTrend?.[range]) return;
  const ctx = canvas.getContext('2d');
  if (trendChartInst) trendChartInst.destroy();
  const series = DB.analytics.ticketTrend[range];
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
  const data = DB.ticketActivity[range];
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
  if (!canvas || !DB.analytics?.slaSplitPct?.[range]) return;
  const ctx = canvas.getContext('2d');
  if (slaChartInst) slaChartInst.destroy();
  const split = DB.analytics.slaSplitPct[range];
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
  if (!canvas || !DB.analytics?.ticketsByPriority?.[range]) return;
  const ctx = canvas.getContext('2d');
  if (priorityChartInst) priorityChartInst.destroy();
  const src = DB.analytics.ticketsByPriority[range];
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
  const warning = Number(stats.replacementSoon || stats.warningDevices || localStats.warningDevices || 187);
  const critical = Number(stats.criticalDevices || localStats.criticalDevices || 12);
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

/** OS doughnut from DB.devices.osDistribution (percent shares), or fallback. */
function getOsPlatformChartData() {
  const fallback = { labels: [...OS_PLATFORM_LABELS], data: [...OS_PLATFORM_FALLBACK_DATA] };
  try {
    if (typeof DB === 'undefined' || DB == null) return fallback;
    const dev = DB.devices;
    if (!dev || typeof dev !== 'object') return fallback;
    const od = dev.osDistribution;
    if (!od || typeof od !== 'object') return fallback;
    const data = [
      Number(od.windows) || 0,
      Number(od.unknown) || 0,
      Number(od.mac) || 0,
      Number(od.other) || 0,
    ];
    const total = data.reduce((a, b) => a + b, 0);
    if (!Number.isFinite(total) || total <= 0) return fallback;
    return { labels: [...OS_PLATFORM_LABELS], data };
  } catch (e) {
    console.warn('OS chart: getOsPlatformChartData using fallback', e);
    return fallback;
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
  const cat = DB.alertCategories;

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
  hydrateDashboardLiveDataFromStorage();
  renderUnifiedKpis();
  void pullDashboardStatsFromApi();
  rerenderAnalytics();
  buildAlertDonut();
  buildOsChart();
  buildAlertCatChart();
}

try {
  rerenderCharts();
} catch (e) {
  console.error('Dashboard error:', e);
}

window.addEventListener('storage', () => {
  try {
    rerenderCharts();
  } catch (e) {
    console.error('Dashboard error:', e);
  }
});

window.addEventListener('focus', () => {
  try {
    rerenderCharts();
  } catch (e) {
    console.error('Dashboard error:', e);
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  try {
    rerenderCharts();
  } catch (e) {
    console.error('Dashboard error:', e);
  }
});

document.querySelectorAll('.chip[data-analytics-range]').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.chip[data-analytics-range]').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    analyticsRange = btn.dataset.analyticsRange;
    rerenderAnalytics();
  });
});

// —— Notification panel
const notifications = [
  { id: 1, text: 'CPU temperature critical on SRV-WIN-01', time: '2 min ago', unread: true },
  { id: 2, text: 'VPN tunnel down — Insight Systems', time: '18 min ago', unread: true },
  { id: 3, text: 'SLA breached on ticket #1535', time: '1h ago', unread: true },
  { id: 4, text: 'New device connected: MAC-JD-01', time: '3h ago', unread: false },
  { id: 5, text: 'Monthly budget cap exceeded', time: '5h ago', unread: false },
];

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
const cmdItems = [
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
  { label: '#1531 Machine status unknown', type: 'Ticket', href: 'tickets.html' },
  { label: '#1533 CPU temperature', type: 'Ticket', href: 'tickets.html' },
  { label: '#1535 VPN connection failed', type: 'Ticket', href: 'tickets.html' },
  { label: 'Direction', type: 'Département', href: 'departments.html' },
  { label: 'Médical', type: 'Département', href: 'departments.html' },
  { label: 'SRV-WIN-01', type: 'Device', href: 'devices.html' },
];

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

