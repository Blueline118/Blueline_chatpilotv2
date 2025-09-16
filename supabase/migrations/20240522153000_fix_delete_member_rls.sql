-- Ensure delete_member runs with the caller's permissions so RLS applies
alter function public.delete_member(p_org uuid, p_target uuid)
  security invoker;

-- Only admins of the same organization may delete memberships
drop policy if exists "Admins can delete org memberships" on public.memberships;

create policy "Admins can delete org memberships"
  on public.memberships
  for delete
  using (
    exists (
      select 1
      from public.memberships as admin_membership
      where admin_membership.org_id = memberships.org_id
        and admin_membership.member_id = auth.uid()
        and upper(admin_membership.role::text) = 'ADMIN'
    )
  );

-- Allow authenticated users to attempt deletes (enforced by RLS above)
grant delete on table public.memberships to authenticated;
