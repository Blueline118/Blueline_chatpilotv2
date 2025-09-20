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

export function supabaseForRequest(authHeader?: string): SupabaseClient {
  // Prefer server envs; fall back to VITE_* if present
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY env vars');
  return createClient(url, anon, {
    global: { headers: authHeader ? { Authorization: authHeader } : {} },
  });
}

export function supabaseAdmin(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars');
  return createClient(url, key, { auth: { persistSession: false } });
}
