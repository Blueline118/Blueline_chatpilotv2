// src/hooks/useMembership.js
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../providers/AuthProvider';

/**
 * useMembership
 * - Leest memberships voor de huidige gebruiker (RLS-proof).
 * - Stelt (indien nog leeg) automatisch een actieve org in via AuthProvider.
 * - Geeft de rol + activeOrgId terug voor UI.
 *
 * Return shape:
 * { role, activeOrgId, loading, error }
 */
export function useMembership() {
  const { user, activeOrgId, setActiveOrgId } = useAuth?.() ?? {};
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        setLoading(true);
        setError(null);

        // Bepaal user-id (val terug op supabase.auth.getUser voor zekerheid)
        let uid = user?.id ?? null;
        if (!uid) {
          const { data } = await supabase.auth.getUser();
          uid = data?.user?.id ?? null;
        }
        if (!uid) {
          // niet ingelogd
          if (!cancelled) {
            setRole(null);
            setLoading(false);
          }
          return;
        }

        // Haal memberships op voor deze user
        const { data: rows, error: qErr } = await supabase
          .from('memberships')
          .select('org_id, role, created_at')
          .eq('user_id', uid)
          .order('created_at', { ascending: true });

        if (qErr) throw qErr;

        const list = Array.isArray(rows) ? rows : [];
        const first = list[0] || null;

        // Als er nog geen actieve org gekozen is: kies de eerste
        if (!activeOrgId && first?.org_id) {
          setActiveOrgId?.(first.org_id);
        }

        // Zet rol o.b.v. actieve org (of fallback: eerste)
        let effectiveRole = null;
        if (activeOrgId) {
          const hit = list.find((m) => m.org_id === activeOrgId) || null;
          effectiveRole = hit?.role ?? null;
        } else {
          effectiveRole = first?.role ?? null;
        }

        if (!cancelled) setRole(effectiveRole);
      } catch (e) {
        if (!cancelled) {
          setError(e?.message || String(e));
          setRole(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => { cancelled = true; };
    // herhaal wanneer user-id of activeOrgId wijzigt
  }, [user?.id, activeOrgId, setActiveOrgId]);

  return { role, activeOrgId: activeOrgId ?? null, loading, error };
}

// (optioneel) default export voor gemak in sommige imports
export default useMembership;
