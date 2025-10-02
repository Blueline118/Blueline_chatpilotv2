-- Permissions tabel mapping (voorbeeld, pas aan naar jouw schema)
-- Veronderstel: table public.permissions(id bigint, key text), public.role_permissions(role text, permission_id bigint)

-- keys
insert into public.permissions(key, description) values
  ('members.read','Admin mag ledenlijst zien'),
  ('members.update','Admin mag ledenrollen wijzigen'),
  ('members.delete','Admin mag leden verwijderen')
on conflict (key) do nothing;

-- koppel alleen aan ADMIN
insert into public.role_permissions(role, permission_id)
select 'ADMIN', p.id
from public.permissions p
where p.key in ('members.read','members.update','members.delete')
  and not exists (select 1 from public.role_permissions rp where rp.role='ADMIN' and rp.permission_id=p.id);
