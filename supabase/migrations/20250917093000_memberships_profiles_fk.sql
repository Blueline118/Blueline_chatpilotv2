-- Ensure memberships.user_id matches profiles.user_id and expose helper view

-- Rename member_id column to user_id when needed
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'memberships'
      AND column_name = 'member_id'
  ) THEN
    EXECUTE 'alter table public.memberships rename column member_id to user_id';
  END IF;
END
$$;

-- Drop legacy foreign keys before adding the new relationship
ALTER TABLE public.memberships
  DROP CONSTRAINT IF EXISTS memberships_member_id_fkey,
  DROP CONSTRAINT IF EXISTS memberships_user_id_fkey;

-- Add foreign key to profiles.user_id when profiles table is available
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'memberships'
      AND column_name = 'user_id'
  )
  AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'user_id'
  ) THEN
    BEGIN
      EXECUTE 'alter table public.memberships add constraint memberships_user_id_fkey
               foreign key (user_id) references public.profiles(user_id) on delete cascade';
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END;
  END IF;
END
$$;

-- Keep RLS grants in sync
GRANT UPDATE, DELETE ON TABLE public.memberships TO authenticated;

-- Membership policies (use user_id)
DROP POLICY IF EXISTS memberships_self_read ON public.memberships;
DROP POLICY IF EXISTS "Members can view their memberships" ON public.memberships;
CREATE POLICY memberships_self_read
ON public.memberships
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS admin_update_member_role ON public.memberships;
CREATE POLICY admin_update_member_role
ON public.memberships
FOR UPDATE
TO authenticated
USING (
  public.is_org_admin(org_id::uuid, auth.uid())
  AND user_id <> auth.uid()
)
WITH CHECK (
  public.is_org_admin(org_id::uuid, auth.uid())
  AND user_id <> auth.uid()
);

DROP POLICY IF EXISTS admin_delete_membership ON public.memberships;
CREATE POLICY admin_delete_membership
ON public.memberships
FOR DELETE
TO authenticated
USING (
  public.is_org_admin(org_id::uuid, auth.uid())
);

-- Organizations policies depend on memberships.user_id
DROP POLICY IF EXISTS orgs_member_read ON public.organizations;
DROP POLICY IF EXISTS "Members can view their organizations" ON public.organizations;
CREATE POLICY orgs_member_read
ON public.organizations
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.memberships m
    WHERE m.org_id = organizations.id
      AND m.user_id = auth.uid()
  )
);

-- Chats policies (replace legacy variants that referenced member_id)
DROP POLICY IF EXISTS chats_member_select ON public.chats;
DROP POLICY IF EXISTS "Organization members can read chats" ON public.chats;
CREATE POLICY chats_member_select
ON public.chats
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.memberships m
    WHERE m.org_id = chats.org_id
      AND m.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS chats_member_insert ON public.chats;
DROP POLICY IF EXISTS "Members can insert their own chats" ON public.chats;
CREATE POLICY chats_member_insert
ON public.chats
FOR INSERT
TO authenticated
WITH CHECK (
  owner_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.memberships m
    WHERE m.org_id = chats.org_id
      AND m.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS chats_owner_or_admin_update ON public.chats;
DROP POLICY IF EXISTS "Owners and admins can update chats" ON public.chats;
CREATE POLICY chats_owner_or_admin_update
ON public.chats
FOR UPDATE
TO authenticated
USING (
  owner_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.memberships m
    WHERE m.org_id = chats.org_id
      AND m.user_id = auth.uid()
      AND m.role = 'admin'
  )
)
WITH CHECK (
  owner_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.memberships m
    WHERE m.org_id = chats.org_id
      AND m.user_id = auth.uid()
      AND m.role = 'admin'
  )
);

DROP POLICY IF EXISTS chats_owner_or_admin_delete ON public.chats;
DROP POLICY IF EXISTS "Owners and admins can delete chats" ON public.chats;
CREATE POLICY chats_owner_or_admin_delete
ON public.chats
FOR DELETE
TO authenticated
USING (
  owner_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.memberships m
    WHERE m.org_id = chats.org_id
      AND m.user_id = auth.uid()
      AND m.role = 'admin'
  )
);

-- Ensure helper RPCs respect the renamed column
CREATE OR REPLACE FUNCTION public.update_member_role(p_org uuid, p_target uuid, p_role text)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  UPDATE public.memberships AS m
  SET role = upper(p_role)::role_type
  WHERE m.org_id = p_org
    AND m.user_id = p_target;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'membership not found' USING errcode = 'P0002';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_member(p_org uuid, p_target uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.memberships AS m
  WHERE m.org_id = p_org
    AND m.user_id = p_target;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'membership not found' USING errcode = 'P0002';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_member_role(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_member(uuid, uuid) TO authenticated;

-- Expose a stable view for org members with profile emails when available
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'email'
  ) THEN
    EXECUTE $$
      create or replace view public.v_org_members as
      select m.org_id,
             m.user_id,
             m.role,
             m.created_at,
             p.email
        from public.memberships as m
        join public.profiles as p on p.user_id = m.user_id;
    $$;
  END IF;
END
$$;

NOTIFY pgrst, 'reload schema';
