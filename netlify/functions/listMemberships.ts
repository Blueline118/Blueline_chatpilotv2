import type { Handler } from '@netlify/functions';
import { supabaseForRequest, buildCorsHeaders } from './_shared/supabaseServer';

export const handler: Handler = async (event) => {
  const cors = buildCorsHeaders(event.headers.origin);
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };

  const auth = event.headers.authorization;
  if (!auth) return { statusCode: 401, headers: cors, body: JSON.stringify({ error: 'Missing Authorization Bearer token' }) };

  const supabase = supabaseForRequest(auth);
  const orgId = event.queryStringParameters?.org_id ?? undefined;

  let query = supabase.from('memberships').select('id, org_id, user_id, role, inserted_at');
  if (orgId) query = query.eq('org_id', orgId);

  const { data, error } = await query.order('inserted_at', { ascending: false });
  if (error) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: error.message }) };

  return { statusCode: 200, headers: cors, body: JSON.stringify({ items: data }) };
};
