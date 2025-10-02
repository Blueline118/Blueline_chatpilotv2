// change: enforce membership-aware permission checks
import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../providers/AuthProvider';

export default function Protected({ children, perm = null, requireMembership = false }) {
  const {
    session,
    activeOrgId,
    memberships,
    membershipsLoading,
    initializing,
    hasPermission,
  } = useAuth();
  const location = useLocation();
  const [allowed, setAllowed] = useState(!perm);
  const [checkingPerm, setCheckingPerm] = useState(!!perm);

  useEffect(() => {
    let cancelled = false;

    if (!perm) {
      setAllowed(true);
      setCheckingPerm(false);
      return () => {
        cancelled = true;
      };
    }

    if (!activeOrgId) {
      setAllowed(false);
      setCheckingPerm(false);
      return () => {
        cancelled = true;
      };
    }

    setCheckingPerm(true);
    hasPermission(activeOrgId, perm).then((result) => {
      if (cancelled) return;
      setAllowed(Boolean(result));
      setCheckingPerm(false);
    });

    return () => {
      cancelled = true;
    };
  }, [activeOrgId, hasPermission, perm]);

  if (initializing) {
    return null;
  }

  if (session === undefined) {
    return null;
  }

  if (!session) {
    const next = location.pathname + location.search;
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
  }

  if (requireMembership) {
    if (membershipsLoading) {
      return null;
    }
    const hasMembership = Boolean(
      activeOrgId && memberships.some((member) => member.org_id === activeOrgId),
    );
    if (!hasMembership) {
      return <Navigate to="/login?reason=no-membership" replace />;
    }
  }

  if (perm) {
    if (checkingPerm) {
      return null;
    }
    if (!allowed) {
      return <Navigate to="/app" replace />;
    }
  }

  return children;
}
