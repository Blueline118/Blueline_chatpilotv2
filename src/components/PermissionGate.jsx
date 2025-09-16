// src/components/PermissionGate.jsx
import { usePermission } from '../hooks/usePermission';

export default function PermissionGate({ perm, children, fallback = null }) {
  const { allowed, loading, error } = usePermission(perm);

  if (loading) {
    return fallback ?? null;
  }

  if (error) {
    console.warn('[PermissionGate]', perm, error);
    return fallback ?? null;
  }

  return allowed ? children : (fallback ?? null);
}
