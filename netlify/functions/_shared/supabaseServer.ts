import { createClient, type SupabaseClient } from '@supabase/supabase-js';

function getEnv(name: string, alt?: string): string {
  const v = process.env[name] ?? alt;
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

export function buildCorsHeaders(origin?: string) {
  const allowOrigin = origin ?? '*';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization,content-type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  };
}

/**
 * Client voor verzoeken met de user-JWT (RLS afdwingen).
 */
export function supabaseForRequest(authHeader?: string): SupabaseClient {
  const url = getEnv('SUPABASE_URL') ?? process.env.VITE_SUPABASE_URL;
  const anon = getEnv('SUPABASE_ANON_KEY') ?? process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY env vars');

  return createClient(url, anon, {
    global: { headers: authHeader ? { Authorization: authHeader } : {} },
    db: { schema: 'public' }, // forceer public schema
  });
}

/**
 * Enkele, unieke export: service-role client voor server-side acties (geen RLS).
 */
export function supabaseAdmin(): SupabaseClient {
  const url = getEnv('SUPABASE_URL');
  const key = getEnv('SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: 'public' }, // forceer public schema
  });
}
