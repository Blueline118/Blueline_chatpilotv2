// src/pages/Login.jsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../providers/AuthProvider';

export default function Login() {
  const navigate = useNavigate();
  const { user } = useAuth(); // alleen lezen
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState('');
  const [didRedirect, setDidRedirect] = useState(false); // voorkom knipper/loop

  // Eén debounced effect voor alle login-redirects
  useEffect(() => {
    if (didRedirect) return;

    const url = new URL(window.location.href);
    const hasHashTokens = window.location.hash.includes('access_token=');
    const hasCode = url.searchParams.has('code');
    const intent = url.searchParams.get('intent') === '1';

    // 1) Magic link / OAuth tokens? -> door naar /auth/callback
    if (hasHashTokens || hasCode) {
      setDidRedirect(true);
      navigate('/auth/callback' + window.location.search + window.location.hash, { replace: true });
      return;
    }

    // 2) Al ingelogd? -> naar /app
    if (user) {
      setDidRedirect(true);
      navigate('/app', { replace: true });
      return;
    }

    // 3) Geen intent en geen tokens? -> per ongeluk op /login => terug naar /app
    if (!intent) {
      setDidRedirect(true);
      navigate('/app', { replace: true });
      return;
    }
  }, [user, navigate, didRedirect]);

  const onSendLink = async (e) => {
    e.preventDefault();
    setErr('');
    setSent(false);

    const redirectTo = `${window.location.origin}/auth/callback`;
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: redirectTo,
        shouldCreateUser: true,
      },
    });
    if (error) setErr(error.message);
    else setSent(true);
  };

  if (didRedirect) return null; // toon niets tijdens redirect

  return (
    <div style={{ maxWidth: 360, margin: '64px auto', padding: 24, border: '1px solid #eee', borderRadius: 12 }}>
      <h1>Inloggen</h1>
      <p>We sturen je een magic link per e-mail.</p>
      <form onSubmit={onSendLink}>
        <input
          type="email"
          placeholder="jij@voorbeeld.nl"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          style={{ width: '100%', padding: 12, margin: '12px 0' }}
        />
        <button type="submit" style={{ width: '100%', padding: 12 }}>Stuur magic link</button>
      </form>
      {sent && <p>Link verstuurd! Check je e-mail.</p>}
      {err && <p style={{ color: 'crimson' }}>{err}</p>}
    </div>
  );
}
