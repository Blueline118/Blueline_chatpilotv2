import { getAccessToken } from './getAccessToken';

const BASE_URL = import.meta.env.VITE_APP_ORIGIN ?? window.location.origin;

async function api(path: string, init: RequestInit = {}) {
  const token = await getAccessToken();
  const headers = new Headers(init.headers ?? {});

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const shouldSetContentType = !!init.body && !headers.has('Content-Type');
  if (shouldSetContentType) {
    headers.set('Content-Type', 'application/json');
  }

  try {
    const response = await fetch(`${BASE_URL}${path}`, { ...init, headers });

    if (response.ok) {
      return response;
    }

    const text = await response.text();
    let message = 'Er ging iets mis. Probeer later opnieuw.';

    if (text) {
      try {
        const data = JSON.parse(text) as { error?: unknown };
        if (typeof data?.error === 'string' && data.error.trim()) {
          message = data.error.trim();
        } else if (
          data &&
          typeof data.error === 'object' &&
          data.error !== null &&
          'message' in (data.error as Record<string, unknown>)
        ) {
          const nested = (data.error as { message?: unknown }).message;
          if (typeof nested === 'string' && nested.trim()) {
            message = nested.trim();
          }
        } else if (text.trim()) {
          message = text.trim();
        }
      } catch {
        if (text.trim()) {
          message = text.trim();
        }
      }
    }

    throw new Error(message);
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Er ging iets mis. Probeer later opnieuw.');
  }
}

interface ResendInviteOptions {
  sendEmail?: boolean;
}

export async function resendInvite(
  orgId: string,
  email: string,
  opts?: ResendInviteOptions
): Promise<{ token: string; emailed?: boolean }> {
  const response = await api('/.netlify/functions/invites-resend', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      org_id: orgId,
      email,
      send_email: opts?.sendEmail ?? false,
    }),
  });

  return response.json() as Promise<{ token: string; emailed?: boolean }>;
}

export async function revokeInvite(token: string): Promise<void> {
  await api('/.netlify/functions/invites-revoke', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
}
