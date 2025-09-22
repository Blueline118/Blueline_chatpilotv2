import type { Handler } from '@netlify/functions';
import { buildCorsHeaders, supabaseForRequest } from './_shared/supabaseServer';

interface BodyIn {
  token?: string;
  p_token?: string;
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
      console.error(JSON.stringify({ op: 'invites-revoke', error: error?.message ?? 'parse-failed' }));
      return { statusCode: 400, headers: jsonHeaders, body: JSON.stringify({ error: 'Invalid JSON body' }) };
    }

    const token = body.p_token ?? body.token;
    if (!token) {
      return { statusCode: 400, headers: jsonHeaders, body: JSON.stringify({ error: 'Missing token' }) };
    }

    let supabase;
    try {
      supabase = supabaseForRequest(auth);
    } catch (error: any) {
      console.error(JSON.stringify({ op: 'invites-revoke', error: error?.message ?? 'init-failed' }));
      return { statusCode: 500, headers: jsonHeaders, body: JSON.stringify({ error: 'Supabase init failed' }) };
    }

    const { error } = await supabase.rpc('revoke_invite', { p_token: token });
    if (error) {
      console.error(JSON.stringify({ op: 'invites-revoke', error: error.message, token }));
      return { statusCode: 400, headers: jsonHeaders, body: JSON.stringify({ error: error.message }) };
    }

    return { statusCode: 200, headers: jsonHeaders, body: JSON.stringify({ success: true }) };
  } catch (error: any) {
    console.error(JSON.stringify({ op: 'invites-revoke', error: error?.message ?? 'unknown' }));
    return { statusCode: 500, headers: jsonHeaders, body: JSON.stringify({ error: 'Unexpected error' }) };
  }
};
