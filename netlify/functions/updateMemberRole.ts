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
  const { membership_id, new_role } = body;

  if (!membership_id || !new_role) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'membership_id and new_role are required' }) };
  }

  const { data, error } = await supabase.rpc('update_member_role', {
    p_membership_id: membership_id,
    p_new_role: new_role,
  });

  // audit (best effort)
  const { data: userInfo } = await supabase.auth.getUser().catch(() => ({ data: undefined as any }));
  const actor = userInfo?.user?.id ?? null;
  await supabase.from('audit_logs').insert({
    actor_user_id: actor,
    action: 'update_member_role',
    target: membership_id,
    details: { new_role },
  }).catch(() => {});

  if (error) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: error.message }) };
  return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, result: data }) };
};
