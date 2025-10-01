// src/components/PermissionGate.jsx
import React from 'react';
import { usePermission } from '../hooks/usePermission';
import { useAuth } from '../providers/AuthProvider';

/**
 * Gebruik:
 * <PermissionGate perm="org:admin">
 *   {({ allowed }) => allowed ? <NavLink .../> : null}
 * </PermissionGate>
 *
 * Of zonder render-prop:
 * <PermissionGate perm="org:admin"><NavLink .../></PermissionGate>
 */
export default function PermissionGate({ perm, children }) {
  // Verberg standaard als je niet bent ingelogd.
  let session = null;
  try {
    // defensief: useAuth bestaat in jouw project
    const auth = useAuth?.();
    session = auth?.session ?? null;
  } catch (_) {
    session = null;
  }
  if (!session) return null;

  const { allowed, loading, error } = usePermission(perm);

  // Niets tonen tijdens laden of error (liever te strikt).
  if (loading || error) return null;

  // Render-prop variant
  if (typeof children === 'function') {
    return children({ allowed: !!allowed, loading, error });
  }

  // Children variant
  return allowed ? <>{children}</> : null;
}
