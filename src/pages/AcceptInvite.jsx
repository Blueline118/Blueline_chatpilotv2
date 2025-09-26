import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';

export default function AcceptInvite() {
  const location = useLocation();

  // Token 1x uit URL lezen
  const tokenFromUrl = useMemo(() => {
    const qs = new URLSearchParams(location.search);
    return qs.get('token');
  }, [location.search]);

  // Bewaar token zodat callback-redirect niet stukloopt als de URL ‘m verliest
  useEffect(() => {
    if (tokenFromUrl) sessionStorage.setItem('pendingInviteToken', tokenFromUrl);
  }, [tokenFromUrl]);

  // Fallback op opgeslagen token
  const token = tokenFromUrl || sessionStorage.getItem('pendingInviteToken') || null;

  const [status, setStatus] = useState(() =>
    token ? 'Uitnodiging accepteren…' : 'Ongeldige of ontbrekende uitnodiging.'
  );

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!token) {
        setStatus('Ongeldige of ontbrekende uitnodiging.');
        return;
      }

      setStatus('Uitnodiging accepteren…');

      try {
        const { data } = await supabase.auth.getSession();
        const accessToken = data?.session?.access_token || null;

        if (!accessToken) {
          const acceptPath = `/accept-invite?token=${encodeURIComponent(token)}`;
          const next = encodeURIComponent(acceptPath);
          setStatus('Log in om de uitnodiging te accepteren.');
          window.location.assign(`/login?next=${next}`);
          return;
        }

        const headers = {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        };

        const res = await fetch('/.netlify/functions/invites-accept', {
          method: 'POST',
          headers,
          body: JSON.stringify({ token, noRedirect: true }),
        });

        if (cancelled) return;

        if (res.status === 200) {
          const payload = await res.json().catch(() => ({}));
          const to = typeof payload?.redirectTo === 'string' ? payload.redirectTo : '/app';
          setStatus('Uitnodiging geaccepteerd. Doorgaan…');
          sessionStorage.removeItem('pendingInviteToken');
          window.location.assign(to);
          return;
        }

        if (res.status === 409) {
          setStatus('Uitnodiging was al gebruikt. Doorgaan…');
          sessionStorage.removeItem('pendingInviteToken');
          window.location.assign('/app');
          return;
        }

        if (res.status === 401) {
          const acceptPath = `/accept-invite?token=${encodeURIComponent(token)}`;
          const next = encodeURIComponent(acceptPath);
          setStatus('Log in om de uitnodiging te accepteren.');
          window.location.assign(`/login?next=${next}`);
          return;
        }

        const payload = await res.json().catch(() => ({}));
        setStatus(payload?.error || 'Kon uitnodiging niet accepteren.');
      } catch (e) {
        if (!cancelled) {
          console.warn('[AcceptInvite] unexpected error', e);
          setStatus('Onverwachte fout bij accepteren.');
        }
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div style={{ maxWidth: 420, margin: '64px auto', padding: 24 }}>
      <h1>Uitnodiging accepteren…</h1>
      <p>{status}</p>
    </div>
  );
}
