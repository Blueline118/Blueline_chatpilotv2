import { usePermission } from '../hooks/usePermission';

export default function PermissionGate({ perm, fallback = null, children }) {
  const { allowed, loading, error } = usePermission(perm);

  if (loading) return fallback ?? null;
  if (error) return fallback ?? null;
  if (!allowed) return fallback ?? null;

  return children;
}
