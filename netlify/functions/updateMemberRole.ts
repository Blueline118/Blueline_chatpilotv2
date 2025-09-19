import type { Handler } from '@netlify/functions';
import { buildCorsHeaders, supabaseForRequest } from './_shared/supabaseServer';

type UpdateMemberRoleBody = {
  p_org?: string;
  p_target?: string;
  p_role?: string;
};

function parseJsonBody<T>(event: Parameters<Handler>[0]): T | null {
  if (!event.body) return null;
  try {
    const raw = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export const handler: Handler = async (event) => {
  const baseHeaders = buildCorsHeaders(event.headers.origin);
  const json = (statusCode: number, payload: unknown) => ({
    statusCode,
    headers: { ...baseHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: baseHeaders };
  }

  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Use POST' });
  }

  const body = parseJsonBody<UpdateMemberRoleBody>(event) ?? {};
  const { p_org, p_target, p_role } = body;

  if (typeof p_org !== 'string' || typeof p_target !== 'string' || typeof p_role !== 'string') {
    return json(400, {
      error: 'Body must include p_org (uuid), p_target (uuid) and p_role (text)',
    });
  }

  let supabase;
  try {
    supabase = supabaseForRequest(event.headers.authorization);
  } catch (e: any) {
    return json(500, { error: e?.message ?? 'Init error' });
  }

  const { error } = await supabase.rpc('update_member_role', {
    p_org,
    p_target,
    p_role,
  });

  if (error) {
    return json(error.status ?? 400, { error: error.message ?? 'RPC error' });
  }

  return json(200, { ok: true });
};
