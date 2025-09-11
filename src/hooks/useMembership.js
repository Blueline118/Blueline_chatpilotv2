// src/hooks/useMembership.js
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../providers/AuthProvider';

export function useMembership() {
  const { activeOrgId, user } = useAuth();
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(!!activeOrgId);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!activeOrgId || !user?.id) {
        setRole(null);
        setLoading(false);
        setError(null);
        return;
      }
      setLoading(true);
      setError(null);

      // Belangrijk: filter óók op user_id, zodat er precies 1 rij terugkomt
      const { data, error } = await supabase
        .from('memberships')
        .select('role')
        .eq('org_id', activeOrgId)
        .eq('user_id', user.id)
        .single();

      if (cancelled) return;

      if (error) {
        setError(error);
        setRole(null);
      } else {
        setRole(data?.role ?? null);
      }
      setLoading(false);
    }

    run();
    return () => { cancelled = true; };
  }, [activeOrgId, user?.id]);

  return { role, loading, error };
}
