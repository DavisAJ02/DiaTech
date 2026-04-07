-- DiaTech — RLS sur entités métier (tickets, devices, inventory, alert rules)
-- À exécuter après schema.sql + schema_profiles_rbac.sql.
--
-- IMPORTANT (architecture actuelle du repo) :
-- - L’API Vercel (`api/index.js`) lit/écrit `app_state` avec la SERVICE ROLE : la RLS
--   ne s’applique PAS à ces appels (bypass service_role).
-- - Pour que cette RLS soit effective, le client doit utiliser le JWT utilisateur
--   (createClient(url, anonKey, { global: { headers: { Authorization: Bearer … } } })
--   ou auth.getSession()) vers ces tables, ou l’API doit proxy avec le JWT au lieu
--   de la service role sur ces routes.
--
-- Référence rôle admin : public.profiles (pas de table public.users).

-- ── Tickets ───────────────────────────────────────────────────────────────

create table if not exists public.dia_tickets (
  id bigint primary key,
  payload jsonb not null default '{}'::jsonb,
  created_by uuid not null references auth.users (id) on delete cascade,
  assigned_to uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

create index if not exists dia_tickets_created_by_idx on public.dia_tickets (created_by);
create index if not exists dia_tickets_assigned_to_idx on public.dia_tickets (assigned_to);

alter table public.dia_tickets enable row level security;

drop policy if exists dia_tickets_select_own on public.dia_tickets;
create policy dia_tickets_select_own
  on public.dia_tickets
  for select
  using (auth.uid() = created_by);

drop policy if exists dia_tickets_select_assigned on public.dia_tickets;
create policy dia_tickets_select_assigned
  on public.dia_tickets
  for select
  using (auth.uid() = assigned_to);

-- Agents : voir tous les tickets (filtrage départements côté API /api/tickets-rls si besoin).
drop policy if exists dia_tickets_select_agent on public.dia_tickets;
create policy dia_tickets_select_agent
  on public.dia_tickets
  for select
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'agent'
    )
  );

drop policy if exists dia_tickets_admin_all on public.dia_tickets;
create policy dia_tickets_admin_all
  on public.dia_tickets
  for all
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'
    )
  );

drop policy if exists dia_tickets_insert_authenticated on public.dia_tickets;
create policy dia_tickets_insert_authenticated
  on public.dia_tickets
  for insert
  with check (auth.uid() = created_by);

drop policy if exists dia_tickets_update_participants on public.dia_tickets;
create policy dia_tickets_update_participants
  on public.dia_tickets
  for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
    or created_by = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'agent'
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
    or created_by = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'agent'
    )
  );

-- Suppression : couverte par dia_tickets_admin_all (FOR ALL).

create or replace function public.dia_tickets_prevent_created_by_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Admin : aucune limite sur assigned_to / payload (created_by : garder cohérent avec les besoins métier).
  if exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin') then
    return new;
  end if;
  -- Agent (technicien) : peut modifier assigned_to et le payload ; pas created_by.
  if exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'agent') then
    if new.created_by is distinct from old.created_by then
      raise exception 'dia_tickets: created_by ne peut être modifié que par un admin';
    end if;
    return new;
  end if;
  -- Demandeur (user) et autres : pas de changement de created_by ni assigned_to.
  if new.created_by is distinct from old.created_by then
    raise exception 'dia_tickets: created_by ne peut être modifié que par un admin';
  end if;
  if new.assigned_to is distinct from old.assigned_to then
    raise exception 'dia_tickets: seul un admin ou un agent peut modifier assigned_to';
  end if;
  return new;
end;
$$;

drop trigger if exists dia_tickets_created_by_guard on public.dia_tickets;
create trigger dia_tickets_created_by_guard
before update on public.dia_tickets
for each row execute function public.dia_tickets_prevent_created_by_change();

-- ── Devices (lecture pour tout profil authentifié ; écriture staff) ──────────

create table if not exists public.dia_devices (
  id text primary key,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.dia_devices enable row level security;

drop policy if exists dia_devices_select_authed on public.dia_devices;
create policy dia_devices_select_authed
  on public.dia_devices
  for select
  using (
    auth.uid() is not null
    and exists (select 1 from public.profiles p where p.id = auth.uid())
  );

drop policy if exists dia_devices_write_staff on public.dia_devices;
create policy dia_devices_write_staff
  on public.dia_devices
  for all
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'agent')
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'agent')
    )
  );

-- ── Inventory (aligné UI : admin + agent seulement) ─────────────────────────

create table if not exists public.dia_inventory (
  id text primary key,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.dia_inventory enable row level security;

drop policy if exists dia_inventory_select_staff on public.dia_inventory;
create policy dia_inventory_select_staff
  on public.dia_inventory
  for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'agent')
    )
  );

drop policy if exists dia_inventory_write_staff on public.dia_inventory;
create policy dia_inventory_write_staff
  on public.dia_inventory
  for all
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'agent')
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'agent')
    )
  );

-- ── Alert rules (équivalent alertRules JSON dans app_state) ────────────────

create table if not exists public.dia_alert_rules (
  id text primary key default 'default',
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.dia_alert_rules (id, value) values ('default', '{}'::jsonb)
on conflict (id) do nothing;

alter table public.dia_alert_rules enable row level security;

drop policy if exists dia_alert_rules_select_authed on public.dia_alert_rules;
create policy dia_alert_rules_select_authed
  on public.dia_alert_rules
  for select
  using (
    auth.uid() is not null
    and exists (select 1 from public.profiles p where p.id = auth.uid())
  );

drop policy if exists dia_alert_rules_write_admin on public.dia_alert_rules;
create policy dia_alert_rules_write_admin
  on public.dia_alert_rules
  for all
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- ── Grants (JWT utilisateur = rôle authenticated) ───────────────────────────

grant usage on schema public to authenticated;

grant select, insert, update, delete on public.dia_tickets to authenticated;
grant select, insert, update, delete on public.dia_devices to authenticated;
grant select, insert, update, delete on public.dia_inventory to authenticated;
grant select, insert, update, delete on public.dia_alert_rules to authenticated;

comment on table public.dia_tickets is 'Tickets avec RLS : admin tout ; agent voit/met à jour la file (assignation) ; créateur user ; filtre départements côté API si besoin.';
comment on table public.dia_devices is 'Parc devices ; lecture tout profil, écriture admin/agent.';
comment on table public.dia_inventory is 'Inventaire ; accès admin/agent uniquement.';
comment on table public.dia_alert_rules is 'Règles d''alertes ; lecture authentifié, écriture admin.';

-- ── app_state : aucune politique pour authenticated → pas d’accès direct avec JWT utilisateur.
--    L’API (service_role) continue de lire/écrire tout le JSON agrégé.

alter table public.app_state enable row level security;

-- ── RPC : départements distincts sur les tickets (API admin, évite de charger tous les payload) ──

create or replace function public.diatech_distinct_ticket_departments()
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select array_agg(x.name order by x.name)
      from (
        select distinct trim(both from t.payload->>'department') as name
        from public.dia_tickets t
        where t.payload is not null
          and nullif(trim(t.payload->>'department'), '') is not null
      ) x
    ),
    '{}'::text[]
  );
$$;

revoke all on function public.diatech_distinct_ticket_departments() from public;
grant execute on function public.diatech_distinct_ticket_departments() to service_role;

comment on function public.diatech_distinct_ticket_departments() is
  'API service_role : text[] trié des payload.department distincts (non vides), pour périmètre demandeurs.';
