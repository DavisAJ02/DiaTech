-- DiaTech — Profils utilisateur + RBAC (Supabase Auth)
-- Exécuter dans le SQL Editor après activation de Authentication.
-- Bonne pratique : table public.profiles liée à auth.users (pas de colonne role sur auth.users).

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

-- Ligne profil à chaque inscription (rôle par défaut : user)
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

-- Lecture de son propre profil (JWT + clé anon)
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own
  on public.profiles
  for select
  using (auth.uid() = id);

-- Pas de policy UPDATE côté client : évite qu’un utilisateur s’élève en admin.
-- Changer un rôle : Table Editor (service role) ou Edge Function / API backend.

drop policy if exists profiles_update_own on public.profiles;

comment on table public.profiles is 'Profil app : rôle RBAC (admin | agent | user), lié à auth.users';

-- ── Comptes Auth créés avant ce script : créer les lignes profiles manquantes
-- insert into public.profiles (id, role)
-- select id, 'user' from auth.users
-- where id not in (select id from public.profiles)
-- on conflict (id) do nothing;
