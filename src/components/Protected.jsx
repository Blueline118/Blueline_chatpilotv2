// change: wait for auth/permission to finish loading before redirecting (prevents bounce) + fix named import + call hook at top
import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../providers/AuthProvider';
import { usePermission } from '../hooks/usePermission';

/**
 * Props:
 *  - requireSession?: boolean
 *  - requireMembership?: boolean
 *  - perm?: string
 *  - children: React.ReactNode
 */
export default function Protected({
  requireSession = false,
  requireMembership = false,
  perm,
  children,
}) {
  const location = useLocation();
  const { session, activeOrgId, memberships, membershipsLoading } = useAuth() || {};

  // Prepare permission state (call hook unconditionally at the top)
  const permState = perm
    ? usePermission(perm, activeOrgId) // expects { allowed, isLoading, error }
    : { allowed: true, isLoading: false };

  // 1) Session gating
  if (requireSession) {
    if (session === undefined) {
      // auth still resolving -> avoid premature redirect
      return null;
    }
    if (!session) {
      const next = encodeURIComponent(location.pathname + location.search);
      return <Navigate to={`/login?next=${next}`} replace />;
    }
  }

  // 2) Membership gating (optional)
if (requireMembership) {
  if (membershipsLoading || memberships === undefined) {
    return null; // wachten tot bekend
  }
  const hasAny = Array.isArray(memberships) && memberships.length > 0;
  if (!hasAny) {
    // << wijziging: stuur naar /no-access i.p.v. /app
    return <Navigate to="/no-access" replace />;
  }
}

  // 3) Permission gating (wait for result; don't redirect while loading)
  if (perm) {
    const { allowed, isLoading } = permState;
    if (isLoading || allowed === undefined) {
      return null;
    }
    if (allowed !== true) {
      return <Navigate to="/app" replace />;
    }
  }

  return <>{children}</>;
}
