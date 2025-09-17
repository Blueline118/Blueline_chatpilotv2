-- Zorg dat de tabel bestaat
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

-- Policy: alleen admin binnen dezelfde org mag DELETE
alter table public.memberships enable row level security;

drop policy if exists admin_delete_membership on public.memberships;
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

-- Definieer de RPC expliciet als SECURITY INVOKER
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

-- Rechten
revoke all on function public.delete_member(uuid, uuid) from anon;
grant execute on function public.delete_member(uuid, uuid) to authenticated;

-- PostgREST schema cache verversen
notify pgrst, 'reload schema';
