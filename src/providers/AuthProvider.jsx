// src/providers/AuthProvider.jsx
import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [activeOrgId, setActiveOrgId] = useState(
    () => localStorage.getItem('activeOrgId') || null
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // eerste load
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);
    });
    // luistert op wijzigingen
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, sess) => {
      setSession(sess);
      setUser(sess?.user ?? null);
    });
    return () => sub?.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (activeOrgId) localStorage.setItem('activeOrgId', activeOrgId);
    else localStorage.removeItem('activeOrgId');
  }, [activeOrgId]);

  useEffect(() => {
    if (!user) {
      setActiveOrgId(null);
    }
  }, [user]);

  // ✅ Auto-heal: kies automatisch een geldige workspace (org) voor de ingelogde user
  useEffect(() => {
    let on = true;

    async function ensureOrg() {
      if (!user?.id) return; // niet ingelogd → niets doen

      const { data, error } = await supabase
        .from('memberships')
        .select('org_id')
        .eq('user_id', user.id);

      if (!on || error) return;

      const orgIds = (data || []).map(r => r.org_id);

      if (orgIds.length === 0) {
        // user heeft (nog) geen memberships → clear
        if (on) setActiveOrgId(null);
        return;
      }

      // Geen selectie of een verouderde selectie? Neem de eerste geldige org.
      if (!activeOrgId || !orgIds.includes(activeOrgId)) {
        if (on) setActiveOrgId(orgIds[0]);
      }
    }

    ensureOrg();
    return () => { on = false; };
  }, [user?.id, activeOrgId]);

  const value = { session, user, activeOrgId, setActiveOrgId, loading };
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
