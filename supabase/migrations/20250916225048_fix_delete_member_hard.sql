-- Zorg dat de tabel bestaat en RLS aan staat
create extension if not exists pgcrypto;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now()
);

create table if not exists public.memberships (
  org_id uuid not null references public.organizations(id) on delete cascade,
  member_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','agent','customer')),
  created_at timestamptz default now(),
  primary key (org_id, member_id)
);

alter table public.memberships enable row level security;

-- DROP ALLE bestaande DELETE-policies en maak er één goede voor admins
do $$
declare r record;
begin
  for r in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'memberships'
      and (cmd = 'DELETE' or cmd = 'ALL')
  loop
    execute format('drop policy if exists %I on public.memberships', r.policyname);
  end loop;
end$$;

create policy admin_delete_membership
on public.memberships
for delete
to authenticated
using (
  exists (
    select 1
    from public.memberships m
    where m.org_id = memberships.org_id
      and m.member_id = auth.uid()
      and m.role = 'admin'
  )
);

-- DROP ALLE overloads van delete_member en maak exact één INVOKER-variant
do $$
declare
  r record;
begin
  for r in
    select p.oid, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'delete_member'
  loop
    execute 'drop function if exists public.delete_member(' || r.args || ')';
  end loop;
end$$;

create or replace function public.delete_member(p_org uuid, p_target uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  delete from public.memberships
  where org_id = p_org
    and member_id = p_target;
end;
$$;

-- Rechten en PostgREST schema-reload
revoke all on function public.delete_member(uuid, uuid) from anon;
grant execute on function public.delete_member(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
