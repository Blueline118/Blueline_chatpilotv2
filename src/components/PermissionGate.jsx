// src/components/PermissionGate.jsx
import { usePermission } from '../hooks/usePermission';

export default function PermissionGate({ perm, children, fallback = null }) {
  const { allowed, loading, error } = usePermission(perm);

  if (loading) return null;         // of een skeleton/loader
  if (error)   return fallback;     // verberg bij fout, UI blijft rustig
  return allowed ? children : fallback;
}
