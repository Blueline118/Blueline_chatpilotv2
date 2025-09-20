import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

export default function AcceptInvite() {
  const location = useLocation();
  const qs = new URLSearchParams(location.search);
  const token = qs.get('token');
  const [status, setStatus] = useState(
    token ? 'Bezig met uitnodiging accepteren...' : 'Ongeldige link: token ontbreekt.'
  );

  useEffect(() => {
    let cancelled = false;

    if (!token) {
      setStatus('Ongeldige link: token ontbreekt.');
      return () => {
        cancelled = true;
      };
    }

    async function acceptWithoutLogin() {
      setStatus('Bezig met uitnodiging accepteren...');

      try {
        const res = await fetch(
          `/.netlify/functions/acceptInvite?token=${encodeURIComponent(token)}&noRedirect=1`
        );

        if (cancelled) return;

        if (res.status === 401) {
          const next = encodeURIComponent(
            window.location.pathname + window.location.search
          );
          window.location.assign(`/login?next=${next}`);
          return;
        }

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setStatus(data?.error || 'Kon uitnodiging niet accepteren.');
          return;
        }

        setStatus('Uitnodiging geaccepteerd. Je wordt doorgestuurd...');
        const redirectTarget =
          typeof data?.redirectTo === 'string' && data.redirectTo
            ? data.redirectTo
            : '/app?invite=accepted';
        window.location.assign(redirectTarget);
      } catch (e) {
        if (!cancelled) {
          setStatus('Onverwachte fout bij accepteren.');
        }
      }
    }

    acceptWithoutLogin();

    return () => {
      cancelled = true;
    };
  }, [token, location.pathname, location.search]);

  return <div>{status}</div>;
}
