-- DiaTech — Noms de services distincts depuis dia_tickets (pour /api/admin/department-names-from-tickets)
-- Prérequis : public.dia_tickets existe (schema_rls_entities.sql).
-- À exécuter une fois dans Supabase SQL Editor (idempotent).

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
