// netlify/functions/_shared/supabaseServer.ts
import { createClient } from '@supabase/supabase-js';

export function buildCorsHeaders(origin?: string) {
  const allow = origin ?? '*';
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

/**
 * Maakt een Supabase client met de ANON key, en zet het
 * user JWT door in de Authorization header (RLS enforced).
 */
export function supabaseForRequest(authHeader: string) {
  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY env vars');

  return createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
  });
}
