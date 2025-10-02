// LEGACY: replaced by direct Supabase RPC calls. Kept for backward compatibility in scripts.
import type { Handler } from '@netlify/functions';
import { supabaseForRequest, buildCorsHeaders } from './_shared/supabaseServer';

export const handler: Handler = async (event) => {
  const headers = buildCorsHeaders(event.headers.origin);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers };
  }
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Use GET' }) };
  }

  const orgId = event.queryStringParameters?.org_id;
  if (!orgId) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing org_id' }) };
  }

  let supabase;
  try {
    supabase = supabaseForRequest(event.headers.authorization);
  } catch (e: any) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e?.message ?? 'Init error' }) };
  }

  // Try view first
  let { data, error } = await supabase
    .from('v_org_members')
    .select('org_id,user_id,role,created_at,email')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });

  // Fallback to direct join if view is missing
  if (error && /relation .* v_org_members .* does not exist/i.test(error.message)) {
    const res = await supabase
      .from('memberships')
      .select('org_id,user_id,role,created_at,profiles:profiles!inner(email)')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false });
    data = res.data as any[] | null;
    error = res.error;
  }

  if (error) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: error.message }) };
  }

  const items = (data ?? []).map((row: any) => ({
    org_id: row.org_id,
    user_id: row.user_id,
    role: row.role,
    created_at: row.created_at,
    email: row.email ?? row?.profiles?.email ?? null,
  }));

  return { statusCode: 200, headers, body: JSON.stringify({ items }) };
};
