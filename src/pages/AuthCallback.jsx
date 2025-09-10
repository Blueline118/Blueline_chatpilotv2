// src/pages/AuthCallback.jsx
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';

export default function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      // 1) Probeer tokens uit hash te lezen (#access_token=...&refresh_token=...)
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      const access_token = hashParams.get('access_token');
      const refresh_token = hashParams.get('refresh_token');

      // 2) Sommige providers gebruiken ?code=... (PKCE). Vangen we ook af:
      const searchParams = new URLSearchParams(window.location.search);
      const code = searchParams.get('code');

      try {
        if (access_token && refresh_token) {
          // Magic link stijl
          const { error } = await supabase.auth.setSession({ access_token, refresh_token });
          if (error) throw error;
        } else if (code) {
          // OAuth/PKCE stijl
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else {
          // fallback: misschien is sessie al gezet
          await supabase.auth.getSession();
        }
      } catch (e) {
        console.error('Auth callback error:', e);
      }

      // 3) Schoon URL op (geen tokens in de adresbalk) en ga naar /app
      navigate('/app', { replace: true });
    })();
  }, [navigate]);

  return <div style={{ padding: 24 }}>Bezig met inloggen…</div>;
}
