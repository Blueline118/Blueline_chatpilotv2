-- Invite token overhaul: TTL, revoke/resend, auditing
create extension if not exists pgcrypto;
create extension if not exists citext;

-- Ensure required columns exist on invites
alter table public.invites
  add column if not exists token text,
  add column if not exists expires_at timestamptz,
  add column if not exists used_at timestamptz,
  add column if not exists revoked_at timestamptz,
  add column if not exists created_by uuid,
  add column if not exists org_id uuid,
  add column if not exists email citext;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'invites'
      and column_name = 'email'
      and udt_name <> 'citext'
  ) then
    execute 'alter table public.invites alter column email type citext using email::citext';
  end if;
end
$$;

-- Ensure column defaults / constraints
alter table public.invites
  alter column token set default gen_random_uuid()::text,
  alter column expires_at set default (now() + interval '7 days');

update public.invites
set token = gen_random_uuid()::text
where token is null;

update public.invites
set expires_at = coalesce(expires_at, created_at + interval '7 days')
where expires_at is null;

-- Backfill created_by based on existing memberships
with candidates as (
  select i.id,
         coalesce(
           (
             select m.user_id
             from public.memberships m
             where m.org_id = i.org_id
               and upper(m.role) = 'ADMIN'
             order by m.created_at
             limit 1
           ),
           (
             select m.user_id
             from public.memberships m
             where m.org_id = i.org_id
             order by m.created_at
             limit 1
           )
         ) as creator
  from public.invites i
  where i.created_by is null
)
update public.invites i
set created_by = c.creator
from candidates c
where i.id = c.id
  and c.creator is not null;

-- Enforce NOT NULL once data has been backfilled
alter table public.invites
  alter column token set not null,
  alter column expires_at set not null;

alter table public.invites
  drop constraint if exists invites_token_unique;
alter table public.invites
  add constraint invites_token_unique unique (token);

alter table public.invites
  alter column created_by set not null;

alter table public.invites
  drop constraint if exists invites_created_by_fkey;
alter table public.invites
  add constraint invites_created_by_fkey foreign key (created_by) references auth.users(id);

alter table public.invites
  alter column org_id set not null;

alter table public.invites
  drop constraint if exists invites_org_fk;
alter table public.invites
  add constraint invites_org_fk foreign key (org_id) references public.organizations(id);

alter table public.invites
  alter column email set not null;

do $$
begin
  alter table public.invites
    add constraint invites_email_check check (email ~* '^.+@.+\..+$');
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  alter table public.invites
    add constraint invites_expires_after_created check (expires_at > created_at);
exception
  when duplicate_object then null;
end;
$$;

-- Indexes for quick lookups
create index if not exists invites_org_email_idx on public.invites (org_id, email);
create index if not exists invites_created_by_created_at_idx on public.invites (created_by, created_at);
create index if not exists invites_token_open_idx on public.invites (token) where used_at is null and revoked_at is null;

-- Row Level Security policies
alter table public.invites enable row level security;

drop policy if exists "admin can create invites" on public.invites;
drop policy if exists "admin can view invites" on public.invites;
drop policy if exists select_own_admin_invites on public.invites;
drop policy if exists insert_admin_invite on public.invites;
drop policy if exists update_admin_invite on public.invites;
drop policy if exists delete_admin_invite on public.invites;

create policy select_own_admin_invites
on public.invites
for select
to authenticated
using (
  public.has_permission(org_id, 'org:invite:manage')
);

create policy insert_admin_invite
on public.invites
for insert
to authenticated
with check (
  public.has_permission(org_id, 'org:invite:manage')
);

create policy update_admin_invite
on public.invites
for update
to authenticated
using (
  public.has_permission(org_id, 'org:invite:manage')
)
with check (
  public.has_permission(org_id, 'org:invite:manage')
);

create policy delete_admin_invite
on public.invites
for delete
to authenticated
using (
  public.has_permission(org_id, 'org:invite:manage')
);

-- Rate limit helper
create or replace function public.can_send_more_invites(p_user uuid, p_limit int default 10)
returns boolean
language sql
security invoker
set search_path = public
as $$
  select count(*) < coalesce(p_limit, 10)
  from public.invites
  where created_by = p_user
    and created_at > (now() - interval '1 hour');
$$;

-- Invite creation helper
create or replace function public.create_invite(p_org uuid, p_email citext, p_role text)
returns public.invites
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_row public.invites%rowtype;
  v_role text := upper(coalesce(p_role, 'CUSTOMER'));
  v_token text := gen_random_uuid()::text;
begin
  if v_actor is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if not public.has_permission(p_org, 'org:invite:manage') then
    raise exception 'permission denied' using errcode = '42501';
  end if;

  if not public.can_send_more_invites(v_actor, null) then
    raise exception 'invite_limit_reached' using errcode = '22023', message = 'Invite limit exceeded';
  end if;

  insert into public.invites (org_id, email, role, token, expires_at, created_by)
  values (p_org, p_email, v_role, v_token, default, v_actor)
  returning * into v_row;

  return v_row;
end;
$$;

-- Revoke invite
create or replace function public.revoke_invite(p_token text)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_inv public.invites%rowtype;
begin
  select *
    into v_inv
  from public.invites
  where token = p_token
  for update;

  if not found then
    raise exception 'Invite not found' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_inv.org_id, 'org:invite:manage') then
    raise exception 'permission denied' using errcode = '42501';
  end if;

  update public.invites
  set revoked_at = now()
  where id = v_inv.id
    and used_at is null
    and revoked_at is null;
end;
$$;

-- Resend invite
create or replace function public.resend_invite(p_org_id uuid, p_email citext)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_role text;
  v_token text := gen_random_uuid()::text;
  v_result text;
begin
  if v_actor is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if not public.has_permission(p_org_id, 'org:invite:manage') then
    raise exception 'permission denied' using errcode = '42501';
  end if;

  if not public.can_send_more_invites(v_actor, null) then
    raise exception 'invite_limit_reached' using errcode = '22023', message = 'Invite limit exceeded';
  end if;

  select role
    into v_role
  from public.invites
  where org_id = p_org_id
    and email = p_email
  order by created_at desc
  limit 1;

  if v_role is null then
    v_role := 'CUSTOMER';
  end if;

  update public.invites
  set revoked_at = now()
  where org_id = p_org_id
    and email = p_email
    and used_at is null
    and revoked_at is null;

  perform set_config('blueline.invite_action', 'resent', true);

  insert into public.invites (org_id, email, role, token, expires_at, created_by)
  values (p_org_id, p_email, upper(v_role), v_token, default, v_actor)
  returning token into v_result;

  perform set_config('blueline.invite_action', '', true);

  return v_result;
end;
$$;

-- Accept invite
create or replace function public.accept_invite(p_token text)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_inv public.invites%rowtype;
  v_role text;
begin
  if v_actor is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select *
    into v_inv
  from public.invites
  where token = p_token
    and revoked_at is null
    and used_at is null
  for update;

  if not found or v_inv.expires_at <= now() then
    raise exception 'Invite invalid or expired' using errcode = '22023';
  end if;

  v_role := coalesce(upper(v_inv.role), 'CUSTOMER');

  insert into public.memberships (org_id, user_id, role)
  values (v_inv.org_id, v_actor, v_role)
  on conflict (org_id, user_id)
  do update set role = excluded.role;

  update public.invites
  set used_at = now()
  where id = v_inv.id
    and used_at is null;

  if not found then
    raise exception 'Invite already used' using errcode = '22023';
  end if;

  return v_actor;
end;
$$;

-- Audit logging table
create table if not exists public.audit_invites (
  id bigserial primary key,
  action text not null,
  invite_id uuid not null references public.invites(id) on delete cascade,
  actor_id uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create or replace function public.log_invite_audit()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_action text;
  v_actor uuid := auth.uid();
  v_flag text;
begin
  if tg_op = 'INSERT' then
    begin
      v_flag := current_setting('blueline.invite_action', true);
    exception
      when others then
        v_flag := null;
    end;
    if v_flag is null or length(trim(v_flag)) = 0 then
      v_action := 'created';
    else
      v_action := v_flag;
    end if;
  elsif tg_op = 'UPDATE' then
    if new.revoked_at is not null and (old.revoked_at is null or new.revoked_at <> old.revoked_at) then
      v_action := 'revoked';
    elsif new.used_at is not null and (old.used_at is null or new.used_at <> old.used_at) then
      v_action := 'used';
    elsif new.token is distinct from old.token then
      v_action := 'resent';
    else
      return new;
    end if;
  else
    return new;
  end if;

  insert into public.audit_invites(action, invite_id, actor_id)
  values (v_action, new.id, v_actor);

  return new;
end;
$$;

drop trigger if exists trg_invites_audit on public.invites;
create trigger trg_invites_audit
after insert or update on public.invites
for each row
execute function public.log_invite_audit();

notify pgrst, 'reload schema';
