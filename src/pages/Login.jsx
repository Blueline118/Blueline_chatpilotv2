// src/pages/Login.jsx
import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../providers/AuthProvider';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
// ... existing imports

export default function Login() {
  const navigate = useNavigate();
  // existing state hooks...

  // Fallback: if someone lands on /login *with* tokens in the URL, forward to /auth/callback
  useEffect(() => {
    const hasHashTokens = window.location.hash.includes('access_token=');
    const hasCode = new URLSearchParams(window.location.search).has('code');
    if (hasHashTokens || hasCode) {
      navigate('/auth/callback' + window.location.search + window.location.hash, { replace: true });
    }
  }, [navigate]);

  // ...rest of your Login.jsx code
}

export default function Login() {
  const { user } = useAuth();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState('');

  const onSendLink = async (e) => {
    e.preventDefault();
    setErr('');
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

  if (user) {
    return (
      <div style={{ padding: 24 }}>
        <h2>Je bent al ingelogd</h2>
        <a href="/app">Ga naar de app →</a>
      </div>
    );
  }

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
