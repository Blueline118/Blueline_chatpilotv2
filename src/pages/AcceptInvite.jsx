// src/pages/AcceptInvite.jsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authHeader } from '../lib/authHeader';
import { netlifyJson } from '../lib/netlifyFetch';
import { useAuth } from '../providers/AuthProvider';

export default function AcceptInvite() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [state, setState] = useState({ busy: true, msg: 'Bezig…', err: '' });

  useEffect(() => {
    (async () => {
      try {
        const url = new URL(window.location.href);
        const token = url.searchParams.get('token');
        if (!token) {
          setState({ busy: false, msg: '', err: 'Geen token gevonden.' });
          return;
        }

        // Niet ingelogd? eerst naar login met intent + terugkeer
        if (!user) {
          const next = `${window.location.pathname}${window.location.search}`;
          window.location.href = `/login?intent=1&next=${encodeURIComponent(next)}`;
          return;
        }

        const headers = await authHeader();
        if (!headers.Authorization) {
          throw new Error('Geen toegangstoken beschikbaar.');
        }

        const data = await netlifyJson(`acceptInvite?token=${encodeURIComponent(token)}&noRedirect=1`, {
          method: 'GET',
          headers,
        });

        if (data?.org_id) {
          try { localStorage.setItem('activeOrgId', data.org_id); } catch {}
        }

        navigate('/app?accepted=1', { replace: true });
      } catch (e) {
        setState({ busy: false, msg: '', err: e.message || 'Er ging iets mis.' });
      }
    })();
  }, [user, navigate]);

  if (state.busy) return <div style={{ maxWidth: 360, margin: '64px auto' }}>Uitnodiging verwerken…</div>;
  if (state.err) return <div style={{ maxWidth: 360, margin: '64px auto', color: 'crimson' }}>{state.err}</div>;
  return null;
}
