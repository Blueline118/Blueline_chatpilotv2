-- invites table + policies + RPCs for invite flow

-- 1) invites tabel
create table if not exists public.invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  email text not null check (position('@' in email) > 1),
  role text not null check (role in ('ADMIN','TEAM','CUSTOMER')),
  token uuid not null unique default gen_random_uuid(),
  expires_at timestamptz not null default (now() + interval '72 hours'),
  accepted_at timestamptz,
  created_by uuid not null references auth.users(id),
  inserted_at timestamptz not null default now()
);

alter table public.invites enable row level security;

-- 2) policies: admin van org mag inserts/selects
drop policy if exists "admin can create invites" on public.invites;
create policy "admin can create invites"
on public.invites for insert
with check (
  exists (
    select 1
    from public.memberships m
    where m.org_id = invites.org_id
      and m.user_id = auth.uid()
      and m.role = 'ADMIN'
  )
);

drop policy if exists "admin can view invites" on public.invites;
create policy "admin can view invites"
on public.invites for select
using (
  exists (
    select 1
    from public.memberships m
    where m.org_id = invites.org_id
      and m.user_id = auth.uid()
      and m.role = 'ADMIN'
  )
);

-- 3) accept rpc (security definer) - voegt membership toe voor de ingelogde user
create or replace function public.accept_invite(p_token uuid)
returns table(org_id uuid, email text, role text)
language plpgsql
security definer
as $$
declare v_inv public.invites%rowtype;
declare v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_inv
  from public.invites
  where token = p_token
    and accepted_at is null
    and expires_at > now()
  for update;

  if not found then
    raise exception 'invalid_or_expired';
  end if;

  -- zorg dat profile rij bestaat/klopt
  insert into public.profiles(id, email)
  values (v_user, coalesce((select email from auth.users where id = v_user), v_inv.email))
  on conflict (id) do update set email = excluded.email;

  -- membership toevoegen of rol bijwerken
  insert into public.memberships(org_id, user_id, role)
  values (v_inv.org_id, v_user, v_inv.role)
  on conflict (org_id, user_id) do update set role = excluded.role;

  update public.invites set accepted_at = now() where id = v_inv.id;

  return query select v_inv.org_id, v_inv.email, v_inv.role;
end;
$$;

grant execute on function public.accept_invite(uuid) to anon, authenticated;

-- optioneel: rpc voor create (invoker; RLS enforced via policy)
create or replace function public.create_invite(p_org uuid, p_email text, p_role text)
returns public.invites
language sql
security invoker
as $$
  insert into public.invites(org_id, email, role, created_by)
  values (p_org, p_email, p_role, auth.uid())
  returning *;
$$;
