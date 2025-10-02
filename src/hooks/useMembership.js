// change: delegate membership state to AuthProvider
import { useAuth } from '../providers/AuthProvider';

export function useMembership() {
  const { activeOrgId, roleForActiveOrg, memberships, refreshMemberships } = useAuth();
  return {
    activeOrgId,
    role: roleForActiveOrg,
    memberships,
    refresh: refreshMemberships,
  };
}

export default useMembership;
