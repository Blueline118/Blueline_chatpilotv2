import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { DEFAULT_AFTER_LOGIN, resolveNextPath } from '../lib/resolveNextPath';

export default function AuthCallback() {
  const location = useLocation();
  const navigate = useNavigate();

  const next = useMemo(() => {
    const qs = new URLSearchParams(location.search);
    return resolveNextPath(qs.get('next')) ?? DEFAULT_AFTER_LOGIN;
  }, [location.search]);

  const [msg, setMsg] = useState('Bezig met inloggen…');

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        const qs = new URLSearchParams(location.search);
        const hash = new URLSearchParams(location.hash.replace(/^#/, ''));

        // 1) Supabase error direct uit URL tonen
        const errorDesc = qs.get('error_description') || hash.get('error_description');
        if (errorDesc) {
          setMsg(errorDesc);
          return;
        }

        // 2) Als er al een sessie is, meteen door
        const sess0 = await supabase.auth.getSession();
        if (sess0?.data?.session) {
          if (!cancelled) navigate(next, { replace: true });
          return;
        }

        // 3) Code exchange flow (aanbevolen)
        const authCode = qs.get('code');
        if (authCode) {
          const { error } = await supabase.auth.exchangeCodeForSession({ code: authCode });
          if (error) {
            setMsg(error.message || 'Kon sessie niet opzetten (code exchange).');
            return;
          }
          // korte delay voor cookie/write
          await new Promise((r) => setTimeout(r, 150));
          if (!cancelled) navigate(next, { replace: true });
          return;
        }

        // 4) Hash token fallback (minder gebruikelijk, maar ondersteunen we)
        const access_token = hash.get('access_token');
        const refresh_token = hash.get('refresh_token');
        if (access_token && refresh_token) {
          const { error } = await supabase.auth.setSession({ access_token, refresh_token });
          if (error) {
            setMsg(error.message || 'Kon sessie niet opzetten (hash tokens).');
            return;
          }
          await new Promise((r) => setTimeout(r, 150));
          if (!cancelled) navigate(next, { replace: true });
          return;
        }

        // 5) Laatste retry-pad: wacht even en check nogmaals sessie
        await new Promise((r) => setTimeout(r, 300));
        const sess1 = await supabase.auth.getSession();
        if (sess1?.data?.session) {
          if (!cancelled) navigate(next, { replace: true });
          return;
        }

        // 6) Geen sessie/tokens → terug naar login, maar behoud next
        setMsg('Geen sessie gevonden. Opnieuw inloggen…');
        if (!cancelled) navigate(`/login?next=${encodeURIComponent(next)}&intent=1`, { replace: true });
      } catch (e) {
        setMsg('Onverwachte fout tijdens login callback.');
      }
    }

    run();
    return () => { cancelled = true; };
  }, [location.search, location.hash, navigate, next]);

  return (
    <div style={{ maxWidth: 420, margin: '64px auto', padding: 24 }}>
      <h1>Bezig met inloggen…</h1>
      <p>{msg}</p>
    </div>
  );
}
