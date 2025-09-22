-- Ensure invites.role column has default and is not null
alter table public.invites
  add column if not exists role text;

alter table public.invites
  alter column role set default 'CUSTOMER';

update public.invites
set role = 'CUSTOMER'
where role is null;

alter table public.invites
  alter column role set not null;

-- Resend invite should reuse the previous role when available
create or replace function public.resend_invite(p_org_id uuid, p_email citext)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_role text;
  v_token uuid := gen_random_uuid();
begin
  if v_actor is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if not public.has_permission(p_org_id, 'org:invite:manage') then
    raise exception 'permission denied' using errcode = '42501';
  end if;

  -- mark any existing open invites as revoked
  update public.invites
  set revoked_at = now()
  where org_id = p_org_id
    and email = p_email
    and used_at is null
    and revoked_at is null;

  -- reuse the most recent role if we have one
  select role
    into v_role
  from public.invites
  where org_id = p_org_id
    and email = p_email
  order by created_at desc
  limit 1;

  v_role := upper(coalesce(v_role, 'CUSTOMER'));

  perform set_config('blueline.invite_action', 'resent', true);

  insert into public.invites (org_id, email, created_by, token, expires_at, role)
  values (p_org_id, p_email, v_actor, v_token, now() + interval '7 days', v_role);

  perform set_config('blueline.invite_action', '', true);

  return v_token::text;
end;
$$;

-- Accept invite stores the invite role on the membership and returns the membership id
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
  v_membership_id uuid;
  v_has_id_column boolean;
begin
  if v_actor is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select *
    into v_inv
  from public.invites
  where token = p_token::uuid::text
    and used_at is null
    and revoked_at is null
    and now() < expires_at
  for update;

  if not found then
    raise exception 'Invite invalid or expired' using errcode = '22023';
  end if;

  v_role := upper(coalesce(v_inv.role, 'CUSTOMER'));

  update public.invites
  set used_at = now()
  where id = v_inv.id
    and used_at is null;

  if not found then
    raise exception 'Invite already used' using errcode = '22023';
  end if;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'memberships'
      and column_name = 'id'
  )
  into v_has_id_column;

  if v_has_id_column then
    insert into public.memberships (org_id, user_id, role)
    values (v_inv.org_id, v_actor, v_role)
    on conflict (org_id, user_id)
    do update set role = excluded.role
    returning id into v_membership_id;
  else
    insert into public.memberships (org_id, user_id, role)
    values (v_inv.org_id, v_actor, v_role)
    on conflict (org_id, user_id)
    do update set role = excluded.role
    returning user_id into v_membership_id;
  end if;

  return v_membership_id;
end;
$$;

notify pgrst, 'reload schema';
