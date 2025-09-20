import type { Handler } from '@netlify/functions';
import { supabaseForRequest, buildCorsHeaders } from './_shared/supabaseServer';

function buildRedirectLocation(origin: string): string {
  const base = origin.endsWith('/') ? origin.slice(0, -1) : origin;
  return `${base}/app?accepted=1`;
}

function shouldReturnJson(param?: string | null): boolean {
  if (!param) return false;
  const value = param.toLowerCase();
  return value === '1' || value === 'true';
}

export const handler: Handler = async (event) => {
  const corsHeaders = buildCorsHeaders(event.headers.origin);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Use GET' }),
    };
  }

  const token = event.queryStringParameters?.token;
  if (!token) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Missing token' }),
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

  let supabase;
  try {
    supabase = supabaseForRequest(authHeader);
  } catch (error: any) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: error?.message ?? 'Init failed' }),
    };
  }

  const { data, error } = await supabase.rpc('accept_invite', { p_token: token });
  if (error) {
    const message = error.message ?? 'Kon invite niet accepteren';
    const unauthorized = /not_authenticated/i.test(message);
    const invalid = /invalid|expired/i.test(message);
    const statusCode = unauthorized ? 401 : invalid ? 400 : 400;
    return {
      statusCode,
      headers: corsHeaders,
      body: JSON.stringify({ error: message }),
    };
  }

  const row: any = Array.isArray(data) ? data[0] : data;
  if (!row || !row.org_id) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Invite resultaat ongeldig' }),
    };
  }

  const origin = process.env.APP_ORIGIN ?? event.headers.origin ?? 'https://blueline-chatpilot.netlify.app';
  const wantsJson = shouldReturnJson(event.queryStringParameters?.noRedirect);
  if (wantsJson) {
    return {
      statusCode: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, org_id: row.org_id, email: row.email, role: row.role }),
    };
  }

  return {
    statusCode: 302,
    headers: {
      ...corsHeaders,
      Location: buildRedirectLocation(origin),
    },
    body: '',
  };
};
