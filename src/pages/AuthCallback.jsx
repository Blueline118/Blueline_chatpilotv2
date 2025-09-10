// src/pages/AuthCallback.jsx
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';

export default function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      const hashParams = new URLSearchParams(window.location.hash.slice(1));
      const searchParams = new URLSearchParams(window.location.search);

      const access_token = hashParams.get('access_token');
      const refresh_token = hashParams.get('refresh_token');
      const code = searchParams.get('code');

      // Debug: zie je tokens binnenkomen?
      console.log('[AuthCallback] has access_token?', !!access_token, 'has code?', !!code);

      try {
        if (access_token && refresh_token) {
          const { error } = await supabase.auth.setSession({ access_token, refresh_token });
          if (error) throw error;
        } else if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else {
          await supabase.auth.getSession();
        }
      } catch (e) {
        console.error('Auth callback error:', e);
      } finally {
        navigate('/app', { replace: true });
      }
    })();
  }, [navigate]);

  return <div style={{ padding: 24 }}>Bezig met inloggen…</div>;
}
