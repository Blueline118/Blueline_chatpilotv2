import type { Handler } from '@netlify/functions';
import { buildCorsHeaders, supabaseForRequest } from './_shared/supabaseServer';

interface BodyIn {
  org_id?: string;
  p_org_id?: string;
  email?: string;
  p_email?: string;
}

export const handler: Handler = async (event) => {
  const cors = buildCorsHeaders(event.headers.origin);
  const jsonHeaders = { ...cors, 'Content-Type': 'application/json' };

  try {
    if (event.httpMethod === 'OPTIONS') {
      return { statusCode: 200, headers: cors };
    }

    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, headers: jsonHeaders, body: JSON.stringify({ error: 'Use POST' }) };
    }

    const auth = event.headers.authorization;
    if (!auth) {
      return { statusCode: 401, headers: jsonHeaders, body: JSON.stringify({ error: 'Missing Authorization header' }) };
    }

    const rawBody = event.isBase64Encoded && event.body
      ? Buffer.from(event.body, 'base64').toString('utf8')
      : event.body ?? '{}';

    let body: BodyIn;
    try {
      body = JSON.parse(rawBody) as BodyIn;
    } catch (error: any) {
      console.error(JSON.stringify({ op: 'invites-resend', error: error?.message ?? 'parse-failed' }));
      return { statusCode: 400, headers: jsonHeaders, body: JSON.stringify({ error: 'Invalid JSON body' }) };
    }

    const orgId = body.p_org_id ?? body.org_id;
    const emailRaw = body.p_email ?? body.email;
    const email = typeof emailRaw === 'string' ? emailRaw.trim().toLowerCase() : undefined;

    if (!orgId || !email) {
      return {
        statusCode: 400,
        headers: jsonHeaders,
        body: JSON.stringify({ error: 'Missing org_id and/or email' }),
      };
    }

    let supabase;
    try {
      supabase = supabaseForRequest(auth);
    } catch (error: any) {
      console.error(JSON.stringify({ op: 'invites-resend', error: error?.message ?? 'init-failed' }));
      return { statusCode: 500, headers: jsonHeaders, body: JSON.stringify({ error: 'Supabase init failed' }) };
    }

    const { data, error } = await supabase.rpc('resend_invite', {
      p_org_id: orgId,
      p_email: email,
    });

    if (error) {
      console.error(JSON.stringify({ op: 'invites-resend', error: error.message, org_id: orgId, email }));
      return { statusCode: 400, headers: jsonHeaders, body: JSON.stringify({ error: error.message }) };
    }

    const token = typeof data === 'string' ? data : (data as any)?.token ?? data;
    if (!token || typeof token !== 'string') {
      console.error(JSON.stringify({ op: 'invites-resend', error: 'invalid-return', data }));
      return { statusCode: 500, headers: jsonHeaders, body: JSON.stringify({ error: 'Invalid RPC response' }) };
    }

    return { statusCode: 200, headers: jsonHeaders, body: JSON.stringify({ token }) };
  } catch (error: any) {
    console.error(JSON.stringify({ op: 'invites-resend', error: error?.message ?? 'unknown' }));
    return { statusCode: 500, headers: jsonHeaders, body: JSON.stringify({ error: 'Unexpected error' }) };
  }
};
