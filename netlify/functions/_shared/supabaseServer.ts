import { createClient, type SupabaseClient } from '@supabase/supabase-js';

type SupabaseHeaders = {
  Authorization: string;
};

type SupabaseOptions = {
  auth: {
    persistSession: false;
    autoRefreshToken: false;
  };
  global: {
    headers: SupabaseHeaders;
  };
};

function extractBearerToken(authHeader: string) {
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return (match ? match[1] : authHeader).trim();
}

export function supabaseForRequest(authHeader: string): SupabaseClient {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY env vars');
  }

  const token = extractBearerToken(authHeader);

  const options: SupabaseOptions = {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  };

  return createClient(supabaseUrl, supabaseAnonKey, options);
}

export function buildCorsHeaders(origin?: string | null) {
  const allowOrigin = origin ?? '*';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    Vary: 'Origin',
  } as const;
}
