alter table public.memberships enable row level security;

-- SELECT: alleen voor users met members.read in hun org
drop policy if exists memberships_select_by_admin on public.memberships;
create policy memberships_select_by_admin
on public.memberships
for select
to authenticated
using ( public.has_permission(org_id, 'members.read') );

-- UPDATE (rol wissel): alleen voor members.update
drop policy if exists memberships_update_role_by_admin on public.memberships;
create policy memberships_update_role_by_admin
on public.memberships
for update
to authenticated
using ( public.has_permission(org_id, 'members.update') )
with check ( public.has_permission(org_id, 'members.update') );

-- DELETE (verwijderen): alleen voor members.delete
drop policy if exists memberships_delete_by_admin on public.memberships;
create policy memberships_delete_by_admin
on public.memberships
for delete
to authenticated
using ( public.has_permission(org_id, 'members.delete') );
