-- Create admin RPCs for managing memberships with audit logging
create or replace function public.admin_delete_member(
  p_org_id uuid,
  p_member_id uuid
) returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_can_delete boolean;
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select public.has_permission(p_org_id, 'members.delete')
    into v_can_delete;

  if not coalesce(v_can_delete, false) then
    raise exception 'forbidden: missing permission members.delete'
      using errcode = '42501';
  end if;

  if p_member_id = v_actor then
    raise exception 'bad_request: cannot delete yourself via admin_delete_member'
      using errcode = '22023';
  end if;

  delete from public.memberships as m
  where m.org_id = p_org_id
    and m.user_id = p_member_id;

  if not found then
    raise exception 'membership not found' using errcode = 'P0002';
  end if;

  perform public.audit_log_event(
    action => 'member_deleted',
    org_id => p_org_id,
    entity => 'memberships',
    entity_id => p_member_id::text,
    meta => jsonb_build_object('by', v_actor::text)
  );
end;
$$;

create or replace function public.admin_update_member_role(
  p_org_id uuid,
  p_member_id uuid,
  p_role text
) returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_can_update boolean;
  v_actor uuid := auth.uid();
  v_role text := upper(coalesce(p_role, ''));
begin
  if v_actor is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if v_role not in ('ADMIN', 'TEAM', 'CUSTOMER') then
    raise exception 'bad_request: invalid role %', v_role using errcode = '22023';
  end if;

  select public.has_permission(p_org_id, 'members.update')
    into v_can_update;

  if not coalesce(v_can_update, false) then
    raise exception 'forbidden: missing permission members.update'
      using errcode = '42501';
  end if;

  if p_member_id = v_actor and v_role <> 'ADMIN' then
    raise exception 'bad_request: cannot downgrade your own role'
      using errcode = '22023';
  end if;

  update public.memberships as m
     set role = v_role::role_type
   where m.org_id = p_org_id
     and m.user_id = p_member_id;

  if not found then
    raise exception 'membership not found' using errcode = 'P0002';
  end if;

  perform public.audit_log_event(
    action => 'member_role_updated',
    org_id => p_org_id,
    entity => 'memberships',
    entity_id => p_member_id::text,
    meta => jsonb_build_object('by', v_actor::text, 'new_role', v_role)
  );
end;
$$;

grant execute on function public.admin_delete_member(uuid, uuid) to authenticated;
grant execute on function public.admin_update_member_role(uuid, uuid, text) to authenticated;

notify pgrst, 'reload schema';
