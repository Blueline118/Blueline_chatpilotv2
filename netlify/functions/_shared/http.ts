const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8' } as const;

import { buildCorsHeaders } from './supabaseServer';

export function jsonResponse(request: Request, status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...JSON_HEADERS,
      ...buildCorsHeaders(request.headers.get('origin')),
    },
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
    status: 200,
    headers: {
      ...buildCorsHeaders(request.headers.get('origin')),
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

export async function getJsonBody<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

export function extractBearerToken(headerValue: string | null) {
  if (!headerValue) return null;
  const match = headerValue.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  return match[1]?.trim() || null;
}
