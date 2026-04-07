-- Phase 0 — Alignement agent (technicien) : assignation + file visible en RLS + trigger.
-- À exécuter dans Supabase SQL Editor si dia_tickets existait déjà avec l’ancienne version.
-- Idempotent (drop/create policies + replace function).

-- ── SELECT : agents voient tous les tickets (périmètre départements : /api/tickets-rls) ──

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

-- ── UPDATE : tout agent peut mettre à jour (assigner des tickets non assignés, etc.) ──

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

-- ── Trigger : admin ou agent peut modifier assigned_to ; user non ──

create or replace function public.dia_tickets_prevent_created_by_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin') then
    return new;
  end if;
  if exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'agent') then
    if new.created_by is distinct from old.created_by then
      raise exception 'dia_tickets: created_by ne peut être modifié que par un admin';
    end if;
    return new;
  end if;
  if new.created_by is distinct from old.created_by then
    raise exception 'dia_tickets: created_by ne peut être modifié que par un admin';
  end if;
  if new.assigned_to is distinct from old.assigned_to then
    raise exception 'dia_tickets: seul un admin ou un agent peut modifier assigned_to';
  end if;
  return new;
end;
$$;

comment on function public.dia_tickets_prevent_created_by_change() is
  'Avant UPDATE dia_tickets : created_by réservé admin ; assigned_to modifiable par admin ou agent.';
