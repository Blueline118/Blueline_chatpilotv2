import type { Handler } from '@netlify/functions';
import { supabaseForRequest, buildCorsHeaders } from './_shared/supabaseServer';

export const handler: Handler = async (event) => {
  const headers = buildCorsHeaders(event.headers.origin);
  const jsonHeaders = { ...headers, 'Content-Type': 'application/json' };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: jsonHeaders,
      body: JSON.stringify({ error: 'Use GET' }),
    };
  }

  const auth = event.headers.authorization;
  if (!auth) {
    return {
      statusCode: 401,
      headers: jsonHeaders,
      body: JSON.stringify({ error: 'Missing Authorization header' }),
    };
  }

  const token = event.queryStringParameters?.token;
  const noRedirect = event.queryStringParameters?.noRedirect === '1';
  if (!token) {
    return {
      statusCode: 400,
      headers: jsonHeaders,
      body: JSON.stringify({ error: 'Missing token' }),
    };
  }

  try {
    const supabase = supabaseForRequest(auth);
    const { data: me, error: meErr } = await supabase.auth.getUser();
    if (meErr || !me?.user) {
      return {
        statusCode: 401,
        headers: jsonHeaders,
        body: JSON.stringify({ error: 'Not authenticated' }),
      };
    }

    const { error: accErr } = await supabase.rpc('accept_invite', { p_token: token } as any);
    if (accErr) {
      return {
        statusCode: 400,
        headers: jsonHeaders,
        body: JSON.stringify({ error: accErr.message }),
      };
    }

    if (noRedirect) {
      return {
        statusCode: 200,
        headers: jsonHeaders,
        body: JSON.stringify({ success: true }),
      };
    }

    const scheme = (event.headers['x-forwarded-proto'] || 'https') as string;
    const hostHeader =
      (event.headers['x-forwarded-host'] || event.headers.host) as string | undefined;
    const base = process.env.APP_ORIGIN || (hostHeader ? `${scheme}://${hostHeader}` : `${scheme}://localhost`);
    return {
      statusCode: 302,
      headers: { ...headers, Location: `${base}/app?accepted=1` },
    };
  } catch (e: any) {
    return {
      statusCode: 500,
      headers: jsonHeaders,
      body: JSON.stringify({ error: e?.message || 'acceptInvite failure' }),
    };
  }
};
