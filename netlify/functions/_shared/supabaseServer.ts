import { createClient } from '@supabase/supabase-js';

export function getAllowedOrigin(originHeader?: string) {
  const env = process.env.ALLOWED_ORIGINS || '';
  const allowlist = env.split(',').map(s => s.trim()).filter(Boolean);
  if (!originHeader) return '*';
  if (allowlist.length === 0) return '*';
  return allowlist.includes(originHeader) ? originHeader : allowlist[0] || '*';
}

export function buildCorsHeaders(originHeader?: string) {
  const allow = getAllowedOrigin(originHeader);
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, content-type, x-requested-with',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  };
}

export function supabaseForRequest(authorizationHeader?: string) {
  const SUPABASE_URL = process.env.SUPABASE_URL!;
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;
  const token = (authorizationHeader || '').startsWith('Bearer ')
    ? authorizationHeader!.slice('Bearer '.length)
    : undefined;

  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, detectSessionInUrl: false },
    global: { headers },
  });
}
