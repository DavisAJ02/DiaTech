-- DiaTech — exécution unique dans Supabase SQL Editor (ordre : schema → RBAC → backfill)
-- Coller tout ce fichier et cliquer Run. Idempotent sur re-exécution partielle.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) schema.sql — app_state
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.app_state (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists app_state_set_updated_at on public.app_state;
create trigger app_state_set_updated_at
before update on public.app_state
for each row execute procedure public.set_updated_at();

insert into public.app_state(key, value) values
  ('inventory', '[]'::jsonb),
  ('consumables', '[]'::jsonb),
  ('consumableLogs', '[]'::jsonb),
  ('tickets', '[]'::jsonb),
  ('departments', '[]'::jsonb),
  ('devices', '[]'::jsonb),
  ('expenses', '[]'::jsonb),
  ('expenseMonthlyBudget', '0'::jsonb),
  ('alertRules', '{}'::jsonb),
  ('slaPolicies', '[]'::jsonb)
on conflict (key) do nothing;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) schema_profiles_rbac.sql — profiles + RLS + trigger inscription
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'user'
    check (role in ('admin', 'agent', 'user')),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_id_idx on public.profiles (id);

create or replace function public.set_profiles_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute procedure public.set_profiles_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role)
  values (new.id, 'user')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own
  on public.profiles
  for select
  using (auth.uid() = id);

drop policy if exists profiles_update_own on public.profiles;

comment on table public.profiles is 'Profil app : rôle RBAC (admin | agent | user), lié à auth.users';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3) schema_profiles_backfill.sql — profils pour auth.users déjà existants
-- ═══════════════════════════════════════════════════════════════════════════

insert into public.profiles (id, role)
select au.id, 'user'
from auth.users au
where not exists (select 1 from public.profiles p where p.id = au.id);
