// src/hooks/useMembership.js
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

const LS_KEY = 'blueline.activeOrgId';

export function useMembership() {
  const [loading, setLoading] = useState(true);
  const [activeOrgId, setActiveOrgId] = useState(() => {
    try { return localStorage.getItem(LS_KEY) || null; } catch { return null; }
  });
  const [memberships, setMemberships] = useState([]);
  const [error, setError] = useState(null);

  // laad memberships van ingelogde user (RLS haalt dat al af)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const userId = sessionData?.session?.user?.id || null;
        if (!userId) {
          setMemberships([]);
          setLoading(false);
          return;
        }

        const { data, error: rlsErr } = await supabase
          .from('memberships')
          .select('org_id, role')
          .order('created_at', { ascending: true }); // oudste eerst

        if (rlsErr) throw rlsErr;
        if (cancelled) return;

        setMemberships(Array.isArray(data) ? data : []);
      } catch (e) {
        if (!cancelled) setError(e?.message || 'Kon memberships niet laden');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  // kies automatisch een org als er precies 1 is of als de huidige niet (meer) bestaat
  useEffect(() => {
    if (loading) return;

    const has = (orgId) => memberships.some(m => m.org_id === orgId);
    if (!memberships.length) {
      // geen lid van iets
      if (activeOrgId) {
        setActiveOrgId(null);
        try { localStorage.removeItem(LS_KEY); } catch {}
      }
      return;
    }

    // als niets gekozen is: kies de enige, of de eerste
    if (!activeOrgId) {
      const pick = memberships.length === 1 ? memberships[0].org_id : memberships[0].org_id;
      setActiveOrgId(pick);
      try { localStorage.setItem(LS_KEY, pick); } catch {}
      return;
    }

    // gekozen org bestaat niet meer? corrigeer
    if (!has(activeOrgId)) {
      const pick = memberships[0].org_id;
      setActiveOrgId(pick);
      try { localStorage.setItem(LS_KEY, pick); } catch {}
    }
  }, [loading, memberships, activeOrgId]);

  // expose rol van de actieve org (of null)
  const role = useMemo(() => {
    if (!activeOrgId) return null;
    const m = memberships.find(x => x.org_id === activeOrgId);
    return m?.role ?? null;
  }, [activeOrgId, memberships]);

  // helper om expliciet te wisselen (mocht je later een switcher bouwen)
  const setActive = (orgId) => {
    setActiveOrgId(orgId || null);
    try {
      if (orgId) localStorage.setItem(LS_KEY, orgId);
      else localStorage.removeItem(LS_KEY);
    } catch {}
  };

  return { loading, error, activeOrgId, role, memberships, setActiveOrgId: setActive };
}
