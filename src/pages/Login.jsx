// src/pages/Login.jsx
import { useState, useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../providers/AuthProvider';
import { DEFAULT_AFTER_LOGIN, resolveNextPath } from '../lib/resolveNextPath';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth(); // alleen lezen

  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState('');
  const [didRedirect, setDidRedirect] = useState(false); // voorkom knipper/loop

  // Lees ruwe next-waarde uit de URL en normaliseer met helper
  const rawNext = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get('next');
  }, [location.search]);

  const nextPath = useMemo(() => resolveNextPath(rawNext), [rawNext]);

  // Eén effect dat bepaalt waar we heen moeten bij binnenkomst
  useEffect(() => {
    if (didRedirect) return;

    const params = new URLSearchParams(location.search);
    const hasHashTokens = location.hash.includes('access_token=');
    const hasCode = params.has('code'); // OAuth/magic-link code
    const intent = params.get('intent') === '1';
    const hasNext = Boolean(nextPath);

    // 1) Magic link / OAuth tokens in URL? => door naar callback met alles intact
    if (hasHashTokens || hasCode) {
      setDidRedirect(true);
      navigate(`/auth/callback${location.search}${location.hash}`, { replace: true });
      return;
    }

    // 2) Al ingelogd? => direct door naar next of default
    if (user) {
      setDidRedirect(true);
      navigate(nextPath ?? DEFAULT_AFTER_LOGIN, { replace: true });
      return;
    }

    // 3) Geen expliciete intent en geen next? => waarschijnlijk per ongeluk hier
    if (!intent && !hasNext) {
      setDidRedirect(true);
      navigate('/app', { replace: true });
      return;
    }
  }, [user, navigate, didRedirect, location.search, location.hash, nextPath]);

  // Magic link versturen
  const onSendLink = async (e) => {
    e.preventDefault();
    setErr('');
    setSent(false);

    const callbackSearch = nextPath ? `?next=${encodeURIComponent(nextPath)}` : '';
    const emailRedirectTo = `${window.location.origin}/auth/callback${callbackSearch}`;

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo,     // ✅ stuurt terug naar /auth/callback met next
        shouldCreateUser: true,
      },
    });

    if (error) {
      setErr(error.message);
    } else {
      setSent(true);
    }
  };

  if (didRedirect) return null; // toon niets tijdens redirect–wissels

  return (
    <div
      style={{
        maxWidth: 360,
        margin: '64px auto',
        padding: 24,
        border: '1px solid #eee',
        borderRadius: 12,
      }}
    >
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
        <button type="submit" style={{ width: '100%', padding: 12 }}>
          Stuur magic link
        </button>
      </form>

      {sent && <p>Link verstuurd! Check je e-mail.</p>}
      {err && <p style={{ color: 'crimson' }}>{err}</p>}
    </div>
  );
}
