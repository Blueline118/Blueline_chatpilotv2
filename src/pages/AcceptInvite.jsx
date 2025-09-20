import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

export default function AcceptInvite() {
  const nav = useNavigate();
  const location = useLocation();
  const qs = new URLSearchParams(location.search);
  const token = qs.get('token');
  const [status, setStatus] = useState('Bezig met uitnodiging accepteren...');

  useEffect(() => {
    (async () => {
      if (!token) {
        setStatus('Ongeldige link: token ontbreekt.');
        return;
      }

      const k = Object.keys(localStorage).find(
        (x) => x.startsWith('sb-') && x.endsWith('-auth-token')
      );
      const t = k ? JSON.parse(localStorage.getItem(k) || '{}').access_token : null;
      if (!t) {
        const next = encodeURIComponent(
          window.location.pathname + window.location.search
        );
        window.location.assign(`/login?next=${next}`);
        return;
      }

      try {
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

  return <div>{status}</div>;
}
