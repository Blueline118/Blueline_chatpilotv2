// src/components/AuthStatus.jsx
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function AuthStatus() {
  const [status, setStatus] = useState({ user: null, hasToken: false, loading: true });

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      const lsKeys = Object.keys(localStorage || {});
      const sbKey = lsKeys.find(k => k.includes('sb-') && k.includes('-auth-token'));
      setStatus({
        user: data.session?.user ?? null,
        hasToken: !!sbKey,
        loading: false
      });
      // Debug zichtbaar in Console
      console.log('[AuthStatus]', { session: data.session, localStorageKey: sbKey });
    })();
  }, []);

  if (status.loading) return null;

  return (
    <div style={{fontSize:12, padding:8, border:'1px dashed #bbb', borderRadius:8, margin:'8px 0'}}>
      <b>AuthStatus</b><br/>
      user: {status.user ? status.user.email : '—'}<br/>
      token in localStorage: {status.hasToken ? 'ja' : 'nee'}
    </div>
  );
}
