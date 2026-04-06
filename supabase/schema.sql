-- DiaTech app-state table (key/value JSON storage)
-- Run this in Supabase SQL Editor before first deploy.

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

-- Optional: seed empty keys so reads are predictable.
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
