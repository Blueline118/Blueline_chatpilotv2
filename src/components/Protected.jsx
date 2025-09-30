// src/components/Protected.jsx
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../providers/AuthProvider';
import { usePermission } from '../hooks/usePermission';

export default function Protected({ children, perm }) {
  const location = useLocation();
  const { user, loading, activeOrgId } = useAuth();
  const requirePerm = Boolean(perm);
  const { allowed, loading: permLoading, error: permError } = usePermission(requirePerm ? perm : null);

  if (loading) return null;

  if (!user) {
    const path = `${location.pathname}${location.search || ''}`;
    const next = encodeURIComponent(path || '/app');
    return <Navigate to={`/login?next=${next}`} replace />;
  }

  if (requirePerm) {
    if (!activeOrgId) {
      return null;
    }

    if (permLoading) return null;

    if (permError) {
      console.warn('[Protected] permission check failed', perm, permError);
      return <Navigate to="/app" replace />;
    }

    if (!allowed) {
      return <Navigate to="/app" replace />;
    }
  }

  return children;
}
