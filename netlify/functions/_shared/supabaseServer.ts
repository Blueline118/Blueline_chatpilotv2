import { createClient, type SupabaseClient } from '@supabase/supabase-js';

function reqEnv(name: string, alt?: string) {
  const v = process.env[name] ?? alt;
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

export function buildCorsHeaders(origin?: string) {
  const allow = origin ?? '*';
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization,content-type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  };
}

export function supabaseForRequest(authHeader?: string): SupabaseClient {
  const url  = reqEnv('SUPABASE_URL',        process.env.VITE_SUPABASE_URL);
  const anon = reqEnv('SUPABASE_ANON_KEY',   process.env.VITE_SUPABASE_ANON_KEY);

  return createClient(url, anon, {
    global: authHeader ? { headers: { Authorization: authHeader } } : {},
    db: { schema: 'public' },                  // ← BELANGRIJK
  });
}

export function supabaseAdmin(): SupabaseClient {
  const url = reqEnv('SUPABASE_URL');
  const key = reqEnv('SUPABASE_SERVICE_ROLE_KEY');

  return createClient(url, key, {
    db: { schema: 'public' },                  // ← BELANGRIJK
  });
}
