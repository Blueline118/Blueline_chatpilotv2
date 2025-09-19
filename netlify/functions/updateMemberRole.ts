import { errorResponse, getJsonBody, jsonResponse, optionsResponse, supabaseForRequest } from './_shared';

type UpdateMemberRoleBody = {
  p_org?: string;
  p_target?: string;
  p_role?: string;
};

export default async function handler(request: Request) {
  if (request.method === 'OPTIONS') return optionsResponse(request, ['POST']);

  if (request.method !== 'POST') {
    return errorResponse(request, 405, 'Use POST', 'METHOD_NOT_ALLOWED');
  }

  const body = (await getJsonBody<UpdateMemberRoleBody>(request)) ?? {};
  const { p_org, p_target, p_role } = body;

  if (typeof p_org !== 'string' || typeof p_target !== 'string' || typeof p_role !== 'string') {
    return errorResponse(
      request,
      400,
      'Body must include p_org (uuid), p_target (uuid) and p_role (text)',
      'BAD_REQUEST'
    );
  }

  const { supabase, error } = supabaseForRequest(request);
  if (error) return error;

  try {
    const { error: rpcError } = await supabase.rpc('update_member_role', {
      p_org,
      p_target,
      p_role,
    });

    if (rpcError) {
      const status = typeof (rpcError as any).status === 'number' ? (rpcError as any).status : 400;
      return errorResponse(request, status, rpcError, (rpcError as any).code);
    }

    return jsonResponse(request, 200, { ok: true });
  } catch (err) {
    console.error('[updateMemberRole] unexpected error', err);
    return errorResponse(request, 500, 'Unexpected server error', 'SERVER_ERROR');
  }
}
