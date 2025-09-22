// netlify/functions/_shared/supabaseServer.ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

function required(name: string, v?: string | null) {
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

/** CORS-helper voor alle functies */
export function buildCorsHeaders(origin?: string) {
  const allowOrigin = origin ?? '*';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization,content-type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  };
}

/** Client met anon key — gebruikt de caller JWT als Authorization header (RLS) */
export function supabaseForRequest(authHeader?: string): SupabaseClient {
  const url =
    process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const anon =
    process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !anon) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY');
  }

  return createClient(url, anon, {
    global: { headers: authHeader ? { Authorization: authHeader } : {} },
    db: { schema: 'public' },
  });
}

/** Service-role client — alleen server-side gebruiken! */
export function supabaseAdmin(): SupabaseClient {
  const url = required('SUPABASE_URL', process.env.SUPABASE_URL);
  const key = required(
    'SUPABASE_SERVICE_ROLE_KEY',
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  return createClient(url, key, {
    db: { schema: 'public' }, // forceer public zodat "schema must be one of..." verdwijnt
  });
}
