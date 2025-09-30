// src/components/Protected.jsx
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../providers/AuthProvider';
import { usePermission } from '../hooks/usePermission';

/**
 * <Protected perm="org:admin">...</Protected>
 * - Blokkeert weergave tot auth klaar is
 * - Stuur uitgelogde user naar /login?next=...
 * - Optioneel: check permissie; zo niet -> /app
 */
export default function Protected({ children, perm = null }) {
  const { session, loading } = useAuth();
  const location = useLocation();

  // 1) Wacht op auth init; voorkom knipperen/loops
  if (loading) return null;

  // 2) Niet ingelogd -> naar login met 'next'
  if (!session) {
    const next = location.pathname + location.search;
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
  }

  // 3) Optionele permissie-check (org:admin e.d.)
  if (perm) {
    const { allowed, loading: pLoading } = usePermission(perm);
    if (pLoading) return null;
    if (!allowed) return <Navigate to="/app" replace />;
  }

  return children;
}
