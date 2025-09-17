-- Ensure authenticated users can attempt updates/deletes (RLS restricts them)
grant update, delete on table public.memberships to authenticated;

create or replace policy admin_update_member_role on public.memberships
for update to authenticated
using (
  public.is_org_admin(org_id::uuid, auth.uid())
  and user_id <> auth.uid()
)
with check (
  public.is_org_admin(org_id::uuid, auth.uid())
  and user_id <> auth.uid()
);

create or replace policy admin_delete_membership on public.memberships
for delete to authenticated
using (
  public.is_org_admin(org_id::uuid, auth.uid())
);

notify pgrst, 'reload schema';
