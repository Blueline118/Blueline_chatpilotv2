// src/pages/AuthCallback.jsx
import { useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function AuthCallback() {
  useEffect(() => {
    (async () => {
      try {
        const url = new URL(window.location.href);
        const hasCode = url.searchParams.get('code');
        const hash = url.hash;

        // 1) OAuth PKCE: code → sessie
        if (hasCode) {
          const { error } = await supabase.auth.exchangeCodeForSession(window.location.href);
          if (error) console.error('exchangeCode error', error);
          window.location.replace('/app');
          return;
        }

        // 2) Magic-link (hash tokens): geef Supabase heel even
        if (hash && hash.includes('access_token=')) {
          await new Promise((r) => setTimeout(r, 50));
          window.location.replace('/app');
          return;
        }

        // 3) Fallback
        window.location.replace('/app');
      } catch (e) {
        console.error('AuthCallback error', e);
        window.location.replace('/app');
      }
    })();
  }, []);

  return null;
}
