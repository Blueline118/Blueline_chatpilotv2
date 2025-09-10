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

  const value = { session, user, activeOrgId, setActiveOrgId, loading };
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
