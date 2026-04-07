-- DiaTech — Journal d’audit des actions admin (comptes, rôles, accès).
-- Inséré uniquement par l’API Vercel (service_role). Pas de lecture côté client direct.
-- Exécuter après schema_profiles_rbac.sql.

create table if not exists public.dia_admin_audit (
  id bigserial primary key,
  actor_id uuid not null references auth.users (id),
  action text not null,
  target_id uuid,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists dia_admin_audit_created_at_idx on public.dia_admin_audit (created_at desc);
create index if not exists dia_admin_audit_actor_idx on public.dia_admin_audit (actor_id);

alter table public.dia_admin_audit enable row level security;

-- Aucune policy : anon/authenticated n’accèdent pas ; service_role bypass.

comment on table public.dia_admin_audit is 'Audit admin API (CRUD utilisateurs, invitations).';
