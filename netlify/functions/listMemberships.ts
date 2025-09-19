// netlify/functions/listMemberships.ts
import type { Handler } from '@netlify/functions';
import { supabaseForRequest, buildCorsHeaders } from './_shared/supabaseServer';

export const handler: Handler = async (event) => {
  const cors = buildCorsHeaders(event.headers.origin);

  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: cors, body: '' };
  }
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers: cors, body: JSON.stringify({ error: 'Use GET' }) };
  }

  const auth = event.headers.authorization;
  if (!auth) {
    return { statusCode: 401, headers: cors, body: JSON.stringify({ error: 'Missing Authorization header' }) };
  }

  const orgId = event.queryStringParameters?.org_id;
  if (!orgId) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Missing org_id' }) };
  }

  const supabase = supabaseForRequest(auth);

  // Probeer eerst met expliciete inner join hint; als dat faalt, val terug op simpele relatie-naam
  // zodat het werkt ongeacht hoe de FK in Supabase heet.
  let data: any[] | null = null;
  let error: any = null;

  // Variant A: expliciete FK-hint
  let res = await supabase
    .from('memberships')
    .select(
      `
      org_id,
      user_id,
      role,
      created_at,
      profiles!inner(email)
    `
    )
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });

  if (res.error) {
    // Variant B: eenvoudige relatie-naam
    res = await supabase
      .from('memberships')
      .select(
        `
        org_id,
        user_id,
        role,
        created_at,
        profiles(email)
      `
      )
      .eq('org_id', orgId)
      .order('created_at', { ascending: false });
  }

  data = res.data;
  error = res.error;

  if (error) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: error.message }) };
  }

  // Flatten naar vlak veld `email`
  const items =
    (data || []).map((row: any) => ({
      org_id: row.org_id,
      user_id: row.user_id,
      role: row.role,
      created_at: row.created_at,
      email: row.profiles?.email ?? null,
    })) ?? [];

  return { statusCode: 200, headers: cors, body: JSON.stringify({ items }) };
};
