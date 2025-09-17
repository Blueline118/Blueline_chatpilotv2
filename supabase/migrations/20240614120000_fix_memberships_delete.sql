-- Enable row level security on memberships
alter table if exists public.memberships
  enable row level security;

-- Drop all existing DELETE policies on public.memberships
DO $$
DECLARE
  policy record;
BEGIN
  FOR policy IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'memberships'
      AND cmd = 'DELETE'
  LOOP
    EXECUTE format('drop policy if exists %I on public.memberships', policy.policyname);
  END LOOP;
END
$$;

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

-- Ensure delete_member RPC runs with caller's privileges
DO $$
DECLARE
  fn record;
BEGIN
  FOR fn IN
    SELECT format('alter function public.delete_member(%s) security invoker',
                  pg_get_function_identity_arguments(p.oid)) AS ddl
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'delete_member'
  LOOP
    EXECUTE fn.ddl;
  END LOOP;
END
$$;

revoke all on function public.delete_member(uuid, uuid) from anon;
grant execute on function public.delete_member(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
