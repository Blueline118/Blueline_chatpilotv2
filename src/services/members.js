// change: add helper to refresh memberships after mutations
import { supabase } from '../lib/supabaseClient';
import { error as logError } from '../lib/log';

const MEMBER_ROLES = ['ADMIN', 'TEAM', 'CUSTOMER'];

function normalizeRole(role) {
  if (!role) return '';
  return String(role).trim().toUpperCase();
}

function loggableError(err) {
  if (!err) return null;
  const base = typeof err === 'object' ? err : { message: String(err) };
  return {
    message: base.message ?? String(base),
    code: base.code ?? base.status ?? null,
    details: base.details ?? undefined,
  };
}

export async function deleteMember(orgId, memberUserId) {
  const { data, error } = await supabase.rpc('admin_delete_member', {
    p_org_id: orgId,
    p_member_id: memberUserId,
  });

  if (error) {
    logError('services.members.delete_member_failed', {
      orgId,
      memberUserId,
      error: loggableError(error),
    });
    throw error;
  }

  return data;
}

export async function updateMemberRole(orgId, memberUserId, role) {
  const nextRole = normalizeRole(role);
  const { data, error } = await supabase.rpc('admin_update_member_role', {
    p_org_id: orgId,
    p_member_id: memberUserId,
    p_role: nextRole,
  });

  if (error) {
    logError('services.members.update_member_role_failed', {
      orgId,
      memberUserId,
      role: nextRole,
      error: loggableError(error),
    });
    throw error;
  }

  return data;
}

export async function refetchAfterMembersMutation(refreshMemberships, refetchList) {
  if (typeof refreshMemberships === 'function') {
    await refreshMemberships();
  }
  if (typeof refetchList === 'function') {
    await refetchList();
  }
}

export { MEMBER_ROLES };
