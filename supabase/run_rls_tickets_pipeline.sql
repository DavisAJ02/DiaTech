-- ═══════════════════════════════════════════════════════════════════════════
-- Pipeline tickets RLS — coller TOUT ce fichier dans Supabase SQL Editor → Run
-- Prérequis : schema_rls_entities.sql déjà exécuté (tables dia_tickets, RLS).
-- RPC liste des départements (tickets) : inclus dans schema_rls_entities.sql ; sinon exécuter
--   supabase/rpc_dia_ticket_department_names.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1) RPC email → auth.users.id (service_role uniquement) ─────────────────

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

-- ── 2) app_state.tickets → dia_tickets ─────────────────────────────────────

with
  admin_uid as (
    select p.id as uid
    from public.profiles p
    where p.role = 'admin'
    order by p.updated_at desc nulls last
    limit 1
  ),
  fallback_uid as (
    select p.id as uid
    from public.profiles p
    order by p.updated_at desc nulls last
    limit 1
  ),
  creator as (
    select coalesce((select uid from admin_uid), (select uid from fallback_uid)) as uid
  ),
  raw as (
    select value
    from public.app_state
    where key = 'tickets'
    limit 1
  ),
  elems as (
    select jsonb_array_elements(coalesce(r.value, '[]'::jsonb)) as elem
    from raw r
  )
insert into public.dia_tickets (id, payload, created_by, assigned_to)
select
  (elem->>'id')::bigint,
  elem,
  (select uid from creator),
  null::uuid
from elems
where (select uid from creator) is not null
  and elem ? 'id'
  and (elem->>'id') ~ '^[0-9]+$'
on conflict (id) do update set
  payload = excluded.payload,
  updated_at = now();
