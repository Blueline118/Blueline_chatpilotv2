// src/pages/Login.jsx
import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../providers/AuthProvider';

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
  options: { emailRedirectTo: redirectTo }
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
