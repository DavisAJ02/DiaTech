-- Migration one-shot : app_state.tickets (jsonb[]) → public.dia_tickets
-- Prérequis : schema.sql, schema_profiles_rbac.sql, schema_rls_entities.sql, rpc_diatech_auth_email.sql (optionnel pour l’API).
--
-- created_by : premier profil admin trouvé ; sinon premier profil quelconque.
-- assigned_to : laissé NULL (les anciens tickets n’ont que assignedUserId numérique démo).

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
