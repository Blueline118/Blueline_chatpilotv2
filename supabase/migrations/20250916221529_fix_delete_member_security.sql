-- Zorg dat RLS aan staat
alter table public.memberships enable row level security;

-- Alleen admins in dezelfde org mogen DELETE
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

-- Laat de RPC RLS respecteren
alter function public.delete_member(uuid, uuid) security invoker;

-- Rechten op de RPC
revoke all on function public.delete_member(uuid, uuid) from anon;
grant execute on function public.delete_member(uuid, uuid) to authenticated;

-- Update PostgREST schema cache
notify pgrst, 'reload schema';
