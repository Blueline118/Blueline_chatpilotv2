import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getAccessToken } from '../lib/getAccessToken';

const MEMBERS_ROUTE = '/app/members';
const DASHBOARD_ROUTE = '/app';
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
    token ? 'Bezig met accepteren…' : 'Deze uitnodiging is ongeldig of verlopen.'
  );
  const [hadJwt, setHadJwt] = useState(false);
  const [errorKind, setErrorKind] = useState(null);

  const loginHref = useMemo(() => {
    const nextTarget = `${location.pathname}${location.search}`;
    return `/login?next=${encodeURIComponent(nextTarget)}`;
  }, [location.pathname, location.search]);

  useEffect(() => {
    let isCancelled = false;
    let redirectTimer;

    setErrorKind(null);
    setHadJwt(false);

    if (!token) {
      setStatus('missing');
      setMessage('Deze uitnodiging is ongeldig of verlopen.');
      setHadJwt(false);
      setErrorKind('invalid');
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
        if (isCancelled) return;
        setHadJwt(Boolean(accessToken));
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
          setErrorKind(null);
          redirectTimer = window.setTimeout(() => {
            navigate(MEMBERS_ROUTE, { replace: true });
          }, 1200);
          return;
        }

        if (response.status === 401 || response.status === 403) {
          setStatus('unauthorized');
          setMessage('Log in om de uitnodiging te accepteren.');
          setErrorKind('unauthorized');
          return;
        }

        if (response.status === 400 || response.status === 410) {
          setStatus('error');
          setMessage('Deze uitnodiging is ongeldig of verlopen.');
          setErrorKind('invalid');
          return;
        }

        const errorMessage = await extractErrorMessage(response);
        if (isCancelled) return;
        setStatus('error');
        setMessage(errorMessage);
        setErrorKind('generic');
      } catch (error) {
        if (isCancelled) return;
        setStatus('error');
        setMessage(DEFAULT_ERROR);
        setErrorKind('generic');
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

  const showLoginCta = status === 'unauthorized' || status === 'error';
  const showDashboardCta = status === 'missing' || status === 'error';
  const showWrongAccountHint = hadJwt && errorKind === 'generic';
  const hasActions = showLoginCta || showDashboardCta;

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
        <p
          style={{
            marginBottom: showWrongAccountHint ? 12 : hasActions ? 24 : 0,
          }}
        >
          {message}
        </p>
        {showWrongAccountHint && (
          <p style={{ marginBottom: hasActions ? 24 : 0 }}>
            Ben je ingelogd met het juiste e-mailadres? Log eventueel uit en probeer opnieuw.
          </p>
        )}

        {(showLoginCta || showDashboardCta) && (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {showLoginCta && (
              <a
                href={loginHref}
                style={{
                  padding: '10px 16px',
                  borderRadius: 8,
                  border: '1px solid #1d4ed8',
                  background: '#1d4ed8',
                  color: '#fff',
                  cursor: 'pointer',
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                Opnieuw inloggen
              </a>
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
