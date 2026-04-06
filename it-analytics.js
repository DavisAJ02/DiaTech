/**
 * DiaTech – IT Analytics (Inventory + Budget charts, KPIs, insights)
 */
(function () {
  const html = document.documentElement;
  const money = new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  const moneyFull = new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 });

  const PALETTE = ["#635bff", "#e94d67", "#0d9f6e", "#4f6df5", "#d97706", "#7c6cf0", "#06b6d4", "#ec4899"];

  const LIFECYCLE_LABELS = {
    purchase: "Purchase",
    assignment: "Assignment",
    maintenance: "Maintenance",
    retirement: "Retirement",
  };

  let chartInstances = {};

  async function hydrateFromApi() {
    if (typeof ApiClient === "undefined") return;
    const localSnapshot = {
      inventory: Array.isArray(DB.inventory) ? DB.inventory.slice() : [],
      expenses: Array.isArray(DB.expenses) ? DB.expenses.slice() : [],
      expenseMonthlyBudget: Number(DB.expenseMonthlyBudget) || 0,
    };
    const remote = await ApiClient.getAppData();
    if (!remote || typeof remote !== "object") return;
    const remoteEmpty =
      (!Array.isArray(remote.inventory) || remote.inventory.length === 0) &&
      (!Array.isArray(remote.expenses) || remote.expenses.length === 0);
    if (remoteEmpty && (localSnapshot.inventory.length > 0 || localSnapshot.expenses.length > 0)) {
      await ApiClient.bootstrap(localSnapshot);
      const after = await ApiClient.getAppData();
      if (after && typeof after === "object") {
        if (Array.isArray(after.inventory)) DB.inventory = after.inventory;
        if (Array.isArray(after.expenses)) DB.expenses = after.expenses;
        if (after.expenseMonthlyBudget != null) DB.expenseMonthlyBudget = Number(after.expenseMonthlyBudget) || 0;
      }
      return;
    }
    if (Array.isArray(remote.inventory)) DB.inventory = remote.inventory;
    if (Array.isArray(remote.expenses)) DB.expenses = remote.expenses;
    if (remote.expenseMonthlyBudget != null) DB.expenseMonthlyBudget = Number(remote.expenseMonthlyBudget) || 0;
  }

  function chartDefaults() {
    const isDark = html.dataset.theme === "dark";
    return {
      gridColor: isDark ? "rgba(255,255,255,.08)" : "rgba(15,23,42,.06)",
      textColor: isDark ? "#9aa3b5" : "#697386",
      textStrong: isDark ? "#f0f2f7" : "#0c111d",
      tooltipBg: isDark ? "#1a1e28" : "#ffffff",
      tooltipText: isDark ? "#f0f2f7" : "#0c111d",
      tooltipBorder: isDark ? "rgba(255,255,255,.08)" : "rgba(15,23,42,.08)",
    };
  }

  function tooltipOpts(d) {
    return {
      enabled: true,
      backgroundColor: d.tooltipBg,
      titleColor: d.tooltipText,
      bodyColor: d.tooltipText,
      borderColor: d.tooltipBorder,
      borderWidth: 1,
      padding: 12,
      cornerRadius: 10,
      titleFont: { family: "Mona Sans", size: 12, weight: "600" },
      bodyFont: { family: "DM Sans", size: 12 },
      displayColors: true,
      boxPadding: 6,
      usePointStyle: true,
    };
  }

  const chartAnim = { duration: 850, easing: "easeOutQuart" };

  function getLifecycle(a) {
    if (a.lifecycle) return a.lifecycle;
    const m = { "in-stock": "purchase", "in-use": "assignment", maintenance: "maintenance", retired: "retirement" };
    return m[a.status] || "purchase";
  }

  function getUserById(id) {
    if (typeof window.getUserById === "function") return window.getUserById(id);
    return (DB.users || []).find((u) => u.id === id) || null;
  }

  function monthKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  }

  /** Last `n` calendar months ending current month, oldest first */
  function rollingMonthKeys(n) {
    const out = [];
    const now = new Date();
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      out.push(monthKey(d));
    }
    return out;
  }

  function labelMonth(ym) {
    const [y, m] = ym.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "short", year: "2-digit" });
  }

  function destroyAll() {
    Object.values(chartInstances).forEach((c) => {
      try {
        c.destroy();
      } catch (_) {}
    });
    chartInstances = {};
  }

  function sumExpensesInMonth(ymPrefix) {
    return (DB.expenses || []).reduce((s, e) => {
      if (e.date && String(e.date).startsWith(ymPrefix)) return s + (Number(e.amount) || 0);
      return s;
    }, 0);
  }

  function buildKpis() {
    const inv = DB.inventory || [];
    const totalVal = inv.reduce((s, a) => s + (Number(a.cost) || 0), 0);
    document.getElementById("kpi-total-assets").textContent = money.format(totalVal);

    const now = new Date();
    const curM = monthKey(now);
    const monthSpend = sumExpensesInMonth(curM);
    document.getElementById("kpi-month-spend").textContent = moneyFull.format(monthSpend);

    const assigned = inv.filter((a) => a.assignedUserId != null);
    const byUser = {};
    assigned.forEach((a) => {
      const id = a.assignedUserId;
      byUser[id] = (byUser[id] || 0) + (Number(a.cost) || 0);
    });
    const nPeople = Object.keys(byUser).length;
    const assignedValue = assigned.reduce((s, a) => s + (Number(a.cost) || 0), 0);
    const cpe = nPeople > 0 ? assignedValue / nPeople : null;
    document.getElementById("kpi-cost-per-employee").textContent = cpe != null ? money.format(cpe) : "—";
    document.getElementById("kpi-cost-per-note").textContent =
      nPeople > 0
        ? `${nPeople} team member(s) hold assigned assets · ${money.format(assignedValue)} assigned value.`
        : "No assigned assets — deploy hardware to see cost per assignee.";

    const top = [...inv].sort((a, b) => (Number(b.cost) || 0) - (Number(a.cost) || 0)).slice(0, 3);
    const ul = document.getElementById("kpi-top-assets");
    ul.innerHTML = top.length
      ? top
          .map(
            (a) =>
              `<li><span>${escapeHtml(a.name)}</span><strong>${money.format(Number(a.cost) || 0)}</strong></li>`
          )
          .join("")
      : '<li style="color:var(--text-muted)">No assets</li>';
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function buildInsights() {
    const now = new Date();
    const curM = monthKey(now);
    const prevD = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevM = monthKey(prevD);
    const curSpend = sumExpensesInMonth(curM);
    const prevSpend = sumExpensesInMonth(prevM);
    let spendHtml = "";
    if (prevSpend <= 0 && curSpend <= 0) {
      spendHtml =
        "<p>No expense history in the last two months — add lines in <strong>Budget</strong> to trend IT spend.</p>";
    } else if (prevSpend <= 0) {
      spendHtml = `<p><strong>IT spending</strong> is building this month (${moneyFull.format(curSpend)} recorded) — no prior month to compare.</p>`;
    } else {
      const pct = Math.round(((curSpend - prevSpend) / prevSpend) * 100);
      const dir = pct >= 0 ? "increased" : "decreased";
      const absPct = Math.abs(pct);
      spendHtml = `<p><strong>IT spending ${dir} by ${absPct}%</strong> vs last month (${moneyFull.format(prevSpend)} → ${moneyFull.format(curSpend)}).</p>`;
    }

    const inv = DB.inventory || [];
    const counts = {};
    inv.forEach((a) => {
      if (a.assignedUserId == null) return;
      counts[a.assignedUserId] = (counts[a.assignedUserId] || 0) + 1;
    });
    const valueFor = (uid) =>
      inv.filter((a) => a.assignedUserId === Number(uid)).reduce((s, a) => s + (Number(a.cost) || 0), 0);
    const entries = Object.entries(counts).sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return valueFor(b[0]) - valueFor(a[0]);
    });
    let peopleHtml = "";
    if (entries.length === 0) {
      peopleHtml = "<p>No assets are currently assigned — lifecycle assignment stage will grow as you deploy kit.</p>";
    } else {
      const [uid, n] = entries[0];
      const u = getUserById(Number(uid));
      const name = u ? u.name : "Team member";
      peopleHtml = `<p><strong>Most assets assigned to ${escapeHtml(name)}</strong> (${n} unit${n > 1 ? "s" : ""}).</p>`;
    }

    const totalVal = inv.reduce((s, a) => s + (Number(a.cost) || 0), 0);
    const unassigned = inv.filter((a) => a.assignedUserId == null);
    const unVal = unassigned.reduce((s, a) => s + (Number(a.cost) || 0), 0);
    const pctUn = totalVal > 0 ? Math.round((unVal / totalVal) * 100) : 0;
    const valueHtml = `<p><strong>${pctUn}% of inventory value</strong> is not yet assigned to a user — opportunity to balance deployment.</p>`;

    document.getElementById("ia-insights").innerHTML = `
      <div class="ia-insight ia-insight--up"><div class="ia-insight-tag">Spend trend</div>${spendHtml}</div>
      <div class="ia-insight ia-insight--people"><div class="ia-insight-tag">Assignments</div>${peopleHtml}</div>
      <div class="ia-insight ia-insight--value"><div class="ia-insight-tag">Coverage</div>${valueHtml}</div>
    `;
  }

  function buildInvCategoryPie(d) {
    const ctx = document.getElementById("chart-inv-category")?.getContext("2d");
    if (!ctx) return;
    const inv = DB.inventory || [];
    const map = {};
    inv.forEach((a) => {
      const c = a.category || "Other";
      map[c] = (map[c] || 0) + 1;
    });
    const labels = Object.keys(map);
    const data = labels.map((k) => map[k]);
    chartInstances.cat = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels,
        datasets: [
          {
            data,
            backgroundColor: labels.map((_, i) => PALETTE[i % PALETTE.length]),
            borderWidth: 2,
            borderColor: d.tooltipBg,
            hoverOffset: 8,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: chartAnim,
        cutout: "62%",
        plugins: {
          legend: {
            position: "bottom",
            labels: {
              color: d.textColor,
              font: { family: "DM Sans", size: 11 },
              padding: 14,
              usePointStyle: true,
            },
          },
          tooltip: {
            ...tooltipOpts(d),
            callbacks: {
              label: (x) => ` ${x.label}: ${x.raw} assets`,
            },
          },
        },
      },
    });
  }

  function buildInvLifecycleBar(d) {
    const ctx = document.getElementById("chart-inv-lifecycle")?.getContext("2d");
    if (!ctx) return;
    const inv = DB.inventory || [];
    const map = { purchase: 0, assignment: 0, maintenance: 0, retirement: 0 };
    inv.forEach((a) => {
      const lc = getLifecycle(a);
      if (map[lc] != null) map[lc]++;
      else map.purchase++;
    });
    const labels = Object.keys(map).map((k) => LIFECYCLE_LABELS[k] || k);
    const data = Object.values(map);
    chartInstances.lc = new Chart(ctx, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            data,
            backgroundColor: ["#635bff", "#0d9f6e", "#d97706", "#8891a4"],
            borderRadius: 10,
            borderSkipped: false,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: chartAnim,
        plugins: {
          legend: { display: false },
          tooltip: { ...tooltipOpts(d) },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: d.textColor, font: { family: "DM Sans", size: 11 } },
          },
          y: {
            beginAtZero: true,
            grid: { color: d.gridColor },
            ticks: { color: d.textColor, font: { family: "DM Sans", size: 11 }, stepSize: 1 },
          },
        },
      },
    });
  }

  function buildInvPerUser(d) {
    const ctx = document.getElementById("chart-inv-per-user")?.getContext("2d");
    if (!ctx) return;
    const inv = DB.inventory || [];
    const map = {};
    inv.forEach((a) => {
      if (a.assignedUserId == null) return;
      map[a.assignedUserId] = (map[a.assignedUserId] || 0) + 1;
    });
    const unassigned = inv.filter((a) => a.assignedUserId == null).length;
    const pairs = Object.entries(map)
      .map(([id, n]) => ({ id: Number(id), n, name: getUserById(Number(id))?.name || `User ${id}` }))
      .sort((a, b) => b.n - a.n);
    if (unassigned > 0) pairs.push({ id: -1, n: unassigned, name: "Unassigned" });
    const labels = pairs.map((p) => p.name);
    const data = pairs.map((p) => p.n);
    chartInstances.users = new Chart(ctx, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "Assets",
            data,
            backgroundColor: pairs.map((_, i) => PALETTE[i % PALETTE.length]),
            borderRadius: 8,
            borderSkipped: false,
          },
        ],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        animation: chartAnim,
        plugins: {
          legend: { display: false },
          tooltip: { ...tooltipOpts(d) },
        },
        scales: {
          x: {
            beginAtZero: true,
            grid: { color: d.gridColor },
            ticks: { color: d.textColor, font: { family: "DM Sans", size: 11 }, stepSize: 1 },
          },
          y: {
            grid: { display: false },
            ticks: { color: d.textColor, font: { family: "DM Sans", size: 11 } },
          },
        },
      },
    });
  }

  function buildFinTrend(d) {
    const ctx = document.getElementById("chart-fin-trend")?.getContext("2d");
    if (!ctx) return;
    const keys = rollingMonthKeys(12);
    const totals = keys.map((ym) => {
      return (DB.expenses || []).reduce((s, e) => {
        if (e.date && String(e.date).startsWith(ym)) return s + (Number(e.amount) || 0);
        return s;
      }, 0);
    });
    const labels = keys.map(labelMonth);
    chartInstances.trend = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Spend",
            data: totals,
            borderColor: "#635bff",
            backgroundColor: "rgba(99,91,255,0.12)",
            fill: true,
            tension: 0.35,
            pointRadius: 3,
            pointHoverRadius: 6,
            pointBackgroundColor: "#635bff",
            pointBorderColor: d.tooltipBg,
            pointBorderWidth: 2,
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: chartAnim,
        interaction: { intersect: false, mode: "index" },
        plugins: {
          legend: { display: false },
          tooltip: {
            ...tooltipOpts(d),
            callbacks: {
              label: (x) => ` ${moneyFull.format(x.raw)}`,
            },
          },
        },
        scales: {
          x: {
            grid: { color: d.gridColor },
            ticks: { color: d.textColor, font: { family: "DM Sans", size: 11 }, maxRotation: 45 },
          },
          y: {
            beginAtZero: true,
            grid: { color: d.gridColor },
            ticks: {
              color: d.textColor,
              font: { family: "DM Sans", size: 11 },
              callback: (v) => money.format(v),
            },
          },
        },
      },
    });
  }

  function buildFinCategoryBar(d) {
    const ctx = document.getElementById("chart-fin-category")?.getContext("2d");
    if (!ctx) return;
    const map = {};
    (DB.expenses || []).forEach((e) => {
      const c = e.category || "Other";
      map[c] = (map[c] || 0) + (Number(e.amount) || 0);
    });
    const labels = Object.keys(map);
    const data = labels.map((k) => map[k]);
    chartInstances.fcat = new Chart(ctx, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            data,
            backgroundColor: labels.map((_, i) => PALETTE[i % PALETTE.length]),
            borderRadius: 10,
            borderSkipped: false,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: chartAnim,
        plugins: {
          legend: { display: false },
          tooltip: {
            ...tooltipOpts(d),
            callbacks: { label: (x) => ` ${moneyFull.format(x.raw)}` },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: d.textColor, font: { family: "DM Sans", size: 11 } },
          },
          y: {
            beginAtZero: true,
            grid: { color: d.gridColor },
            ticks: {
              color: d.textColor,
              font: { family: "DM Sans", size: 11 },
              callback: (v) => money.format(v),
            },
          },
        },
      },
    });
  }

  function buildFinBudget(d) {
    const ctx = document.getElementById("chart-fin-budget")?.getContext("2d");
    if (!ctx) return;
    const cap = Number(DB.expenseMonthlyBudget) || 0;
    const keys = rollingMonthKeys(6);
    const actual = keys.map((ym) => sumExpensesInMonth(ym));
    const labels = keys.map(labelMonth);
    const budgetLine = keys.map(() => cap);
    document.getElementById("budget-cap-label").textContent = money.format(cap) + " cap";

    chartInstances.budget = new Chart(ctx, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            type: "bar",
            label: "Actual spend",
            data: actual,
            backgroundColor: "rgba(99,91,255,0.55)",
            borderRadius: 10,
            borderSkipped: false,
            order: 2,
          },
          {
            type: "line",
            label: "Budget cap",
            data: budgetLine,
            borderColor: "#e94d67",
            borderWidth: 2,
            borderDash: [6, 4],
            pointRadius: 0,
            pointHoverRadius: 4,
            fill: false,
            tension: 0,
            order: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: chartAnim,
        plugins: {
          legend: {
            position: "top",
            align: "end",
            labels: { color: d.textColor, font: { family: "DM Sans", size: 11 }, usePointStyle: true, padding: 16 },
          },
          tooltip: {
            ...tooltipOpts(d),
            callbacks: {
              label: (x) => ` ${x.dataset.label}: ${moneyFull.format(x.raw)}`,
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: d.textColor, font: { family: "DM Sans", size: 11 } },
          },
          y: {
            beginAtZero: true,
            grid: { color: d.gridColor },
            ticks: {
              color: d.textColor,
              font: { family: "DM Sans", size: 11 },
              callback: (v) => money.format(v),
            },
          },
        },
      },
    });
  }

  function renderAll() {
    destroyAll();
    const d = chartDefaults();
    buildKpis();
    buildInsights();
    buildInvCategoryPie(d);
    buildInvLifecycleBar(d);
    buildInvPerUser(d);
    buildFinTrend(d);
    buildFinCategoryBar(d);
    buildFinBudget(d);
  }

  if (localStorage.getItem("theme")) html.dataset.theme = localStorage.getItem("theme");

  document.getElementById("theme-toggle")?.addEventListener("click", () => {
    const isDark = html.dataset.theme === "dark";
    html.dataset.theme = isDark ? "" : "dark";
    localStorage.setItem("theme", isDark ? "" : "dark");
    renderAll();
  });

  renderAll();
  void hydrateFromApi().then(() => {
    renderAll();
  });
  if (typeof Auth !== "undefined" && Auth.enhanceUI) Auth.enhanceUI();
})();

