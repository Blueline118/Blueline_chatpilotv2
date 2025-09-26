import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';

/**
 * AcceptInvite.jsx
 * - Bewaart het invite-token over login round-trips (sessionStorage)
 * - POST naar /.netlify/functions/invites-accept met noRedirect=true
 * - 200 (OK) en 409 (al gebruikt) => success-pad met redirect naar /app
 * - 401/403 => door naar /login?next=<huidige accept-invite route + token>
 */
export default function AcceptInvite() {
  const location = useLocation();

  // 1) Token éénmalig uit de URL lezen
  const tokenFromUrl = useMemo(() => {
    const qs = new URLSearchParams(location.search);
    const t = qs.get('token');
    return t && typeof t === 'string' ? t : null;
  }, [location.search]);

  // 2) Token in sessionStorage bewaren (overleeft login-callback)
  useEffect(() => {
    if (tokenFromUrl) sessionStorage.setItem('pendingInviteToken', tokenFromUrl);
  }, [tokenFromUrl]);

  // 3) Uiteindelijk te gebruiken token
  const token = tokenFromUrl || sessionStorage.getItem('pendingInviteToken') || null;

  const [status, setStatus] = useState(
    token ? 'Bezig met uitnodiging accepteren…' : 'Ongeldige link: token ontbreekt.'
  );

  // Guard tegen dubbele requests
  const inFlight = useRef(false);

  function redirectToLogin() {
    const next = encodeURIComponent(`/accept-invite?token=${encodeURIComponent(token || '')}`);
    window.location.assign(`/login?next=${next}`);
  }

  async function acceptOnce(inviteToken, accessToken) {
    const headers = { 'Content-Type': 'application/json' };
    if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

    const res = await fetch('/.netlify/functions/invites-accept', {
      method: 'POST',
      headers,
      body: JSON.stringify({ token: inviteToken, noRedirect: true }),
    });

    // 401/403 => (nog) niet ingelogd
    if (res.status === 401 || res.status === 403) {
      setStatus('Inloggen vereist om uitnodiging te accepteren…');
      redirectToLogin();
      return;
    }

    // 200 => succes (met redirectTo in body, anders /app)
    if (res.status === 200) {
      let to = '/app';
      try {
        const data = await res.json();
        if (data && typeof data.redirectTo === 'string' && data.redirectTo) {
          to = data.redirectTo;
        }
      } catch {}
      setStatus('Uitnodiging geaccepteerd. Doorgaan…');
      sessionStorage.removeItem('pendingInviteToken');
      window.location.assign(to);
      return;
    }

    // 409 => al gebruikt (zachte success)
    if (res.status === 409) {
      setStatus('Uitnodiging was al gebruikt. Doorgaan…');
      sessionStorage.removeItem('pendingInviteToken');
      setTimeout(() => window.location.assign('/app'), 300);
      return;
    }

    // Overige fouten => toon serverboodschap indien beschikbaar
    let msg = 'Kon uitnodiging niet accepteren.';
    try {
      const data = await res.json();
      if (data?.error) msg = data.error;
    } catch {}
    setStatus(msg);
  }

  // Main effect: probeer met bestaande sessie; anders naar login met next
  useEffect(() => {
    if (!token) return;
    if (inFlight.current) return;
    inFlight.current = true;

    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const access = data?.session?.access_token || null;

        if (access) {
          await acceptOnce(token, access);
        } else {
          setStatus('Inloggen vereist om uitnodiging te accepteren…');
          redirectToLogin();
        }
      } catch {
        setStatus('Onverwachte fout bij accepteren.');
      } finally {
        inFlight.current = false;
      }
    })();
  }, [token]);

  return <div>{status}</div>;
}
