import { errorResponse, jsonResponse, optionsResponse } from './_shared/http';
import { supabaseForRequest } from './_shared/supabaseServer';

function isProfilesJoinError(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const message = 'message' in error && typeof (error as any).message === 'string'
    ? (error as any).message.toLowerCase()
    : '';
  return message.includes('profiles') && (message.includes('relationship') || message.includes('join'));
}

type MembershipRow = {
  org_id: string;
  user_id: string;
  role: string;
  created_at?: string | null;
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
    const { data, error: dbError } = await supabase
      .from('memberships')
      .select('org_id, user_id, role, created_at, profiles!inner(email)')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false });

    if (dbError) {
      if (isProfilesJoinError(dbError)) {
        const { data: viewData, error: viewError } = await supabase
          .from('v_org_members')
          .select('org_id, user_id, role, created_at, email')
          .eq('org_id', orgId)
          .order('created_at', { ascending: false });

        if (viewError) {
          return errorResponse(request, 400, 'profiles join unavailable', 'PROFILES_JOIN_UNAVAILABLE');
        }

        const items = (viewData ?? []).map((row: any) => ({
          org_id: row.org_id,
          user_id: row.user_id,
          role: row.role,
          created_at: row.created_at ?? null,
          email: row.email ?? '',
        }));

        return jsonResponse(request, 200, { items });
      }

      const status = typeof (dbError as any).status === 'number' ? (dbError as any).status : 400;
      return errorResponse(request, status, dbError, (dbError as any).code);
    }

    const items = (data ?? []).map((row: MembershipRow) => ({
      org_id: row.org_id,
      user_id: row.user_id,
      role: row.role,
      created_at: row.created_at ?? null,
      email: row.profiles?.email ?? '',
    }));

    return jsonResponse(request, 200, { items });
  } catch (err) {
    console.error('[listMemberships] unexpected error', err);
    return errorResponse(request, 500, 'Unexpected server error', 'SERVER_ERROR');
  }
}
