alter table public.memberships enable row level security;
alter table public.organizations enable row level security;
alter table public.chats enable row level security;

-- memberships: alleen eigen
drop policy if exists memberships_self_read on public.memberships;
create policy memberships_self_read
on public.memberships
for select
to authenticated
using (member_id = auth.uid());

-- organizations: alleen via membership
drop policy if exists orgs_member_read on public.organizations;
create policy orgs_member_read
on public.organizations
for select
to authenticated
using (exists (
  select 1 from public.memberships m
  where m.org_id = organizations.id and m.member_id = auth.uid()
));

-- chats: lezen door leden
drop policy if exists chats_member_select on public.chats;
create policy chats_member_select
on public.chats
for select
to authenticated
using (exists (
  select 1 from public.memberships m
  where m.org_id = chats.org_id and m.member_id = auth.uid()
));

-- chats: insert door leden, owner = zichzelf
drop policy if exists chats_member_insert on public.chats;
create policy chats_member_insert
on public.chats
for insert
to authenticated
with check (
  owner_id = auth.uid() and exists (
    select 1 from public.memberships m
    where m.org_id = chats.org_id and m.member_id = auth.uid()
  )
);

-- chats: update/delete door owner of admin in dezelfde org
drop policy if exists chats_owner_or_admin_update on public.chats;
create policy chats_owner_or_admin_update
on public.chats
for update
to authenticated
using (
  owner_id = auth.uid() or exists (
    select 1 from public.memberships m
    where m.org_id = chats.org_id and m.member_id = auth.uid() and m.role = 'admin'
  )
);

drop policy if exists chats_owner_or_admin_delete on public.chats;
create policy chats_owner_or_admin_delete
on public.chats
for delete
to authenticated
using (
  owner_id = auth.uid() or exists (
    select 1 from public.memberships m
    where m.org_id = chats.org_id and m.member_id = auth.uid() and m.role = 'admin'
  )
);

-- schema cache
notify pgrst, 'reload schema';
