-- Audit logging for invites and memberships
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  org_id uuid not null,
  actor_user uuid,
  action text not null,
  target jsonb,
  meta jsonb
);

create index if not exists audit_logs_org_id_idx on public.audit_logs (org_id);
create index if not exists audit_logs_created_at_idx on public.audit_logs (created_at desc);

alter table public.audit_logs enable row level security;

drop policy if exists audit_logs_select_admin on public.audit_logs;
create policy audit_logs_select_admin
on public.audit_logs
for select
to authenticated
using (
  exists (
    select 1
    from public.memberships m
    where m.org_id = audit_logs.org_id
      and m.user_id = auth.uid()
      and upper(m.role) = 'ADMIN'
  )
);

create or replace function public.audit_log_event(
  p_org uuid,
  p_actor uuid,
  p_action text,
  p_target jsonb default null,
  p_meta jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_action not in (
    'invite_created',
    'invite_resend',
    'invite_revoked',
    'invite_accepted',
    'membership_upsert'
  ) then
    raise exception 'invalid audit action %', p_action using errcode = '22023';
  end if;

  insert into public.audit_logs(org_id, actor_user, action, target, meta)
  values (p_org, p_actor, p_action, p_target, p_meta);
end;
$$;

drop function if exists public.trg_audit_invite_created() cascade;
create or replace function public.trg_audit_invite_created()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_invited text;
begin
  v_actor := new.created_by;
  v_invited := to_jsonb(new)->>'invited_by';
  if v_actor is null and v_invited is not null then
    begin
      v_actor := v_invited::uuid;
    exception when others then
      v_actor := null;
    end;
  end if;

  perform public.audit_log_event(
    new.org_id,
    v_actor,
    'invite_created',
    jsonb_build_object(
      'email', new.email,
      'role', new.role,
      'token', new.token
    ),
    null
  );
  return new;
end;
$$;

drop trigger if exists trg_audit_invite_created on public.invites;
create trigger trg_audit_invite_created
after insert on public.invites
for each row
execute function public.trg_audit_invite_created();

drop function if exists public.trg_audit_invite_revoked() cascade;
create or replace function public.trg_audit_invite_revoked()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.audit_log_event(
    new.org_id,
    auth.uid(),
    'invite_revoked',
    jsonb_build_object(
      'email', new.email,
      'token', new.token
    ),
    null
  );
  return new;
end;
$$;

drop trigger if exists trg_audit_invite_revoked on public.invites;
create trigger trg_audit_invite_revoked
after update of revoked_at on public.invites
for each row
when (new.revoked_at is distinct from old.revoked_at and new.revoked_at is not null)
execute function public.trg_audit_invite_revoked();

drop function if exists public.trg_audit_membership_upsert() cascade;
create or replace function public.trg_audit_membership_upsert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_meta jsonb := jsonb_build_object('upsert', true);
  v_actor uuid := auth.uid();
begin
  perform public.audit_log_event(
    new.org_id,
    v_actor,
    'membership_upsert',
    jsonb_build_object(
      'user_id', new.user_id,
      'role', new.role
    ),
    v_meta
  );
  return new;
end;
$$;

drop trigger if exists trg_audit_membership_upsert on public.memberships;
create trigger trg_audit_membership_upsert
after insert or update on public.memberships
for each row
execute function public.trg_audit_membership_upsert();

notify pgrst, 'reload schema';
