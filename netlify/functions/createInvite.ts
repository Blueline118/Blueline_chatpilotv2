import type { Handler } from '@netlify/functions';
import { supabaseForRequest, buildCorsHeaders } from './_shared/supabaseServer';

const ROLE_VALUES = new Set(['ADMIN', 'TEAM', 'CUSTOMER']);

function isUuid(value?: string | null): boolean {
  return (
    typeof value === 'string' &&
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(value)
  );
}

function normalizeRole(role?: string | null): string | null {
  if (!role) return null;
  const normalized = role.trim().toUpperCase();
  return ROLE_VALUES.has(normalized) ? normalized : null;
}

function isValidEmail(email?: string | null): boolean {
  if (typeof email !== 'string') return false;
  const trimmed = email.trim();
  if (!trimmed) return false;
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed);
}

function buildAcceptUrl(origin: string, token: string): string {
  const base = origin.endsWith('/') ? origin.slice(0, -1) : origin;
  return `${base}/.netlify/functions/acceptInvite?token=${encodeURIComponent(token)}`;
}

async function sendInviteEmail(to: string, acceptUrl: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.FROM_EMAIL;
  if (!apiKey || !fromEmail) {
    return { sent: false };
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromEmail,
      to,
      subject: 'Je bent uitgenodigd voor Blueline Chatpilot',
      html: `<!doctype html><html><body><p>Je bent uitgenodigd voor Blueline Chatpilot.</p><p><a href="${acceptUrl}" target="_blank" rel="noreferrer">Accepteer uitnodiging</a></p><p>Of plak deze link in je browser:<br/><code>${acceptUrl}</code></p></body></html>`,
      text: `Je bent uitgenodigd voor Blueline Chatpilot.\n\nAccepteer uitnodiging: ${acceptUrl}\n`,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    const error = new Error('Kon invite e-mail niet versturen');
    (error as any).details = detail;
    throw error;
  }

  return { sent: true };
}

export const handler: Handler = async (event) => {
  const corsHeaders = buildCorsHeaders(event.headers.origin);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Use POST' }),
    };
  }

  const authHeader = event.headers.authorization;
  if (!authHeader) {
    return {
      statusCode: 401,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Missing Authorization header' }),
    };
  }

  let payload: any;
  try {
    payload = event.body ? JSON.parse(event.body) : {};
  } catch (error: any) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Invalid JSON body' }),
    };
  }

  const orgId: string | null = typeof payload?.p_org === 'string' ? payload.p_org : null;
  const email: string | null = typeof payload?.p_email === 'string' ? payload.p_email.trim() : null;
  const role = normalizeRole(payload?.p_role);

  if (!isUuid(orgId || undefined)) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'p_org must be a uuid' }) };
  }
  if (!isValidEmail(email)) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'p_email must be a valid email' }) };
  }
  if (!role) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'p_role must be ADMIN, TEAM of CUSTOMER' }) };
  }

  let supabase;
  try {
    supabase = supabaseForRequest(authHeader);
  } catch (error: any) {
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: error?.message ?? 'Init failed' }) };
  }

  const { data, error } = await supabase.rpc('create_invite', {
    p_org: orgId,
    p_email: email,
    p_role: role,
  });

  if (error) {
    const msg = error.message ?? 'Kon invite niet aanmaken';
    const denied = /row level security|permission denied|not authorized|rpc error/i.test(msg);
    return {
      statusCode: denied ? 403 : 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: msg }),
    };
  }

  const row: any = Array.isArray(data) ? data[0] : data;
  if (!row || !row.token) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Invite resultaat ongeldig' }),
    };
  }

  const origin = process.env.APP_ORIGIN ?? event.headers.origin ?? 'https://blueline-chatpilot.netlify.app';
  const acceptUrl = buildAcceptUrl(origin, row.token);

  let sent = false;
  try {
    const mailResult = await sendInviteEmail(email!, acceptUrl);
    sent = mailResult.sent;
  } catch (mailError: any) {
    return {
      statusCode: 502,
      headers: corsHeaders,
      body: JSON.stringify({ error: mailError?.message ?? 'Mail versturen mislukt', details: mailError?.details }),
    };
  }

  const body = {
    acceptUrl,
    sent: sent || undefined,
    invite: {
      id: row.id,
      email: row.email,
      role: row.role,
      expires_at: row.expires_at,
    },
  };

  return {
    statusCode: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
};
