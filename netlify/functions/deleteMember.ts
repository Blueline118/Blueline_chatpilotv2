import type { Handler } from '@netlify/functions';
import { supabaseForRequest, buildCorsHeaders } from './_shared/supabaseServer';

export const handler: Handler = async (event) => {
  const cors = buildCorsHeaders(event.headers.origin);
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: cors, body: JSON.stringify({ error: 'Method not allowed' }) };

  const auth = event.headers.authorization;
  if (!auth) return { statusCode: 401, headers: cors, body: JSON.stringify({ error: 'Missing Authorization Bearer token' }) };

  const supabase = supabaseForRequest(auth);
  const body = JSON.parse(event.body || '{}');
  const { membership_id } = body;

  if (!membership_id) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'membership_id is required' }) };
  }

  const { error } = await supabase.rpc('delete_member', {
    p_membership_id: membership_id,
  });

  // audit (best effort)
  const { data: userInfo } = await supabase.auth.getUser().catch(() => ({ data: undefined as any }));
  const actor = userInfo?.user?.id ?? null;
  await supabase.from('audit_logs').insert({
    actor_user_id: actor,
    action: 'delete_member',
    target: membership_id,
    details: {},
  }).catch(() => {});

  if (error) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: error.message }) };
  return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true }) };
};
