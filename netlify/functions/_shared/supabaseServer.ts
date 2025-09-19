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
  });
}
