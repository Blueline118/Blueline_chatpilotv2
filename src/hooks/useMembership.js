// src/hooks/useMembership.js
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../providers/AuthProvider';

export function useMembership() {
  const { activeOrgId } = useAuth();
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(!!activeOrgId);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (!activeOrgId) {
      setRole(null);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    (async () => {
      const { data, error } = await supabase
        .from('memberships')
        .select('role')
        .eq('org_id', activeOrgId)
        .single();
      if (cancelled) return;
      if (error) {
        setError(error);
        setRole(null);
      } else {
        setRole(data?.role ?? null);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [activeOrgId]);

  return { role, loading, error };
}
