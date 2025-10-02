create or replace view public.memberships_view as
select
  m.org_id,
  m.user_id,
  p.email,
  m.role
from public.memberships m
left join public.profiles p
  on p.id = m.user_id;
