// change: consolidate auth context with memberships and permissions
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

const STORAGE_KEY = 'blueline.activeOrgId';
const LEGACY_KEYS = ['activeOrgId'];

const AuthCtx = createContext(null);

function readStoredOrgId() {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined);
  const [user, setUser] = useState(null);
  const [initializing, setInitializing] = useState(true);
  const [memberships, setMemberships] = useState([]);
  const [membershipsLoading, setMembershipsLoading] = useState(true);
  const [activeOrgId, setActiveOrgIdState] = useState(() => readStoredOrgId());

  const isMountedRef = useRef(true);
  const activeOrgIdRef = useRef(activeOrgId);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    activeOrgIdRef.current = activeOrgId;
  }, [activeOrgId]);

  const updateStoredOrgId = useCallback((orgId) => {
    if (typeof window === 'undefined') return;
    try {
      if (orgId) {
        window.localStorage.setItem(STORAGE_KEY, orgId);
      } else {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // ignore storage errors
    }
  }, []);

  const setActiveOrgIdSafe = useCallback(
    (orgId) => {
      setActiveOrgIdState(orgId);
      updateStoredOrgId(orgId);
    },
    [updateStoredOrgId],
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      LEGACY_KEYS.forEach((key) => {
        if (key !== STORAGE_KEY) {
          window.localStorage.removeItem(key);
        }
      });
    } catch {
      // ignore
    }
  }, []);

  const refreshMemberships = useCallback(async () => {
    if (!isMountedRef.current) return [];
    setMembershipsLoading(true);

    if (!user?.id) {
      if (isMountedRef.current) {
        setMemberships([]);
        setActiveOrgIdSafe(null);
        setMembershipsLoading(false);
      }
      return [];
    }

    const { data, error } = await supabase
      .from('memberships_view')
      .select('org_id, role')
      .eq('user_id', user.id);

    if (!isMountedRef.current) {
      return Array.isArray(data) ? data : [];
    }

    if (error) {
      console.error('[AuthProvider] memberships load failed', error);
      setMemberships([]);
      setMembershipsLoading(false);
      return [];
    }

    const list = Array.isArray(data)
      ? data.map((item) => ({
          org_id: item.org_id,
          role: item.role ? String(item.role).toUpperCase() : null,
        }))
      : [];

    setMemberships(list);
    setMembershipsLoading(false);

    const current = activeOrgIdRef.current;
    if (!current || !list.some((m) => m.org_id === current)) {
      const nextOrgId = list[0]?.org_id ?? null;
      setActiveOrgIdSafe(nextOrgId);
      return list;
    }

    return list;
  }, [setActiveOrgIdSafe, user?.id]);

  useEffect(() => {
    let cancelled = false;

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled || !isMountedRef.current) return;
      setSession(data.session ?? null);
      setUser(data.session?.user ?? null);
      setInitializing(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, sess) => {
      if (!isMountedRef.current) return;
      setSession(sess ?? null);
      setUser(sess?.user ?? null);
      refreshMemberships();
    });

    return () => {
      cancelled = true;
      subscription?.subscription?.unsubscribe();
    };
  }, [refreshMemberships]);

  useEffect(() => {
    if (!initializing) {
      refreshMemberships();
    }
  }, [initializing, refreshMemberships, user?.id]);

  const roleForActiveOrg = useMemo(() => {
    if (!activeOrgId) return null;
    const match = memberships.find((m) => m.org_id === activeOrgId);
    return match?.role ?? null;
  }, [activeOrgId, memberships]);

  const hasPermission = useCallback(async (orgId, permKey) => {
    if (!orgId || !permKey) return false;
    const { data, error } = await supabase.rpc('has_permission', {
      p_org_id: orgId,
      p_perm: permKey,
    });
    if (error) {
      console.error('[AuthProvider] has_permission failed', error);
      return false;
    }
    return data === true;
  }, []);

  const value = useMemo(
    () => ({
      session,
      user,
      activeOrgId,
      setActiveOrgId: setActiveOrgIdSafe,
      memberships,
      roleForActiveOrg,
      hasPermission,
      refreshMemberships,
      initializing,
      membershipsLoading,
    }),
    [
      activeOrgId,
      hasPermission,
      memberships,
      membershipsLoading,
      refreshMemberships,
      roleForActiveOrg,
      session,
      setActiveOrgIdSafe,
      user,
      initializing,
    ],
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
