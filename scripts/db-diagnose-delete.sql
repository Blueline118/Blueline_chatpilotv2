-- Overview of DELETE policies on public.memberships
select schemaname, tablename, policyname, cmd, roles, qual
from pg_policies
where schemaname = 'public' and tablename = 'memberships'
order by cmd, policyname;

-- Security mode of delete_member function
select p.proname, p.prosecdef as security_definer, p.proargtypes::regtype[] as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'delete_member';
