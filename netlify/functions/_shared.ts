import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8' } as const;

function extractBearerToken(headerValue: string | null) {
  if (!headerValue) return null;
  const match = headerValue.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  return match[1]?.trim() || null;
}

export function buildCorsHeaders(request: Request) {
  const origin = request.headers.get('origin') || '*';
  return { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } as const;
}

export function jsonResponse(request: Request, status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...JSON_HEADERS, ...buildCorsHeaders(request) },
  });
}

export function optionsResponse(request: Request, methods: string[]) {
  const allow = Array.from(
    new Set([
      ...methods.map((method) => method.toUpperCase()),
      'OPTIONS',
    ])
  );
  return new Response(null, {
    status: 204,
    headers: {
      ...buildCorsHeaders(request),
      'Access-Control-Allow-Methods': allow.join(', '),
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    },
  });
}

export function errorResponse(request: Request, status: number, error: unknown, code?: string) {
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

  return jsonResponse(request, status, payload);
}

type SupabaseForRequestResult = { supabase: SupabaseClient; token: string } | { error: Response };

export function supabaseForRequest(request: Request): SupabaseForRequestResult {
  const supabaseUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    return {
      error: jsonResponse(request, 500, {
        error: 'Missing SUPABASE_URL or SUPABASE_ANON_KEY env vars',
      }),
    };
  }

  const token = extractBearerToken(request.headers.get('authorization'));
  if (!token) {
    return { error: errorResponse(request, 401, 'Missing Authorization header') };
  }

  const supabase = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  return { supabase, token };
}

export async function getJsonBody<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}
