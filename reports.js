(function () {
  const html = document.documentElement;
  const chartAnim = { duration: 800, easing: "easeOutQuart" };
  const charts = {};

  let currentPeriod = "30d";
  let monthlyRows = [];
  let reportModel = null;

  const PERIODS = {
    "7d": { days: 7, bucket: "day" },
    "30d": { days: 30, bucket: "day" },
    "90d": { days: 90, bucket: "week" },
    "1y": { days: 365, bucket: "month" },
  };

  if (localStorage.getItem("theme")) html.dataset.theme = localStorage.getItem("theme");
  document.getElementById("theme-toggle")?.addEventListener("click", () => {
    const d = html.dataset.theme === "dark";
    html.dataset.theme = d ? "" : "dark";
    localStorage.setItem("theme", d ? "" : "dark");
    if (reportModel) buildAllCharts(currentPeriod);
  });

  function cd() {
    const dark = html.dataset.theme === "dark";
    return {
      grid: dark ? "rgba(255,255,255,.06)" : "rgba(15,23,42,.06)",
      text: dark ? "#9aa3b5" : "#697386",
      tipBg: dark ? "#1a1e28" : "#ffffff",
      tipText: dark ? "#f0f2f7" : "#0c111d",
      tipBorder: dark ? "rgba(255,255,255,.08)" : "rgba(15,23,42,.08)",
    };
  }

  function tip(d) {
    return {
      backgroundColor: d.tipBg,
      titleColor: d.tipText,
      bodyColor: d.tipText,
      borderColor: d.tipBorder,
      borderWidth: 1,
      padding: 12,
      cornerRadius: 10,
      usePointStyle: true,
      boxPadding: 6,
      titleFont: { family: "Mona Sans", size: 12, weight: "600" },
      bodyFont: { family: "DM Sans", size: 12 },
    };
  }

  function safeTickets() {
    return Array.isArray(DB?.tickets) ? DB.tickets : [];
  }

  function dateDaysAgo(days) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - days);
    return d;
  }

  function getTicketDateValue(t) {
    const raw = t?.createdAt || t?.openedAt || t?.date || t?.updatedAt || null;
    if (raw) {
      const parsed = new Date(raw);
      if (!Number.isNaN(parsed.getTime())) return parsed.getTime();
    }
    const idNum = Number(t?.id || 0);
    return new Date().getTime() - idNum * 3600000;
  }

  function normalizeTicketEvents() {
    const now = Date.now();
    const withDates = safeTickets()
      .map((t) => ({ ...t, _ts: getTicketDateValue(t) }))
      .sort((a, b) => a._ts - b._ts);
    if (!withDates.length) return [];

    const hasRealDate = withDates.some((t) => Boolean(t.createdAt || t.openedAt || t.date || t.updatedAt));
    if (hasRealDate) return withDates.map((t) => ({ ...t, eventDate: new Date(t._ts) }));

    // If no explicit dates, distribute deterministically over the last 365 days.
    const span = 365;
    const total = withDates.length;
    return withDates.map((t, i) => {
      const offset = Math.floor((i / Math.max(1, total - 1)) * span);
      const eventDate = new Date(now - (span - offset) * 86400000);
      return { ...t, eventDate };
    });
  }

  function inRange(eventDate, start, end) {
    const ts = eventDate.getTime();
    return ts >= start.getTime() && ts <= end.getTime();
  }

  function bucketLabel(date, bucket) {
    if (bucket === "month") return date.toLocaleDateString(undefined, { month: "short" });
    if (bucket === "week") {
      const oneJan = new Date(date.getFullYear(), 0, 1);
      const week = Math.ceil((((date - oneJan) / 86400000) + oneJan.getDay() + 1) / 7);
      return `W${week}`;
    }
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  function buildBuckets(days, bucket) {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const start = dateDaysAgo(days - 1);
    const out = [];
    const cursor = new Date(start);
    while (cursor <= now) {
      out.push(new Date(cursor));
      if (bucket === "month") cursor.setMonth(cursor.getMonth() + 1, 1);
      else if (bucket === "week") cursor.setDate(cursor.getDate() + 7);
      else cursor.setDate(cursor.getDate() + 1);
    }
    return out;
  }

  function resolutionHoursForTicket(t) {
    const createdAt = t?.createdAt ? new Date(t.createdAt) : null;
    const resolvedAt = t?.resolvedAt ? new Date(t.resolvedAt) : null;
    if (!createdAt || !resolvedAt) return null;
    if (Number.isNaN(createdAt.getTime()) || Number.isNaN(resolvedAt.getTime())) return null;
    const h = (resolvedAt.getTime() - createdAt.getTime()) / 3600000;
    return h >= 0 ? h : null;
  }

  function slaTargetHoursForTicket(t) {
    if (typeof getSlaTargetHoursForDate === "function") {
      return Number(getSlaTargetHoursForDate(t?.createdAt || t?.eventDate || new Date())) || 4;
    }
    return 4;
  }

  function calcKpis(events) {
    const opened = events.length;
    const resolvedRows = events.filter((t) => String(t.status || "").toLowerCase() === "resolved");
    const resolved = resolvedRows.length;
    const withDur = resolvedRows
      .map((t) => ({ t, hours: resolutionHoursForTicket(t), target: slaTargetHoursForTicket(t) }))
      .filter((x) => x.hours != null);
    const within = withDur.filter((x) => x.hours <= x.target).length;
    const sla = withDur.length ? Math.round((within / withDur.length) * 100) : 0;
    const critical = events.filter((t) => String(t.priority || "").toLowerCase() === "critical").length;
    const avgRes = withDur.length ? +(withDur.reduce((a, b) => a + b.hours, 0) / withDur.length).toFixed(1) : 0;
    const csatRaw = 4.2 + (sla >= 90 ? 0.6 : sla >= 80 ? 0.3 : 0) - (critical > 10 ? 0.2 : 0);
    const csat = +Math.max(3.8, Math.min(5, csatRaw)).toFixed(1);
    return { opened, resolved, sla, avgRes, csat, critical };
  }

  function delta(curr, prev, mode = "pct") {
    if (mode === "hours") {
      const d = +(curr - prev).toFixed(1);
      return d === 0 ? "—" : `${d > 0 ? "+" : ""}${d}h`;
    }
    if (!prev) return "—";
    const p = Math.round(((curr - prev) / prev) * 100);
    return `${p > 0 ? "+" : ""}${p}%`;
  }

  function buildPeriodModel(key, allEvents) {
    const cfg = PERIODS[key];
    const now = new Date();
    now.setHours(23, 59, 59, 999);
    const start = dateDaysAgo(cfg.days - 1);
    const prevStart = dateDaysAgo(cfg.days * 2 - 1);
    const prevEnd = dateDaysAgo(cfg.days);
    prevEnd.setHours(23, 59, 59, 999);

    const curr = allEvents.filter((t) => inRange(t.eventDate, start, now));
    const prev = allEvents.filter((t) => inRange(t.eventDate, prevStart, prevEnd));
    const currKpi = calcKpis(curr);
    const prevKpi = calcKpis(prev);

    const buckets = buildBuckets(cfg.days, cfg.bucket);
    const labels = buckets.map((d) => bucketLabel(d, cfg.bucket));
    const opened = new Array(labels.length).fill(0);
    const resolved = new Array(labels.length).fill(0);
    const fcrValues = new Array(labels.length).fill(0);

    curr.forEach((t) => {
      const idx = labels.indexOf(bucketLabel(t.eventDate, cfg.bucket));
      if (idx < 0) return;
      opened[idx] += 1;
      if (String(t.status || "").toLowerCase() === "resolved") resolved[idx] += 1;
      const h = resolutionHoursForTicket(t);
      const ok = h != null ? h <= slaTargetHoursForTicket(t) : String(t.slaClass || "").toLowerCase() !== "breach";
      fcrValues[idx] += ok ? 1 : 0;
    });
    for (let i = 0; i < labels.length; i++) {
      fcrValues[i] = opened[i] ? Math.round((fcrValues[i] / opened[i]) * 100) : 0;
    }

    const priorityCount = { critical: 0, high: 0, medium: 0, low: 0 };
    curr.forEach((t) => {
      const p = String(t.priority || "").toLowerCase();
      if (priorityCount[p] != null) priorityCount[p] += 1;
    });

    return {
      currEvents: curr,
      labels,
      opened,
      resolved,
      fcrLabels: labels,
      fcrValues,
      slaLabels: labels,
      slaValues: labels.map((_, i) => {
        if (!opened[i]) return 0;
        const good = curr.filter((t) => {
          if (bucketLabel(t.eventDate, cfg.bucket) !== labels[i]) return false;
          const h = resolutionHoursForTicket(t);
          if (h == null) return String(t.slaClass || "").toLowerCase() !== "breach";
          return h <= slaTargetHoursForTicket(t);
        }).length;
        return Math.round((good / opened[i]) * 100);
      }),
      kpis: currKpi,
      deltas: {
        opened: delta(currKpi.opened, prevKpi.opened),
        resolved: delta(currKpi.resolved, prevKpi.resolved),
        sla: delta(currKpi.sla, prevKpi.sla),
        avgRes: delta(currKpi.avgRes, prevKpi.avgRes, "hours"),
        csat: delta(currKpi.csat, prevKpi.csat),
        critical: delta(currKpi.critical, prevKpi.critical),
      },
      deltaDir: {
        opened: currKpi.opened >= prevKpi.opened ? "up" : "down",
        resolved: currKpi.resolved >= prevKpi.resolved ? "up" : "down",
        sla: currKpi.sla >= prevKpi.sla ? "up" : "down",
        avgRes: currKpi.avgRes <= prevKpi.avgRes ? "up" : "down",
        csat: currKpi.csat >= prevKpi.csat ? "up" : "down",
        critical: currKpi.critical <= prevKpi.critical ? "up" : "down",
      },
      priorityValues: [priorityCount.critical, priorityCount.high, priorityCount.medium, priorityCount.low],
    };
  }

  function rebuildReportModel() {
    const events = normalizeTicketEvents();
    const byPeriod = {};
    Object.keys(PERIODS).forEach((k) => (byPeriod[k] = buildPeriodModel(k, events)));

    const byTech = {};
    events.forEach((t) => {
      if (t.assignedUserId == null) return;
      if (String(t.status || "").toLowerCase() !== "resolved") return;
      byTech[t.assignedUserId] = (byTech[t.assignedUserId] || 0) + 1;
    });
    const techEntries = Object.entries(byTech).map(([id, n]) => {
      const u = typeof getUserById === "function" ? getUserById(Number(id)) : null;
      return { name: u?.name || `User ${id}`, value: n };
    }).sort((a, b) => b.value - a.value).slice(0, 5);
    const techData = {
      labels: techEntries.map((x) => x.name),
      values: techEntries.map((x) => x.value),
      colors: ["#3d2b8e", "#0d9f6e", "#c8102e", "#d97706", "#4f6df5"],
    };

    const deptRows = (Array.isArray(DB.departments) ? DB.departments : []).slice(0, 6);
    const resolutionData = {
      labels: deptRows.map((d) => d.name),
      values: deptRows.map((d) => {
        const t = Number(d.tickets || 0);
        return +(2.5 + Math.min(5, t / 5)).toFixed(1);
      }),
      colors: ["#e94d67", "#4f6df5", "#0d9f6e", "#8b5cf6", "#d97706", "#14b8a6"],
    };

    monthlyRows = buildMonthlyRows(events);
    reportModel = { byPeriod, techData, resolutionData };
  }

  function buildMonthlyRows(events) {
    const out = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const y = d.getFullYear();
      const m = d.getMonth();
      const start = new Date(y, m, 1);
      const end = new Date(y, m + 1, 0, 23, 59, 59, 999);
      const rows = events.filter((t) => inRange(t.eventDate, start, end));
      const opened = rows.length;
      const resolved = rows.filter((t) => String(t.status || "").toLowerCase() === "resolved").length;
      const resolvedWithDur = rows
        .filter((t) => String(t.status || "").toLowerCase() === "resolved")
        .map((t) => ({ t, hours: resolutionHoursForTicket(t), target: slaTargetHoursForTicket(t) }))
        .filter((x) => x.hours != null);
      const slaMet = resolvedWithDur.length
        ? Math.round((resolvedWithDur.filter((x) => x.hours <= x.target).length / resolvedWithDur.length) * 100)
        : 0;
      const critical = rows.filter((t) => String(t.priority || "").toLowerCase() === "critical").length;
      const csat = +(4.1 + (slaMet / 100) * 0.8 - (critical > 8 ? 0.2 : 0)).toFixed(1);
      const sla = resolvedWithDur.length
        ? +(resolvedWithDur.reduce((s, x) => s + x.hours, 0) / resolvedWithDur.length).toFixed(1)
        : 0;
      out.push({
        month: d.toLocaleDateString(undefined, { month: "long" }),
        opened,
        resolved,
        sla,
        slaMet,
        critical,
        csat: Math.max(3.8, Math.min(5, csat)),
      });
    }
    return out;
  }

  function destroyAll() {
    Object.values(charts).forEach((c) => c?.destroy());
    Object.keys(charts).forEach((k) => delete charts[k]);
  }

  function chartCanvas(id) {
    const el = document.getElementById(id);
    return el instanceof HTMLCanvasElement ? el : null;
  }

  function renderKpis(period) {
    const p = reportModel.byPeriod[period];
    const k = p.kpis;
    const d = p.deltas;
    const dir = p.deltaDir;
    const items = [
      { label: "Tickets Opened", value: k.opened, delta: d.opened, dir: dir.opened, color: "blue" },
      { label: "Tickets Resolved", value: k.resolved, delta: d.resolved, dir: dir.resolved, color: "green" },
      { label: "SLA Compliance", value: `${k.sla}%`, delta: d.sla, dir: dir.sla, color: "purple" },
      { label: "Avg Resolution", value: `${k.avgRes}h`, delta: d.avgRes, dir: dir.avgRes, color: "yellow" },
      { label: "CSAT Score", value: `★ ${k.csat}`, delta: d.csat, dir: dir.csat, color: "green" },
      { label: "Critical Tickets", value: k.critical, delta: d.critical, dir: dir.critical, color: "red" },
    ];
    const host = document.getElementById("report-kpis");
    if (!host) return;
    host.innerHTML = items
      .map((i) => `<div class="report-kpi report-kpi--${i.color}"><div class="report-kpi-label">${i.label}</div><div class="report-kpi-value">${i.value}</div><div class="report-kpi-delta ${i.dir}">${i.dir === "up" ? "↑" : i.dir === "down" ? "↓" : "—"} ${i.delta} vs prior period</div></div>`)
      .join("");
  }

  function renderInsights(period) {
    const k = reportModel.byPeriod[period].kpis;
    const rate = k.opened ? Math.round((k.resolved / k.opened) * 100) : 0;
    const host = document.getElementById("report-insights");
    if (!host) return;
    host.innerHTML = [
      { type: k.sla >= 90 ? "ok" : "warn", title: k.sla >= 90 ? `SLA target met — ${k.sla}% compliance` : `SLA below target — ${k.sla}%`, body: k.sla >= 90 ? "Team is performing above target." : "Review escalation and workload balancing." },
      { type: rate >= 90 ? "ok" : "alert", title: `${rate}% resolution rate`, body: rate >= 90 ? "Backlog is stable." : `${k.opened - k.resolved} tickets remain unresolved.` },
      { type: k.critical > 10 ? "alert" : "info", title: `${k.critical} critical tickets`, body: k.critical > 10 ? "Critical volume elevated." : "Critical volume acceptable." },
    ]
      .map((i) => `<div class="report-insight-banner report-insight-banner--${i.type}"><div><div class="report-insight-title">${i.title}</div><div class="report-insight-body">${i.body}</div></div></div>`)
      .join("");
  }

  function renderTable() {
    const tbody = document.getElementById("monthly-tbody");
    if (!tbody) return;
    tbody.innerHTML = monthlyRows
      .map((r) => {
        const rate = r.opened ? Math.round((r.resolved / r.opened) * 100) : 0;
        return `<tr><td><strong>${r.month}</strong></td><td>${r.opened}</td><td>${r.resolved}</td><td>${rate}%</td><td>${r.sla}h</td><td><span class="sla-badge ${r.slaMet >= 90 ? "ok" : r.slaMet >= 85 ? "warn" : "breach"}">${r.slaMet}%</span></td><td><span class="priority-badge critical">${r.critical}</span></td><td>${r.csat}</td><td><span class="trend-pill flat">—</span></td></tr>`;
      })
      .join("");
  }

  function renderTechnicianSlaRanking(period) {
    const body = document.getElementById("sla-tech-ranking-body");
    if (!body) return;
    const rows = reportModel?.byPeriod?.[period]?.currEvents || [];
    const resolved = rows.filter((t) => String(t.status || "").toLowerCase() === "resolved");
    const byTech = {};
    resolved.forEach((t) => {
      if (t.assignedUserId == null) return;
      const key = Number(t.assignedUserId);
      const h = resolutionHoursForTicket(t);
      if (h == null) return;
      const target = slaTargetHoursForTicket(t);
      if (!byTech[key]) {
        const u = typeof getUserById === "function" ? getUserById(key) : null;
        byTech[key] = {
          name: u?.name || `User ${key}`,
          resolved: 0,
          met: 0,
          totalHours: 0,
        };
      }
      byTech[key].resolved += 1;
      byTech[key].totalHours += h;
      if (h <= target) byTech[key].met += 1;
    });

    const ranking = Object.values(byTech)
      .map((r) => {
        const slaPct = r.resolved ? Math.round((r.met / r.resolved) * 100) : 0;
        const avgH = r.resolved ? +(r.totalHours / r.resolved).toFixed(1) : 0;
        const score = +(slaPct * 0.7 + Math.max(0, 100 - avgH * 10) * 0.3).toFixed(1);
        return { ...r, slaPct, avgH, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);

    if (!ranking.length) {
      body.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:18px">No resolved tickets with SLA timing in this period.</td></tr>';
      return;
    }

    body.innerHTML = ranking
      .map((r) => `<tr><td><strong>${r.name}</strong></td><td>${r.resolved}</td><td><span class="sla-badge ${r.slaPct >= 90 ? "ok" : r.slaPct >= 80 ? "warn" : "breach"}">${r.slaPct}%</span></td><td>${r.avgH}h</td><td><strong>${r.score}</strong></td></tr>`)
      .join("");
  }

  function buildAllCharts(period) {
    destroyAll();
    const d = cd();
    const p = reportModel.byPeriod[period];
    const resolutionData = reportModel.resolutionData;
    const techData = reportModel.techData;
    const priorityValues = p.priorityValues;

    const mkLine = (id, labels, data, color, fill = "rgba(99,91,255,0.12)") => {
      const el = chartCanvas(id);
      if (!el || typeof Chart === "undefined") return;
      charts[id] = new Chart(el, {
        type: "line",
        data: { labels, datasets: [{ data, borderColor: color, borderWidth: 2.5, tension: 0.35, fill: true, backgroundColor: fill, pointRadius: labels.length > 14 ? 0 : 3, pointHoverRadius: 6 }] },
        options: { responsive: true, maintainAspectRatio: false, animation: chartAnim, plugins: { legend: { display: false }, tooltip: tip(d) }, scales: { x: { grid: { color: d.grid }, ticks: { color: d.text } }, y: { beginAtZero: true, grid: { color: d.grid }, ticks: { color: d.text } } } },
      });
    };
    mkLine("rptVolume", p.labels, p.opened, "#e94d67", "rgba(233,77,103,0.10)");
    mkLine("rptSla", p.slaLabels, p.slaValues, "#3d2b8e", "rgba(61,43,142,0.12)");

    const elR = chartCanvas("rptResolution");
    if (elR && typeof Chart !== "undefined") {
      charts.res = new Chart(elR, {
        type: "bar",
        data: { labels: resolutionData.labels, datasets: [{ data: resolutionData.values, backgroundColor: resolutionData.colors, borderRadius: 8, borderSkipped: false, maxBarThickness: 48 }] },
        options: { responsive: true, maintainAspectRatio: false, animation: chartAnim, plugins: { legend: { display: false }, tooltip: tip(d) }, scales: { x: { grid: { display: false }, ticks: { color: d.text } }, y: { grid: { color: d.grid }, ticks: { color: d.text } } } },
      });
    }

    const elP = chartCanvas("rptPriority");
    if (elP && typeof Chart !== "undefined") {
      const labels = ["Critical", "High", "Medium", "Low"];
      charts.pri = new Chart(elP, {
        type: "doughnut",
        data: { labels, datasets: [{ data: priorityValues, backgroundColor: ["#e94d67", "#d97706", "#eab308", "#0d9f6e"], borderWidth: 2, borderColor: d.tipBg, hoverOffset: 8 }] },
        options: { responsive: true, maintainAspectRatio: false, animation: chartAnim, cutout: "65%", plugins: { legend: { position: "right", labels: { color: d.text } }, tooltip: tip(d) } },
      });
    }

    const elT = chartCanvas("rptTech");
    if (elT && typeof Chart !== "undefined") {
      charts.tech = new Chart(elT, {
        type: "bar",
        data: { labels: techData.labels, datasets: [{ data: techData.values, backgroundColor: techData.colors, borderRadius: 8, borderSkipped: false, maxBarThickness: 44 }] },
        options: { responsive: true, maintainAspectRatio: false, animation: chartAnim, indexAxis: "y", plugins: { legend: { display: false }, tooltip: tip(d) }, scales: { x: { grid: { color: d.grid }, ticks: { color: d.text } }, y: { grid: { display: false }, ticks: { color: d.text } } } },
      });
    }

    const elF = chartCanvas("rptFcr");
    if (elF && typeof Chart !== "undefined") {
      charts.fcr = new Chart(elF, {
        type: "bar",
        data: { labels: p.fcrLabels, datasets: [{ data: p.fcrValues, backgroundColor: p.fcrValues.map((v) => (v >= 88 ? "#0d9f6e" : v >= 84 ? "#d97706" : "#e94d67")), borderRadius: 8, borderSkipped: false, maxBarThickness: 52 }] },
        options: { responsive: true, maintainAspectRatio: false, animation: chartAnim, plugins: { legend: { display: false }, tooltip: tip(d) }, scales: { x: { grid: { display: false }, ticks: { color: d.text } }, y: { min: 0, max: 100, grid: { color: d.grid }, ticks: { color: d.text, callback: (v) => `${v}%` } } } },
      });
    }
  }

  function getTableData() {
    const headers = ["Month", "Opened", "Resolved", "Resolution Rate", "Avg SLA (h)", "SLA Met %", "Critical", "CSAT"];
    const rows = monthlyRows.map((r) => [r.month, r.opened, r.resolved, `${r.opened ? Math.round((r.resolved / r.opened) * 100) : 0}%`, `${r.sla}h`, `${r.slaMet}%`, r.critical, r.csat]);
    return { headers, rows };
  }

  function toCSV(rows, headers) {
    const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
    return [headers.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))].join("\n");
  }

  function downloadFile(content, filename, mime) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([content], { type: mime }));
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function hydrateFromApi() {
    if (typeof ApiClient === "undefined") return;
    const localTickets = safeTickets().slice();
    const remote = await ApiClient.getAppData();
    if (!remote || typeof remote !== "object") return;
    if ((!Array.isArray(remote.tickets) || remote.tickets.length === 0) && localTickets.length > 0) {
      await ApiClient.bootstrap({ tickets: localTickets });
      const after = await ApiClient.getAppData();
      if (after && Array.isArray(after.tickets)) DB.tickets = after.tickets;
      return;
    }
    if (Array.isArray(remote.tickets)) DB.tickets = remote.tickets;
  }

  document.querySelectorAll(".chip[data-period]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".chip[data-period]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      currentPeriod = btn.dataset.period;
      renderKpis(currentPeriod);
      renderInsights(currentPeriod);
      renderTechnicianSlaRanking(currentPeriod);
      buildAllCharts(currentPeriod);
    });
  });

  document.getElementById("btn-export-csv")?.addEventListener("click", () => {
    const { headers, rows } = getTableData();
    downloadFile(toCSV(rows, headers), "diatech-report.csv", "text/csv;charset=utf-8");
  });
  document.getElementById("btn-export-table-csv")?.addEventListener("click", () => {
    const { headers, rows } = getTableData();
    downloadFile(toCSV(rows, headers), "diatech-monthly-summary.csv", "text/csv;charset=utf-8");
  });
  document.getElementById("btn-export-xlsx")?.addEventListener("click", () => {
    if (typeof XLSX === "undefined") return;
    const { headers, rows } = getTableData();
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Monthly Summary");
    XLSX.writeFile(wb, "diatech-report.xlsx");
  });
  document.getElementById("btn-export-pdf")?.addEventListener("click", () => {
    if (typeof window.jspdf === "undefined") return;
    const { jsPDF } = window.jspdf;
    const { headers, rows } = getTableData();
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    doc.setFontSize(12);
    doc.text("DiaTech - IT Report", 14, 14);
    doc.setFontSize(9);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 20);
    doc.autoTable({
      startY: 26,
      head: [headers],
      body: rows,
      theme: "striped",
      headStyles: { fillColor: [61, 43, 142], textColor: 255 },
      styles: { fontSize: 8 },
    });
    doc.save(`diatech-report-${new Date().toISOString().slice(0, 10)}.pdf`);
  });

  function renderAll() {
    rebuildReportModel();
    renderKpis(currentPeriod);
    renderInsights(currentPeriod);
    renderTechnicianSlaRanking(currentPeriod);
    buildAllCharts(currentPeriod);
    renderTable();
  }

  renderAll();
  void hydrateFromApi().then(() => {
    renderAll();
  });
  if (typeof Auth !== "undefined" && Auth.enhanceUI) Auth.enhanceUI();
})();
