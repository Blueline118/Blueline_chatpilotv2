import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';

export default function AcceptInvite() {
  const location = useLocation();
  const navigate = useNavigate();

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

  // Guard om dubbele POSTs te voorkomen
  const inFlight = useRef(false);

  async function acceptWithAccessToken(inviteToken, accessToken) {
    if (inFlight.current) return;
    inFlight.current = true;

    try {
      const res = await fetch('/.netlify/functions/invites-accept', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ token: inviteToken, noRedirect: true }),
      });

      // 200 => succes, 409 => al gebruikt (behandel als soft success)
      if (res.status === 200) {
        const data = await res.json().catch(() => ({}));
        const to = typeof data?.redirectTo === 'string' ? data.redirectTo : '/app/members';
        setStatus('Uitnodiging geaccepteerd. Doorgaan…');
        sessionStorage.removeItem('pendingInviteToken');
        window.location.assign(to);
        return;
      }

      if (res.status === 409) {
        setStatus('Uitnodiging was al gebruikt. Doorgaan…');
        sessionStorage.removeItem('pendingInviteToken');
        setTimeout(() => window.location.assign('/app/members'), 300);
        return;
      }

      if (res.status === 401) {
        const next = encodeURIComponent(window.location.pathname + window.location.search);
        setStatus('Log in om de uitnodiging te accepteren.');
        window.location.assign(`/login?next=${next}`);
        return;
      }

      const data = await res.json().catch(() => ({}));
      setStatus(data?.error || 'Kon uitnodiging niet accepteren.');
    } catch {
      setStatus('Onverwachte fout bij accepteren.');
    } finally {
      inFlight.current = false;
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!token) {
        setStatus('Ongeldige of ontbrekende uitnodiging.');
        return;
      }

      setStatus('Uitnodiging accepteren…');

      // 1) Hebben we al een sessie?
      const d1 = await supabase.auth.getSession().catch(() => null);
      const access1 = d1?.data?.session?.access_token;

      if (cancelled) return;

      if (access1) {
        await acceptWithAccessToken(token, access1);
        return;
      }

      // 2) Geen sessie? korte retry (cookie-lag na callback)
      await new Promise((r) => setTimeout(r, 300));
      const d2 = await supabase.auth.getSession().catch(() => null);
      const access2 = d2?.data?.session?.access_token;

      if (cancelled) return;

      if (access2) {
        await acceptWithAccessToken(token, access2);
        return;
      }

      // 3) Nog steeds geen sessie -> naar login met next terug naar deze pagina
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      setStatus('Log in om de uitnodiging te accepteren.');
      window.location.assign(`/login?next=${next}`);
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [token, location.pathname, location.search]); // token & URL veranderingen

  return (
    <div style={{ maxWidth: 420, margin: '64px auto', padding: 24 }}>
      <h1>Uitnodiging accepteren…</h1>
      <p>{status}</p>
    </div>
  );
}
