// change: wait for auth/permission to finish loading before redirecting (prevents bounce back from /app/members)
import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../providers/AuthProvider';
import usePermission from '../hooks/usePermission';

/**
 * Props:
 *  - requireSession?: boolean
 *  - requireMembership?: boolean   (optional; if you already gate with perm, this can be false)
 *  - perm?: string                 e.g. 'org:admin'
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

  // 1) Session gating
  if (requireSession) {
    if (session === undefined) {
      // auth state is still resolving -> render nothing to avoid premature redirect
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
      return null; // wait until memberships known
    }
    const hasAny = Array.isArray(memberships) && memberships.length > 0;
    if (!hasAny) {
      return <Navigate to="/app" replace />;
    }
  }

  // 3) Permission gating (wait for result)
  if (perm) {
    // usePermission should return { allowed, isLoading, error }
    const { allowed, isLoading } = usePermission(perm, activeOrgId);

    if (isLoading || allowed === undefined) {
      return null; // IMPORTANT: do not redirect while loading
    }
    if (allowed !== true) {
      return <Navigate to="/app" replace />;
    }
  }

  return <>{children}</>;
}
