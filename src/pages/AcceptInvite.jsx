import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';

export default function AcceptInvite() {
  const location = useLocation();

  // Lees token uit de URL (eenmalig geëvalueerd)
  const tokenFromUrl = useMemo(() => {
    const qs = new URLSearchParams(location.search);
    const t = qs.get('token');
    return t && typeof t === 'string' ? t : null;
  }, [location.search]);

  // Bewaar token zodat het de login round-trip overleeft
  useEffect(() => {
    if (tokenFromUrl) {
      sessionStorage.setItem('pendingInviteToken', tokenFromUrl);
    }
  }, [tokenFromUrl]);

  // Fallback: pak token uit sessionStorage wanneer de URL hem mist na de callback
  const token = tokenFromUrl || sessionStorage.getItem('pendingInviteToken') || null;

  // UI-status (en tekst) voor eenvoudige feedback
  const [status, setStatus] = useState(
    token ? 'Bezig met uitnodiging accepteren…' : 'Ongeldige link: token ontbreekt.'
  );

  // Hulpfunctie: accepteer met een geldige sessie/JWT
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

      // Race-conditie: sessie nét niet klaar → korte retry (exact 1x)
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

  // Succes-afhandeling
  async function onAccepted() {
    setStatus('Uitnodiging geaccepteerd. Je wordt doorgestuurd…');
    sessionStorage.removeItem('pendingInviteToken');
    setTimeout(() => {
      window.location.assign('/app/members');
    }, 1200);
  }

  // Veilige JSON parser
  async function safeJson(res) {
    try {
      return await res.json();
    } catch {
      return null;
    }
  }

  // Eerste poging bij binnenkomst: als er al sessie is → meteen accepteren,
  // anders naar login met next=<huidige URL>
  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!token) {
        setStatus('Ongeldige link: token ontbreekt.');
        return;
      }

      setStatus('Bezig met uitnodiging accepteren…');

      const { data } = await supabase.auth.getSession();
      const access = data?.session?.access_token;

      if (!access) {
        // Niet ingelogd → redirect naar login met return naar deze pagina
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

  // Ook luisteren op auth state change: na magic link callback auto-accept uitvoeren
  useEffect(() => {
    const sub = supabase.auth.onAuthStateChange((_evt, sess) => {
      const t = token || sessionStorage.getItem('pendingInviteToken');
      if (t && sess?.access_token) {
        acceptWithSession(t, sess.access_token);
      }
    });
    return () => sub.data?.subscription?.unsubscribe?.();
  }, [token]);

  return <div>{status}</div>;
}
