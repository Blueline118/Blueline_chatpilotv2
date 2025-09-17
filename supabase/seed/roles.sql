insert into auth.users(id, email)
values
('00000000-0000-0000-0000-0000000000aa', 'admin@example.com'),
('00000000-0000-0000-0000-0000000000bb', 'agent@example.com'),
('00000000-0000-0000-0000-0000000000cc', 'customer@example.com')
on conflict do nothing;

insert into public.organizations(id, name) values
('10000000-0000-0000-0000-000000000000', 'Acme')
on conflict do nothing;

insert into public.memberships(org_id, member_id, role)
values
('10000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000aa', 'admin'),
('10000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000bb', 'agent'),
('10000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000cc', 'customer')
on conflict do nothing;
