import { errorResponse, getJsonBody, jsonResponse, optionsResponse, supabaseForRequest } from './_shared';

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

  const { supabase, error } = supabaseForRequest(request);
  if (error) return error;

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
