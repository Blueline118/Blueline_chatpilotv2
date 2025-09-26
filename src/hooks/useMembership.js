// src/hooks/useMembership.js
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../providers/AuthProvider';

export function useMembership() {
  const { user, activeOrgId, setActiveOrgId } = useAuth();
  const [memberships, setMemberships] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function loadMemberships() {
      if (!user?.id) {
        if (!cancelled) {
          setMemberships([]);
          setError(null);
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const { data, error: fetchError } = await supabase
          .from('memberships')
          .select('org_id, role')
          .eq('user_id', user.id)
          .order('created_at', { ascending: true });

        if (fetchError) throw fetchError;
        if (cancelled) return;

        const rows = Array.isArray(data) ? data : [];
        setMemberships(rows);
      } catch (e) {
        if (!cancelled) {
          setMemberships([]);
          setError(e?.message || 'Kon memberships niet laden');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadMemberships();
    return () => { cancelled = true; };
  }, [user?.id]);

  useEffect(() => {
    if (!activeOrgId && memberships.length > 0) {
      setActiveOrgId(memberships[0].org_id);
    }
  }, [activeOrgId, memberships, setActiveOrgId]);

  const role = useMemo(() => {
    if (!activeOrgId) return null;
    const row = memberships.find((m) => m.org_id === activeOrgId);
    return row?.role ?? null;
  }, [activeOrgId, memberships]);

  return { orgId: activeOrgId, role, loading, error };
}
