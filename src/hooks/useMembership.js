// src/hooks/useMembership.js
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

const LS_KEY = 'blueline.activeOrgId';

function readStoredOrg() {
  try {
    return localStorage.getItem(LS_KEY) || null;
  } catch {
    return null;
  }
}

function writeStoredOrg(value) {
  try {
    if (value) localStorage.setItem(LS_KEY, value);
    else localStorage.removeItem(LS_KEY);
  } catch {}
}

function pickOrgId(current, list) {
  if (!Array.isArray(list) || list.length === 0) {
    return null;
  }

  const hasCurrent = current && list.some((m) => m?.org_id === current);
  if (hasCurrent) {
    return current;
  }

  const first = list.find((m) => m && m.org_id);
  return first ? first.org_id : null;
}

export function useMembership() {
  const [memberships, setMemberships] = useState([]);
  const [orgId, setOrgId] = useState(() => readStoredOrg());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (cancelled) return;
      setLoading(true);
      setError(null);

      try {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;

        const userId = sessionData?.session?.user?.id || null;
        if (!userId) {
          if (cancelled) return;
          setMemberships([]);
          setOrgId((prev) => {
            if (prev !== null) writeStoredOrg(null);
            return null;
          });
          setLoading(false);
          return;
        }

        const { data, error: membershipsError } = await supabase
          .from('memberships')
          .select('org_id, role')
          .eq('user_id', userId)
          .order('created_at', { ascending: true });

        if (membershipsError) throw membershipsError;
        if (cancelled) return;

        const list = Array.isArray(data) ? data : [];
        setMemberships(list);
        setOrgId((prev) => {
          const next = pickOrgId(prev, list);
          if (next !== prev) {
            writeStoredOrg(next);
          }
          return next;
        });
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        setError(err?.message || 'Kon memberships niet laden');
        setMemberships([]);
        setOrgId((prev) => {
          if (prev !== null) writeStoredOrg(null);
          return null;
        });
        setLoading(false);
      }
    }

    load();
    const { data: authSub } = supabase.auth.onAuthStateChange(() => {
      load();
    });

    return () => {
      cancelled = true;
      authSub?.subscription?.unsubscribe();
    };
  }, []);

  const setActive = useCallback((nextOrgId) => {
    setOrgId((prev) => {
      const normalized = nextOrgId || null;
      if (prev === normalized) return prev;
      writeStoredOrg(normalized);
      return normalized;
    });
  }, []);

  const role = useMemo(() => {
    if (!orgId) return null;
    const match = memberships.find((m) => m?.org_id === orgId);
    return match?.role ?? null;
  }, [orgId, memberships]);

  return {
    loading,
    error,
    orgId,
    activeOrgId: orgId,
    role,
    memberships,
    setActiveOrgId: setActive,
  };
}
