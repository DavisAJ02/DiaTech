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

### 1b) Auth + RBAC (optionnel, bonnes pratiques)
- Activer **Authentication** (email/mot de passe ou fournisseur SSO) dans Supabase.
- Exécuter `supabase/schema_profiles_rbac.sql` : table **`public.profiles`** (`id` → `auth.users`, colonne **`role`**: `admin` | `agent` | `user`), **RLS** (lecture du propre profil), trigger **`handle_new_user`** pour créer une ligne à l’inscription.
- Côté navigateur : copier `env-public.example.js` vers `env-public.js` et renseigner **`supabaseUrl`** + **`supabaseAnonKey`** (clé **anon** uniquement ; jamais la service role dans le front).
- Le formulaire de connexion tente d’abord Supabase si la config est présente (identifiant = **email** ou `utilisateur@cmd.local`), sinon les comptes **démo** habituels.
- Rôle global : `window.currentUserRole` après login ; repli **`user`** si profil absent ou invalide.

### 1c) RLS sur tickets / devices / inventory / alertes (optionnel, avancé)
- Exécuter **`supabase/schema_rls_entities.sql`** après `schema_profiles_rbac.sql`.
- Exécuter **`supabase/rpc_diatech_auth_email.sql`** (RPC réservée **service_role** : résolution email → `auth.users.id` pour l’assignation côté API).
- Crée les tables **`dia_tickets`**, **`dia_devices`**, **`dia_inventory`**, **`dia_alert_rules`** avec politiques basées sur **`public.profiles.role`** et **`auth.uid()`**.
- Active aussi **RLS sur `app_state`** sans politique `authenticated` : pas d’accès direct au JSON avec le JWT utilisateur ; l’API **service role** continue de gérer `app_state` pour le reste des données.

### 1d) Tickets protégés par RLS (flux implémenté dans le repo)
1. **Migration des données** (une fois) : exécuter **`supabase/run_rls_tickets_pipeline.sql`** dans le SQL Editor (RPC + copie `app_state.tickets` → **`dia_tickets`**). Équivalent : **`rpc_diatech_auth_email.sql`** puis **`migrate_app_state_tickets_to_dia_tickets.sql`**.
2. **Variables Vercel / `.env` pour l’API** : en plus de `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY`, définir **`SUPABASE_ANON_KEY`** (clé **anon** JWT `eyJ…`, la même logique que le front — pas la service role).
3. **Page Tickets** : si Supabase est configuré dans `env-public.js` **et** qu’une session existe (`Authorization` Bearer), l’app appelle **`GET/POST /api/tickets-rls`** (proxy JWT) au lieu de `/api/tickets` (service role / `app_state`). Désactiver : `window.__DIATECH_TICKETS_RLS = false`.
4. **Assignation admin** : l’API résout l’email de l’agent (`data.js` → `DB.users[].email`) vers **Auth** via **`diatech_auth_id_by_email`**. Les comptes **Authentication** des agents doivent avoir **le même email** (dans le dépôt, les démo utilisent **`@cmd.local`**, ex. `papy.matala@cmd.local`).
5. **Dashboard / stats** : le compteur tickets du **`/api/dashboard/stats`** lit encore **`app_state`**. Pour recopier `dia_tickets` → `app_state.tickets` après chaque changement (service role), définir **`TICKETS_DUAL_WRITE_APP_STATE=1`** sur Vercel.

### 2) Set Vercel environment variables
In your Vercel project, add:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY` (JWT anon — requis pour **`/api/tickets-rls`** et RLS tickets)
- (optional) `SUPABASE_APP_STATE_TABLE=app_state`

### 3) Deploy from GitHub
- Import repo in Vercel
- Framework preset: **Other**
- Build command: *(empty)*
- Output directory: *(empty / root static files)*

The frontend pages are static and call `/api/*` on the same domain.

### 4) First data sync
On first load, the app can call `/api/bootstrap` using existing local data (already implemented in frontend modules). This seeds Supabase if empty.

