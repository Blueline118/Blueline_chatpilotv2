import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';

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

  const urlToken = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const raw = params.get('token');
    return raw ? raw.trim() : '';
  }, [location.search]);


  const loginWithNext = useMemo(
    () => `/login?next=${encodeURIComponent(`${location.pathname}${location.search}`)}`,
    [location.pathname, location.search]

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

  const [token, setToken] = useState('');
  const [status, setStatus] = useState('loading');
  const [message, setMessage] = useState('Bezig met accepteren…');

  useEffect(() => {
    let resolvedToken = '';
    let tokenSource = '';


    if (urlToken) {
      resolvedToken = urlToken;
      tokenSource = 'url';
      sessionStorage.setItem('pendingInviteToken', resolvedToken);
    } else {
      const stored = sessionStorage.getItem('pendingInviteToken');
      if (stored && stored.trim()) {
        resolvedToken = stored.trim();
        tokenSource = 'sessionStorage';
      }
    }

    if (!resolvedToken) {
      setToken('');
      setStatus('error');
      setMessage('Geen geldige invite-link.');
      return;
    }

    if (tokenSource && process.env.NODE_ENV !== 'production') {
      console.info(`accept: token source = ${tokenSource}`);

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

    setToken(resolvedToken);
    setStatus('loading');
    setMessage('Bezig met accepteren…');
  }, [urlToken]);

  useEffect(() => {
    if (!token) {
      return undefined;
    }

    let isCancelled = false;
    let hasCompleted = false;
    let isProcessing = false;
    let redirectTimer;

    const ensureLoginMessage = () => {
      if (isCancelled || hasCompleted) return;
      setStatus('error');
      setMessage('Log in om de uitnodiging te accepteren.');
    };

    const acceptWithSession = async (
      session,
      allowRetry = true,
      bypassProcessingCheck = false
    ) => {
      if (isCancelled || hasCompleted) {
        return;
      }

      const accessToken = session?.access_token;

      if (!accessToken) {
        ensureLoginMessage();
        return;
      }

      if (!bypassProcessingCheck && isProcessing) {
        return;
      }

      isProcessing = true;
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
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ token }),
        });

        if (process.env.NODE_ENV !== 'production') {
          console.info('accept: response status', response.status);
        }

        if (isCancelled || hasCompleted) {
          return;
        }

        if (response.ok) {
          hasCompleted = true;
          setStatus('success');
          setMessage('Uitnodiging geaccepteerd. Even geduld…');

          sessionStorage.removeItem('pendingInviteToken');

          setErrorKind(null);

          redirectTimer = window.setTimeout(() => {
            navigate(MEMBERS_ROUTE, { replace: true });
          }, 1200);
          return;
        }


        if ((response.status === 401 || response.status === 403) && allowRetry) {
          const waitMs = 600 + Math.floor(Math.random() * 201);
          await new Promise((resolve) => window.setTimeout(resolve, waitMs));
          if (isCancelled || hasCompleted) {
            return;
          }
          const { data } = await supabase.auth.getSession();
          if (isCancelled || hasCompleted) {
            return;
          }
          await acceptWithSession(data.session, false, true);

        if (response.status === 401 || response.status === 403) {
          setStatus('unauthorized');
          setMessage('Log in om de uitnodiging te accepteren.');
          setErrorKind('unauthorized');

          return;
        }

        if (response.status === 400 || response.status === 410) {
          setStatus('error');
          setMessage('Deze uitnodiging is ongeldig of verlopen.');

        } else {
          const errorMessage = await extractErrorMessage(response);
          setStatus('error');
          setMessage(errorMessage);
        }
      } catch (error) {
        if (!isCancelled && !hasCompleted) {
          setStatus('error');
          setMessage(DEFAULT_ERROR);
        }
      } finally {
        isProcessing = false;

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

    const syncSessionAndAccept = async (allowRetry = true) => {
      const { data } = await supabase.auth.getSession();
      if (isCancelled || hasCompleted) {
        return;
      }
      await acceptWithSession(data.session, allowRetry);
    };

    syncSessionAndAccept(true);

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (isCancelled || hasCompleted) {
        return;
      }
      if (!session?.access_token) {
        ensureLoginMessage();
        return;
      }
      acceptWithSession(session, true);
    });

    return () => {
      isCancelled = true;
      if (redirectTimer) {
        clearTimeout(redirectTimer);
      }
      sub?.subscription.unsubscribe();
    };
  }, [token, navigate]);


  const showLoginCta =
    status === 'error' && message === 'Log in om de uitnodiging te accepteren.';
  const showDashboardCta = status === 'error' && message !== 'Log in om de uitnodiging te accepteren.';

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

              <button
                type="button"
                onClick={() => window.location.assign(loginWithNext)}

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
