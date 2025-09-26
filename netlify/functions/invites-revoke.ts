import type { Handler } from '@netlify/functions';
import { buildCorsHeaders, supabaseAdmin, supabaseForRequest } from './_shared/supabaseServer';

interface BodyIn {
  token?: string;
  p_token?: string;
}

const FN = 'invites-revoke';

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
      console.error(JSON.stringify({ fn: FN, stage: 'parse', err: error?.message ?? 'parse-failed' }));
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
      console.error(JSON.stringify({ fn: FN, stage: 'supabase_init', err: error?.message ?? 'init-failed' }));
      return { statusCode: 500, headers: jsonHeaders, body: JSON.stringify({ error: 'Supabase init failed' }) };
    }

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr) {
      console.warn(JSON.stringify({ fn: FN, stage: 'auth-getUser', err: userErr.message }));
    }
    const actorId = userData?.user?.id ?? null;

    const { error } = await supabase.rpc('revoke_invite', { p_token: token });
    if (error) {
      console.error(JSON.stringify({ fn: FN, stage: 'rpc', err: error.message, token }));
      return { statusCode: 400, headers: jsonHeaders, body: JSON.stringify({ error: error.message }) };
    }

    const admin = supabaseAdmin();
    let orgId: string | null = null;
    let email: string | null = null;
    try {
      const { data: inviteRow, error: inviteErr } = await admin
        .from('invites')
        .select('org_id, email, token')
        .eq('token', token)
        .maybeSingle();
      if (inviteErr) {
        console.warn(JSON.stringify({ fn: FN, stage: 'lookup', err: inviteErr.message, token }));
      }
      if (inviteRow) {
        orgId = inviteRow.org_id ?? null;
        email = (inviteRow as any).email ?? null;
      }
    } catch (err: any) {
      console.warn(JSON.stringify({ fn: FN, stage: 'lookup', err: err?.message ?? 'lookup-failed', token }));
    }

    if (orgId) {
      const tokenSuffix = token.slice(-6);
      try {
        await admin.rpc('audit_log_event', {
          p_org: orgId,
          p_actor: actorId,
          p_action: 'invite_revoked',
          p_target: { email: email ?? undefined, token_suffix: tokenSuffix },
          p_meta: { manual: true },
        });
      } catch (err: any) {
        console.warn(JSON.stringify({ fn: FN, stage: 'audit-log', err: err?.message ?? 'rpc-failed', org: orgId, token }));
      }
    } else {
      console.warn(JSON.stringify({ fn: FN, stage: 'audit-skip', err: 'missing-org', token }));
    }

    return { statusCode: 200, headers: jsonHeaders, body: JSON.stringify({ success: true }) };
  } catch (error: any) {
    console.error(JSON.stringify({ fn: FN, stage: 'handler', err: error?.message ?? 'unknown' }));
    return { statusCode: 500, headers: jsonHeaders, body: JSON.stringify({ error: 'Unexpected error' }) };
  }
};
