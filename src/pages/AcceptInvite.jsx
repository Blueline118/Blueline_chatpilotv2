import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getAccessToken } from '../lib/getAccessToken';

const MEMBERS_ROUTE = '/app/members';
const DASHBOARD_ROUTE = '/app';
const LOGIN_WITH_NEXT = `/login?next=${encodeURIComponent(MEMBERS_ROUTE)}`;
const DEFAULT_ERROR = 'Er ging iets mis. Probeer later opnieuw.';

async function extractErrorMessage(response) {
  try {
    const text = await response.text();
    if (!text) {
      return DEFAULT_ERROR;
    }

    try {
      const data = JSON.parse(text);
      if (typeof data?.error === 'string' && data.error.trim()) {
        return data.error.trim();
      }
      if (
        data &&
        typeof data.error === 'object' &&
        data.error !== null &&
        'message' in data.error &&
        typeof data.error.message === 'string' &&
        data.error.message.trim()
      ) {
        return data.error.message.trim();
      }
    } catch {
      if (text.trim()) {
        return text.trim();
      }
    }

    if (text.trim()) {
      return text.trim();
    }
  } catch {
    // ignore and fall back
  }
  return DEFAULT_ERROR;
}

export default function AcceptInvite() {
  const location = useLocation();
  const navigate = useNavigate();

  const token = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const raw = params.get('token');
    return raw ? raw.trim() : '';
  }, [location.search]);

  const [status, setStatus] = useState(() => (token ? 'loading' : 'missing'));
  const [message, setMessage] = useState(() =>
    token ? 'Bezig met accepteren…' : 'Geen geldige invite-link.'
  );

  useEffect(() => {
    let isCancelled = false;
    let redirectTimer;

    if (!token) {
      setStatus('missing');
      setMessage('Geen geldige invite-link.');
      return () => {
        if (redirectTimer) {
          clearTimeout(redirectTimer);
        }
      };
    }

    const acceptInvite = async () => {
      setStatus('loading');
      setMessage('Bezig met accepteren…');

      try {
        const accessToken = await getAccessToken();
        const headers = { 'Content-Type': 'application/json' };

        if (accessToken) {
          headers.Authorization = `Bearer ${accessToken}`;
        }

        const response = await fetch('/.netlify/functions/invites-accept', {
          method: 'POST',
          headers,
          body: JSON.stringify({ token }),
        });

        if (isCancelled) return;

        if (response.ok) {
          setStatus('success');
          setMessage('Uitnodiging geaccepteerd. Even geduld…');
          redirectTimer = window.setTimeout(() => {
            navigate(MEMBERS_ROUTE, { replace: true });
          }, 1200);
          return;
        }

        if (response.status === 401 || response.status === 403) {
          setStatus('unauthorized');
          setMessage('Log in om de uitnodiging te accepteren.');
          return;
        }

        if (response.status === 400 || response.status === 410) {
          setStatus('error');
          setMessage('Deze uitnodiging is ongeldig of verlopen.');
          return;
        }

        const errorMessage = await extractErrorMessage(response);
        if (isCancelled) return;
        setStatus('error');
        setMessage(errorMessage);
      } catch (error) {
        if (isCancelled) return;
        setStatus('error');
        setMessage(DEFAULT_ERROR);
      }
    };

    acceptInvite();

    return () => {
      isCancelled = true;
      if (redirectTimer) {
        clearTimeout(redirectTimer);
      }
    };
  }, [token, navigate]);

  const showLoginCta = status === 'missing' || status === 'unauthorized' || status === 'error';
  const showDashboardCta = status === 'missing' || status === 'error';

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        background: '#f7f7f8',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 420,
          background: '#fff',
          borderRadius: 16,
          padding: 32,
          boxShadow: '0 12px 24px rgba(15, 23, 42, 0.08)',
          border: '1px solid rgba(15, 23, 42, 0.08)',
        }}
      >
        <h1 style={{ marginBottom: 16, fontSize: 24 }}>Uitnodiging accepteren…</h1>
        <p style={{ marginBottom: showLoginCta || showDashboardCta ? 24 : 0 }}>{message}</p>

        {(showLoginCta || showDashboardCta) && (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {showLoginCta && (
              <button
                type="button"
                onClick={() => window.location.assign(LOGIN_WITH_NEXT)}
                style={{
                  padding: '10px 16px',
                  borderRadius: 8,
                  border: '1px solid #1d4ed8',
                  background: '#1d4ed8',
                  color: '#fff',
                  cursor: 'pointer',
                }}
              >
                Opnieuw inloggen
              </button>
            )}
            {showDashboardCta && (
              <button
                type="button"
                onClick={() => navigate(DASHBOARD_ROUTE)}
                style={{
                  padding: '10px 16px',
                  borderRadius: 8,
                  border: '1px solid rgba(15, 23, 42, 0.12)',
                  background: '#fff',
                  color: '#0f172a',
                  cursor: 'pointer',
                }}
              >
                Terug naar dashboard
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
