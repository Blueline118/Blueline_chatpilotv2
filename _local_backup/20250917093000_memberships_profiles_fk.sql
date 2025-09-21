-- Migration: memberships → profiles foreign key + view
-- Date: 2025-09-17

-- 1. Zorg dat de kolomnaam klopt
ALTER TABLE memberships
  RENAME COLUMN member_id TO user_id;

-- 2. Voeg de foreign key relatie naar profiles toe
ALTER TABLE memberships
  ADD CONSTRAINT memberships_user_id_fkey
  FOREIGN KEY (user_id)
  REFERENCES profiles (id)
  ON DELETE CASCADE;

-- 3. Ververs policies die de oude naam gebruikten
DROP POLICY IF EXISTS "Members can view own membership" ON memberships;
CREATE POLICY "Members can view own membership"
  ON memberships
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can manage org members" ON memberships;
CREATE POLICY "Admins can manage org members"
  ON memberships
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM memberships m2
      WHERE m2.org_id = memberships.org_id
        AND m2.user_id = auth.uid()
        AND m2.role = 'ADMIN'
    )
  );

-- 4. Ververs RPCs (optioneel als ze oude kolom gebruikten)
-- update_member_role en delete_member zijn al herschreven om user_id te gebruiken

-- 5. Maak een view die membership + email koppelt
CREATE OR REPLACE VIEW v_org_members AS
SELECT
  m.org_id,
  m.user_id,
  m.role,
  m.created_at,
  p.email
FROM memberships m
JOIN profiles p ON p.id = m.user_id;

-- Done
