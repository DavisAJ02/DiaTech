-- Résolution email → auth.users.id (service_role uniquement, pour l’API Vercel).
-- Exécuter après schema_profiles_rbac.sql (auth.users existe).

create or replace function public.diatech_auth_id_by_email(em text)
returns uuid
language sql
stable
security definer
set search_path = public, auth
as $$
  select id
  from auth.users
  where lower(trim(email)) = lower(trim(em))
  limit 1;
$$;

revoke all on function public.diatech_auth_id_by_email(text) from public;
grant execute on function public.diatech_auth_id_by_email(text) to service_role;

comment on function public.diatech_auth_id_by_email(text) is 'API only : UUID Supabase Auth pour un email (assignation tickets).';
