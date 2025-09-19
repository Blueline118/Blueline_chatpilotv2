chore/smoke-rls-update
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

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export function buildCorsHeaders(originHeader: string | null) {
  const origin = originHeader && originHeader.trim() ? originHeader : '*';
  return { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } as const;
}

export function supabaseForRequest(authHeader: string | null): SupabaseClient {
  const supabaseUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    const error = new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY env vars');
    (error as any).status = 500;
    (error as any).code = 'SUPABASE_CONFIG_MISSING';
    throw error;
  }

  if (!authHeader || !/^Bearer\s+.+/i.test(authHeader)) {
    const error = new Error('Missing Authorization bearer token');
    (error as any).status = 401;
    (error as any).code = 'NO_AUTH_HEADER';
    throw error;
  }

  return createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: {
        Authorization: authHeader,
        apikey: anonKey,
      },
    },
main
  });
}
