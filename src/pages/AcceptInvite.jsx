import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';

export default function AcceptInvite() {
  const location = useLocation();

  // Token uit URL (één keer evalueren)
  const tokenFromUrl = useMemo(() => {
    const qs = new URLSearchParams(location.search);
    const t = qs.get('token');
    return t && typeof t === 'string' ? t : null;
  }, [location.search]);

  // Token bewaren over login round-trip
  useEffect(() => {
    if (tokenFromUrl) {
      sessionStorage.setItem('pendingInviteToken', tokenFromUrl);
    }
  }, [tokenFromUrl]);

  // Fallback uit sessionStorage als URL 'm kwijt is (na callback)
  const token = tokenFromUrl || sessionStorage.getItem('pendingInviteToken') || null;

  const [status, setStatus] = useState(
    token ? 'Bezig met uitnodiging accepteren…' : 'Ongeldige link: token ontbreekt.'
  );

  // Automatisch proberen te accepteren zodra we een sessie hebben
  useEffect(() => {
    const sub = supabase.auth.onAuthStateChange(async (_evt, sess) => {
      const t = token || sessionStorage.getItem('pendingInviteToken');
      if (!t || !sess?.access_token) return;
      await acceptWithSession(t, sess.access_token);
    });
    return () => sub.data?.subscription?.unsubscribe?.();
  }, [token]);

  // Eerste poging bij binnenkomst
  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!token) {
        setStatus('Ongeldige link: token ontbreekt.');
        return;
      }

      setStatus('Bezig met uitnodiging accepteren…');

      // Hebben we al een sessie?
      const { data } = await supabase.auth.getSession();
      const access = data?.session?.access_token;

      if (!access) {
        // Niet ingelogd → naar login sturen met next= huidige url
        const next = encodeURIComponent(window.location.pathname + window.location.search);
        setStatus('Inloggen vereist om de uitnodiging te accepteren…');
        window.location.assign(`/login?next=${next}`);
        return;
      }

      if (!cancelled) {
        await acceptWithSession(token, access);
      }
    }

    run();

    return () => {
      cancelled = true;
    };
  }, [token, location.pathname, location.search]);

  async function acceptWithSession(inviteToken, accessToken) {
    try {
      const res = await fetch('/.netlify/functions/invites-accept', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ token: inviteToken, noRedirect: true }),
      });

      // 401/403 race: heel kort wachten en 1x opnieuw proberen
      if (res.status === 401 || res.status === 403) {
        await new Promise((r) => setTimeout(r, 700));
        const { data: d2 } = await supabase.auth.getSession();
        const access2 = d2?.session?.access_token;
        if (!access2) {
          setStatus('Log in om de uitnodiging te accepteren.');
          return;
        }
        const res2 = await fetch('/.netlify/functions/invites-accept', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${access2}`,
          },
          body: JSON.stringify({ token: inviteToken, noRedirect: true }),
        });
        if (!res2.ok) {
          const err2 = await safeJson(res2);
          setStatus(err2?.error || 'Kon uitnodiging niet accepteren.');
          return;
        }
        // success
        await onAccepted();
        return;
      }

      if (!res.ok) {
        const err = await safeJson(res);
        setStatus(err?.error || 'Kon uitnodiging niet accepteren.');
        return;
      }

      await onAccepted();
    } catch {
      setStatus('Onverwachte fout bij accepteren.');
    }
  }

  async function onAccepted() {
    setStatus('Uitnodiging geaccepteerd. Je wordt doorgestuurd…');
    sessionStorage.removeItem('pendingInviteToken');
    // Kleine delay voor UX, daarna naar leden
    setTimeout(() => {
      window.location.assign('/app/members');
    }, 1200);
  }

  async function safeJson(res) {
    try {
      return await res.json();
    } catch {
      return null;
    }
  }

  return <div>{status}</div>;
}
