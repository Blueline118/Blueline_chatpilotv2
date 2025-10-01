-- Refresh RLS policies for memberships to require explicit permissions
alter table public.memberships enable row level security;

drop policy if exists memberships_delete_by_admin on public.memberships;
drop policy if exists admin_delete_membership on public.memberships;
create policy memberships_delete_by_admin
on public.memberships
for delete
to authenticated
using (
  public.has_permission(org_id, 'members.delete')
);

drop policy if exists memberships_update_role_by_admin on public.memberships;
drop policy if exists admin_update_member_role on public.memberships;
create policy memberships_update_role_by_admin
on public.memberships
for update
to authenticated
using (
  public.has_permission(org_id, 'members.update')
)
with check (
  public.has_permission(org_id, 'members.update')
);

notify pgrst, 'reload schema';
