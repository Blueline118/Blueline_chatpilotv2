import type { Handler } from '@netlify/functions';
import { supabaseForRequest, buildCorsHeaders } from './_shared/supabaseServer';

export const handler: Handler = async (event) => {
  const cors = buildCorsHeaders(event.headers.origin);
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  if (event.httpMethod !== 'GET') return { statusCode: 405, headers: cors, body: JSON.stringify({ error: 'Use GET' }) };

  const auth = event.headers.authorization;
  if (!auth) return { statusCode: 401, headers: cors, body: JSON.stringify({ error: 'Missing Authorization header' }) };

  const supabase = supabaseForRequest(auth);
  const orgId = event.queryStringParameters?.org_id;
  if (!orgId) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Missing org_id' }) };

  // RLS: user-JWT enforced by anon client
  const { data, error } = await supabase
    .from('memberships')
    .select('org_id, user_id, role, created_at')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });

  if (error) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: error.message }) };
  return { statusCode: 200, headers: cors, body: JSON.stringify({ items: data }) };
};
