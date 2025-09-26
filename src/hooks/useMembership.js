// src/hooks/useMembership.js
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../providers/AuthProvider';

const ACTIVE_ORG_KEY = 'activeOrgId';

async function fetchFirstMembership(userId) {
  const { data, error } = await supabase
    .from('memberships')
    .select('org_id, role, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1);
  if (error) throw error;
  return Array.isArray(data) && data.length ? data[0] : null;
}

async function fetchRole(userId, orgId) {
  const { data, error } = await supabase
    .from('memberships')
    .select('role')
    .eq('user_id', userId)
    .eq('org_id', orgId)
    .maybeSingle();
  if (error) throw error;
  return data?.role ?? null;
}

/**
 * useMembership
 * - Bepaalt een actieve org (volgorde: meegegeven orgId → sessionStorage → eerste membership)
 * - Haalt de rol op voor die org
 * - Slaat activeOrgId op in sessionStorage zodat de UI consistent blijft
 */
export function useMembership(orgIdFromProps = null) {
  const { user } = useAuth();
  const [orgId, setOrgId] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // init orgId keuze
  useEffect(() => {
    if (!user) {
      setOrgId(null);
      setRole(null);
      setLoading(false);
      return;
    }
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setError('');

        // 1) Use explicit orgId if provided
        let chosenOrg = orgIdFromProps;

        // 2) Else, from sessionStorage
        if (!chosenOrg) {
          const stored = sessionStorage.getItem(ACTIVE_ORG_KEY);
          if (stored) chosenOrg = stored;
        }

        // 3) Else, pick first membership
        if (!chosenOrg) {
          const first = await fetchFirstMembership(user.id);
          if (first) chosenOrg = first.org_id;
        }

        if (!chosenOrg) {
          // user heeft geen memberships
          if (!cancelled) {
            setOrgId(null);
            setRole(null);
            setLoading(false);
          }
          return;
        }

        sessionStorage.setItem(ACTIVE_ORG_KEY, chosenOrg);

        const r = await fetchRole(user.id, chosenOrg);

        if (!cancelled) {
          setOrgId(chosenOrg);
          setRole(r);
          setLoading(false);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e?.message || 'Kon membership niet ophalen');
          setOrgId(null);
          setRole(null);
          setLoading(false);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [user, orgIdFromProps]);

  const isAdmin = useMemo(() => role === 'ADMIN', [role]);

  return { orgId, role, isAdmin, loading, error };
}
