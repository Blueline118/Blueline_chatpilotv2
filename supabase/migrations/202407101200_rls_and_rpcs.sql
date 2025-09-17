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

create table if not exists public.invites (
id uuid primary key,
org_id uuid not null references public.organizations(id) on delete cascade,
email text not null,
role text not null check (role in ('admin','agent','customer')),
created_at timestamptz default now()
);

create table if not exists public.chats (
id uuid primary key default gen_random_uuid(),
org_id uuid not null references public.organizations(id) on delete cascade,
owner_id uuid not null references auth.users(id) on delete cascade,
body jsonb,
created_at timestamptz default now()
);

-- Enable row level security on core tables
alter table public.memberships enable row level security;
alter table public.organizations enable row level security;
alter table public.chats enable row level security;

-- memberships policies
create policy "Members can view their memberships"
on public.memberships
for select
using (member_id = auth.uid());

-- organizations policies
create policy "Members can view their organizations"
on public.organizations
for select
using (
  exists (
    select 1
    from public.memberships m
    where m.org_id = organizations.id
      and m.member_id = auth.uid()
  )
);

-- chats policies
create policy "Organization members can read chats"
on public.chats
for select
using (
  org_id in (
    select org_id
    from public.memberships
    where member_id = auth.uid()
  )
);

create policy "Members can insert their own chats"
on public.chats
for insert
with check (
  owner_id = auth.uid()
  and org_id in (
    select org_id
    from public.memberships
    where member_id = auth.uid()
  )
);

create policy "Owners and admins can update chats"
on public.chats
for update
using (
  owner_id = auth.uid()
  or exists (
    select 1
    from public.memberships m
    where m.org_id = chats.org_id
      and m.member_id = auth.uid()
      and m.role = 'admin'
  )
)
with check (
  owner_id = auth.uid()
  or exists (
    select 1
    from public.memberships m
    where m.org_id = chats.org_id
      and m.member_id = auth.uid()
      and m.role = 'admin'
  )
);

create policy "Owners and admins can delete chats"
on public.chats
for delete
using (
  owner_id = auth.uid()
  or exists (
    select 1
    from public.memberships m
    where m.org_id = chats.org_id
      and m.member_id = auth.uid()
      and m.role = 'admin'
  )
);

-- RPC definitions with p_* parameters
create or replace function public.get_org_members(p_org uuid)
returns setof public.memberships
language sql
security definer
set search_path = public
as $$
  select m.*
  from public.memberships m
  where m.org_id = p_org;
$$;

create or replace function public.update_member_role(p_org uuid, p_target uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.memberships
  set role = p_role
  where org_id = p_org
    and member_id = p_target;
end;
$$;

create or replace function public.delete_member(p_org uuid, p_target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.memberships
  where org_id = p_org
    and member_id = p_target;
end;
$$;

create or replace function public.create_invite(p_org uuid, p_email text, p_role text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := gen_random_uuid();
begin
  insert into public.invites (id, org_id, email, role, created_at)
  values (v_id, p_org, p_email, p_role, now());
  return v_id;
end;
$$;

create or replace function public.accept_invite(p_token uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv public.invites;
begin
  select *
  into v_inv
  from public.invites
  where id = p_token;

  if not found then
    raise exception 'invalid invite';
  end if;

  insert into public.memberships (org_id, member_id, role, created_at)
  values (v_inv.org_id, auth.uid(), v_inv.role, now())
  on conflict do nothing;

  delete from public.invites
  where id = p_token;
end;
$$;

-- Restrict RPC access
revoke all on function public.get_org_members(uuid) from anon;
grant execute on function public.get_org_members(uuid) to authenticated;
grant execute on function public.update_member_role(uuid, uuid, text) to authenticated;
