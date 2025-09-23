// src/pages/AuthCallback.jsx
import { useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { DEFAULT_AFTER_LOGIN, resolveNextPath } from '../lib/resolveNextPath';

export default function AuthCallback() {
  useEffect(() => {
    (async () => {
      try {
        const url = new URL(window.location.href);
        const hasCode = url.searchParams.get('code');
        const hash = url.hash;
        const nextParam = url.searchParams.get('next');
        const nextPath = resolveNextPath(nextParam) ?? DEFAULT_AFTER_LOGIN;

        // 1) OAuth PKCE: code → sessie
        if (hasCode) {
          const { error } = await supabase.auth.exchangeCodeForSession(window.location.href);
          if (error) console.error('exchangeCode error', error);
          window.location.replace(nextPath);
          return;
        }

        // 2) Magic-link (hash tokens): geef Supabase heel even
        if (hash && hash.includes('access_token=')) {
          await new Promise((r) => setTimeout(r, 50));
          window.location.replace(nextPath);
          return;
        }

        // 3) Fallback
        window.location.replace(nextPath);
      } catch (e) {
        console.error('AuthCallback error', e);
        window.location.replace(DEFAULT_AFTER_LOGIN);
      }
    })();
  }, []);

  return null;
}
