# NexusOps – IT Management Platform

A full-featured IT management dashboard inspired by Atera, built with vanilla HTML/CSS/JS. Ready to open in Cursor and extend.

## 🗂 File Structure

```
it-dashboard/
├── index.html        ← Main dashboard (all KPIs, charts, ticket tables)
├── tickets.html      ← Full ticket management with filters + New Ticket modal
├── devices.html      ← Device inventory + Install Agent workflow
├── alerts.html       ← Alert feed with acknowledge actions
├── customers.html    ← Customer cards with stats + Add Customer
├── reports.html      ← Charts and monthly summary table
├── settings.html     ← Profile, Notifications, Integrations, Security
├── styles.css        ← Full design system (light + dark mode)
├── data.js           ← Shared data store (tickets, customers, devices)
└── dashboard.js      ← Dashboard charts, counters, interactivity
```

## 🚀 Getting Started in Cursor

1. Open the `it-dashboard/` folder in Cursor
2. Open `index.html` and use **Live Server** (or any static server) to preview
3. All navigation links between pages work out of the box

## ✨ Features

- **Dark / Light mode** toggle (persisted via localStorage)
- **Animated KPI counters** on page load
- **Interactive charts** via Chart.js (bar, donut, line)
- **Ticket filtering** by priority, SLA status, tab (all/open/critical/unassigned)
- **New Ticket modal** (adds to the live table)
- **Add Customer modal**
- **Acknowledge alerts** button
- **Assign tickets** button
- **Device cards** with online/offline status
- **Settings** with tabbed nav and toggles
- Fully **responsive** down to mobile

## 🛠 Extending with Cursor

### Connect a real backend
Replace the `DB` object in `data.js` with `fetch()` calls to your API:
```js
const response = await fetch('/api/tickets');
DB.tickets = await response.json();
```

### Add a new page
1. Copy any existing page as a template
2. Change the active nav item class
3. Add your content in the `<main>` section

### Change the brand color
Edit `--accent` in `styles.css`:
```css
:root {
  --accent: #f43f5e; /* change to your color */
}
```

### Add real-time updates
```js
// In dashboard.js, add a polling interval:
setInterval(async () => {
  const data = await fetch('/api/kpis').then(r => r.json());
  document.querySelector('[data-target]').textContent = data.openTickets;
}, 30000);
```

## 📦 Dependencies (CDN, no install needed)
- [Chart.js 4.4](https://www.chartjs.org/) — charts
- [Google Fonts: Syne + DM Sans](https://fonts.google.com/) — typography

No npm, no build step. Just open and go.

## ☁️ Production Deploy (Vercel + Supabase)

This repository now includes:
- `api/index.js` (serverless API for `/api/*`)
- `vercel.json` (API routing)
- `supabase/schema.sql` (required SQL table)

### 1) Create Supabase storage table
Run `supabase/schema.sql` in your Supabase SQL Editor.

### 2) Set Vercel environment variables
In your Vercel project, add:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- (optional) `SUPABASE_APP_STATE_TABLE=app_state`

### 3) Deploy from GitHub
- Import repo in Vercel
- Framework preset: **Other**
- Build command: *(empty)*
- Output directory: *(empty / root static files)*

The frontend pages are static and call `/api/*` on the same domain.

### 4) First data sync
On first load, the app can call `/api/bootstrap` using existing local data (already implemented in frontend modules). This seeds Supabase if empty.

