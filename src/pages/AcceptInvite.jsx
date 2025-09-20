import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

export default function AcceptInvite() {
  const nav = useNavigate();
  const location = useLocation();
  const qs = new URLSearchParams(location.search);
  const token = qs.get('token');
  const [status, setStatus] = useState('Bezig met uitnodiging accepteren...');

  useEffect(() => {
    if (!token) return;

    (async () => {
      try {
        const k = Object.keys(localStorage).find(
          (x) => x.startsWith('sb-') && x.endsWith('-auth-token')
        );
        const raw = k ? localStorage.getItem(k) : null;
        let t = null;
        if (raw) {
          try {
            t = JSON.parse(raw).access_token ?? null;
          } catch {
            t = null;
          }
        }
        if (!t) {
          setStatus('Je bent niet ingelogd. Log in en probeer opnieuw.');
          return;
        }
        const res = await fetch(
          `/.netlify/functions/acceptInvite?token=${encodeURIComponent(token)}&noRedirect=1`,
          {
            headers: { Authorization: `Bearer ${t}` },
          }
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setStatus(data?.error || 'Kon uitnodiging niet accepteren.');
          return;
        }
        setStatus('Uitnodiging geaccepteerd, je wordt doorgestuurd...');
        nav('/app', { replace: true });
      } catch (e) {
        setStatus('Onverwachte fout bij accepteren.');
      }
    })();
  }, [token, nav]);

  if (!token) return <div>Ongeldige link: token ontbreekt.</div>;
  return <div>{status}</div>;
}
