create or replace function public.has_permission(p_org_id uuid, p_perm text)
returns boolean
language plpgsql
security invoker
as $$
declare
  v_role text;
begin
  -- Haal rol van huidige user in deze org
  select role::text into v_role
  from public.memberships
  where org_id = p_org_id and user_id = auth.uid();

  if v_role is null then
    return false;
  end if;

  -- Matrix
  if v_role = 'ADMIN' then
    return p_perm in ('org:admin','members.read','members.update','members.delete','org:invite:manage','chat.delete');
  elsif v_role = 'TEAM' then
    return p_perm in ('chat.delete'); -- pas aan indien meer nodig
  elsif v_role = 'CUSTOMER' then
    return p_perm in (''); -- default geen speciale perms
  else
    return false;
  end if;
end;
$$;
