// src/pages/AcceptInvite.jsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
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

        // Niet ingelogd? Eerst naar login met intent
        if (!user) {
          window.location.href = `/login?intent=1&next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
          return;
        }

        // Invite accepteren
        const { data, error } = await supabase.rpc('accept_invite', { p_token: token });
        if (error) throw error;

        // data: { org_id, role }
        // zet evt. active org in localStorage en ga naar /app
        localStorage.setItem('activeOrgId', data?.org_id || '');
        navigate('/app', { replace: true });
      } catch (e) {
        setState({ busy: false, msg: '', err: e.message || 'Er ging iets mis.' });
      }
    })();
  }, [user, navigate]);

  if (state.busy) return <div style={{ maxWidth: 360, margin: '64px auto' }}>Uitnodiging verwerken…</div>;
  if (state.err) return <div style={{ maxWidth: 360, margin: '64px auto', color: 'crimson' }}>{state.err}</div>;
  return null;
}
