import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';

/**
 * AcceptInvite.jsx
 * - Bewaart het invite-token over login round-trips heen (sessionStorage)
 * - Probeert de invite via Netlify function POST te accepteren met Bearer JWT
 * - Behandelt 200 (ok) en 409 (al gebruikt) als success-path en redirect naar /app
 * - Verwijst niet-gelogde gebruikers naar /login?next=... met originele token-route
 */
export default function AcceptInvite() {
  const location = useLocation();
  const navigate = useNavigate();

  // 1) Token éénmalig uit de URL lezen
  const tokenFromUrl = useMemo(() => {
    const qs = new URLSearchParams(location.search);
    const t = qs.get('token');
    return t && typeof t === 'string' ? t : null;
  }, [location.search]);

  // 2) Token persistenter maken zodat login-callback geen problemen geeft
  useEffect(() => {
    if (tokenFromUrl) sessionStorage.setItem('pendingInviteToken', tokenFromUrl);
  }, [tokenFromUrl]);

  // 3) Ultimately te gebruiken token (URL > sessionStorage > null)
  const token = tokenFromUrl || sessionStorage.getItem('pendingInviteToken') || null;

  const [status, setStatus] = useState(
    token ? 'Bezig met uitnodiging accepteren…' : 'Ongeldige link: token ontbreekt.'
  );

  // Guard tegen dubbele calls bij route-renders
  const inFlight = useRef(false);

  // Helper: login redirect met next terug naar deze pagina + token
  function redirectToLogin() {
    const next = encodeURIComponent(`/accept-invite?token=${encodeURIComponent(token || '')}`);
    // optioneel kun je `intent=1` toevoegen zodat Login-pagina weet dat dit user-initiated is
    window.location.assign(`/login?next=${next}`);
  }

  // Eénmalige accept-call
  async function acceptOnce(inviteToken, accessToken) {
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

      const res = await fetch('/.netlify/functions/invites-accept', {
        method: 'POST',
        headers,
        body: JSON.stringify({ token: inviteToken, noRedirect: true }),
      });


      // 401/403 → (nog) niet ingelogd


      // 200 => succes, 409 => al gebruikt (behandel als soft success)
      if (res.status === 200) {
        const data = await res.json().catch(() => ({}));
        const to = typeof data?.redirectTo === 'string' ? data.redirectTo : '/app';
        setStatus('Uitnodiging geaccepteerd. Doorgaan…');
        sessionStorage.removeItem('pendingInviteToken');
        window.location.assign(to);
        return;
      }

      if (res.status === 409) {
        setStatus('Uitnodiging was al gebruikt. Doorgaan…');
        sessionStorage.removeItem('pendingInviteToken');
        setTimeout(() => window.location.assign('/app'), 300);
        return;
      }

      if (res.status === 401) {
        const next = encodeURIComponent(window.location.pathname + window.location.search);
        setStatus('Log in om de uitnodiging te accepteren.');
        window.location.assign(`/login?next=${next}`);

      // Race-conditie: sessie nét niet klaar → korte retry (exact 1x)

      if (res.status === 401 || res.status === 403) {
        setStatus('Inloggen vereist om uitnodiging te accepteren…');
        redirectToLogin();
        return;
      }

      // 409 = al gebruikt → behandel als zachte success (idempotent)
      if (res.status === 409) {
        setStatus('Uitnodiging was al gebruikt. Doorgaan…');
        sessionStorage.removeItem('pendingInviteToken');
        setTimeout(() => window.location.assign('/app'), 300);
        return;
      }

      if (!res.ok) {

        let msg = 'Kon uitnodiging niet accepteren.';
        try {
          const data = await res.json();
          if (data?.error) msg = data.error;
        } catch (e) {}
        setStatus(msg);

        const err = await safeJson(res);
        setStatus(err?.error || 'Kon uitnodiging niet accepteren.');

        return;
      }

      // 200 OK
      const data = await res.json().catch(() => ({}));
      const to = typeof data?.redirectTo === 'string' && data.redirectTo ? data.redirectTo : '/app';
      setStatus('Uitnodiging geaccepteerd. Je wordt doorgestuurd…');
      sessionStorage.removeItem('pendingInviteToken');
      setTimeout(() => {
        window.location.assign(to);
      }, 300);
    } catch (e) {
      setStatus('Onverwachte fout bij accepteren.');
    }
  }

  // Main effect: probeer met huidige sessie, anders stuur naar login
  useEffect(() => {
    if (!token) return;
    if (inFlight.current) return;
    inFlight.current = true;

    (async () => {
      // 1) Kijk of er al een sessie is
      const { data } = await supabase.auth.getSession();
      const access = data?.session?.access_token || null;

      if (access) {
        // direct proberen
        await acceptOnce(token, access);
        inFlight.current = false;
        return;
      }

      // 2) Geen sessie → naar login met next terug naar deze token-route
      setStatus('Inloggen vereist om uitnodiging te accepteren…');
      inFlight.current = false;
      redirectToLogin();
    })();
  }, [token]);

  return <div>{status}</div>;
}
