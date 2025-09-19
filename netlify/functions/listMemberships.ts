import { errorResponse, jsonResponse, optionsResponse, supabaseForRequest } from './_shared';

type MembershipRow = {
  org_id: string;
  user_id: string;
  role: string;
  profiles?: { email?: string | null } | null;
};

export default async function handler(request: Request) {
  if (request.method === 'OPTIONS') return optionsResponse(request, ['GET']);

  if (request.method !== 'GET') {
    return errorResponse(request, 405, 'Use GET', 'METHOD_NOT_ALLOWED');
  }

  const url = new URL(request.url);
  const orgId = url.searchParams.get('org_id')?.trim();

  if (!orgId) {
    return errorResponse(request, 400, 'Query parameter org_id is required', 'BAD_REQUEST');
  }

  const { supabase, error } = supabaseForRequest(request);
  if (error) return error;

  try {
    const { data, error: dbError } = await supabase
      .from('memberships')
      .select('org_id, user_id, role, profiles(email)')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false });

    if (dbError) {
      const status = typeof (dbError as any).status === 'number' ? (dbError as any).status : 400;
      return errorResponse(request, status, dbError, (dbError as any).code);
    }

    const items = (data ?? []).map((row: MembershipRow) => ({
      org_id: row.org_id,
      user_id: row.user_id,
      role: row.role,
      email: row.profiles?.email ?? '',
    }));

    return jsonResponse(request, 200, { items });
  } catch (err) {
    console.error('[listMemberships] unexpected error', err);
    return errorResponse(request, 500, 'Unexpected server error', 'SERVER_ERROR');
  }
}
