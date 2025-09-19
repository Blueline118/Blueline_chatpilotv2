import { errorResponse, getJsonBody, jsonResponse, optionsResponse } from './_shared/http';
import { supabaseForRequest } from './_shared/supabaseServer';

type DeleteMemberBody = {
  p_org?: string;
  p_target?: string;
};

export default async function handler(request: Request) {
  if (request.method === 'OPTIONS') return optionsResponse(request, ['POST']);

  if (request.method !== 'POST') {
    return errorResponse(request, 405, 'Use POST', 'METHOD_NOT_ALLOWED');
  }

  const body = (await getJsonBody<DeleteMemberBody>(request)) ?? {};
  const { p_org, p_target } = body;

  if (typeof p_org !== 'string' || typeof p_target !== 'string') {
    return errorResponse(request, 400, 'Body must include p_org (uuid) and p_target (uuid)', 'BAD_REQUEST');
  }

  const authHeader = request.headers.get('authorization');

  let supabase;
  try {
    supabase = supabaseForRequest(authHeader);
  } catch (err) {
    const status = typeof (err as any)?.status === 'number' ? (err as any).status : 500;
    const code = typeof (err as any)?.code === 'string' ? (err as any).code : undefined;
    return errorResponse(request, status, err, code);
  }

  try {
    const { error: rpcError } = await supabase.rpc('delete_member', {
      p_org,
      p_target,
    });

    if (rpcError) {
      const status = typeof (rpcError as any).status === 'number' ? (rpcError as any).status : 400;
      return errorResponse(request, status, rpcError, (rpcError as any).code);
    }

    return jsonResponse(request, 200, { ok: true });
  } catch (err) {
    console.error('[deleteMember] unexpected error', err);
    return errorResponse(request, 500, 'Unexpected server error', 'SERVER_ERROR');
  }
}
