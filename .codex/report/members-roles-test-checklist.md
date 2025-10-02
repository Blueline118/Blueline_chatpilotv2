# Members & Roles Regression Checklist

## Auth & Context
- [ ] Login as ADMIN, TEAM, and CUSTOMER; ensure `activeOrgId` persists in local storage (`blueline.activeOrgId`).
- [ ] Switch workspace via WorkspaceSwitcher and confirm memberships refresh + role badge updates instantly.

## Protected Routes
- [ ] Visit `/app` while logged out → redirect to `/login?next=`.
- [ ] Remove membership from a logged-in user; refresh `/app` → redirected to `/login?reason=no-membership`.
- [ ] Attempt `/app/members` as TEAM/CUSTOMER → redirected to `/app`.
- [ ] ADMIN with valid membership reaches `/app/members` successfully.

## Sidebar Visibility
- [ ] Sidebar hides “Ledenbeheer” for TEAM/CUSTOMER even after reload.
- [ ] Sidebar shows “Ledenbeheer” for ADMIN only when `members.read` permission exists.

## Members Admin Operations
- [ ] ADMIN loads members list via `memberships_view` (check network query) and sees correct roles/emails.
- [ ] Update member role (e.g. CUSTOMER → TEAM) → Supabase returns 204; members list refreshes and AuthProvider reflects new role after re-login.
- [ ] Delete member → Supabase returns 204; list refreshes and removed user cannot access `/app` anymore.
- [ ] Invite flow: CUSTOMER invite accepts and shows CUSTOMER badge + no sidebar access to “Ledenbeheer”.
- [ ] Role badge reflects updated role immediately after refreshMemberships.

## Permission Matrix & Scripts
- [ ] Verify SQL function `has_permission` returns true for ADMIN on `members.read/update/delete` and false for TEAM/CUSTOMER.
- [ ] Confirm RLS policies use `has_permission` and block unauthorized selects/updates/deletes.
- [ ] Ensure legacy Netlify scripts remain callable but frontend uses direct RPC.
