import { createClient } from '@supabase/supabase-js';

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8' } as const;

function corsHeaders(request: Request) {
  const origin = request.headers.get('origin') || '*';
  return { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' };
}

function extractBearerToken(headerValue: string | null) {
  if (!headerValue) return null;
  const match = headerValue.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  return match[1]?.trim() || null;
}

function missingEnvResponse(request: Request) {
  return new Response(
    JSON.stringify({ error: 'Missing SUPABASE_URL or SUPABASE_ANON_KEY env vars' }),
    {
      status: 500,
      headers: { ...JSON_HEADERS, ...corsHeaders(request) },
    }
  );
}

function optionsResponse(request: Request) {
  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders(request),
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    },
  });
}

function buildErrorResponse(request: Request, status: number, error: unknown, code?: string) {
  const message =
    (typeof error === 'string' && error) ||
    (error && typeof error === 'object' && 'message' in error && typeof (error as any).message === 'string'
      ? (error as any).message
      : 'Onbekende fout');

  const details =
    error && typeof error === 'object' && 'details' in error && typeof (error as any).details === 'string'
      ? (error as any).details
      : undefined;

  const payload: Record<string, unknown> = { error: message };
  if (code) payload.code = code;
  if (details) payload.details = details;

  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...JSON_HEADERS, ...corsHeaders(request) },
  });
}

export default async function handler(request: Request) {
  if (request.method === 'OPTIONS') return optionsResponse(request);

  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Use GET' }), {
      status: 405,
      headers: { ...JSON_HEADERS, ...corsHeaders(request) },
    });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return missingEnvResponse(request);

  const token = extractBearerToken(request.headers.get('authorization'));
  if (!token) {
    return buildErrorResponse(request, 401, 'Missing Authorization header', 'NO_TOKEN');
  }

  const supabase = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error) {
      const status = typeof (error as any).status === 'number' ? (error as any).status : 400;
      return buildErrorResponse(request, status, error, (error as any).code);
    }

    return new Response(JSON.stringify({ user: data?.user ?? null }), {
      status: 200,
      headers: { ...JSON_HEADERS, ...corsHeaders(request) },
    });
  } catch (err) {
    console.error('[getProfile] unexpected error', err);
    return buildErrorResponse(request, 500, 'Unexpected server error', 'SERVER_ERROR');
  }
}
