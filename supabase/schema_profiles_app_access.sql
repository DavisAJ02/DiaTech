-- DiaTech — Étend public.profiles pour l’administration des comptes (UI Paramètres).
-- Exécuter après schema_profiles_rbac.sql (ou setup_ordered.sql).
-- Idempotent.

alter table public.profiles add column if not exists active boolean not null default true;
alter table public.profiles add column if not exists display_name text;
alter table public.profiles add column if not exists app_access jsonb not null default '{}'::jsonb;

comment on column public.profiles.active is 'false = compte désactivé (hydratation refusera la session).';
comment on column public.profiles.display_name is 'Nom affiché dans l’app (optionnel).';
comment on column public.profiles.app_access is 'JSON: restrictions, allowedPages, allowedDepartmentNames (null = pas de restriction).';
