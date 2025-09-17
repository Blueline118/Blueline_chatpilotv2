create or replace function public.update_member_role(p_org uuid, p_target uuid, p_role text)
returns void
language plpgsql
security invoker
as $$
begin
  update public.memberships m
  set role = upper(p_role)::role_type
  where m.org_id = p_org
    and m.user_id = p_target;
  if not found then
    raise exception 'membership not found' using errcode = 'P0002';
  end if;
end;
$$;

grant execute on function public.update_member_role(uuid, uuid, text) to authenticated;

create or replace function public.delete_member(p_org uuid, p_target uuid)
returns void
language plpgsql
security invoker
as $$
begin
  delete from public.memberships m
  where m.org_id = p_org
    and m.user_id = p_target;
  if not found then
    raise exception 'membership not found' using errcode = 'P0002';
  end if;
end;
$$;

grant execute on function public.delete_member(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
