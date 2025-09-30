// src/components/PermissionGate.jsx
import { usePermission } from '../hooks/usePermission';

/**
 * Gebruik:
 * <PermissionGate perm="org:admin">
 *   {({ allowed, loading, error }) =>
 *      allowed && <div>Alleen zichtbaar voor admins</div>
 *   }
 * </PermissionGate>
 *
 * Props:
 * - perm (string): vereiste permissie (bijv. "org:admin").
 * - children: function | ReactNode
 *   - Als function: krijgt { allowed, loading, error }
 *   - Als node: wordt alleen gerenderd als allowed === true
 */
export default function PermissionGate({ perm, children }) {
  const { allowed, loading, error } = usePermission(perm);

  if (typeof children === 'function') {
    return children({ allowed, loading, error });
  }

  if (loading) return null;
  if (error) {
    console.warn(`[PermissionGate] check voor ${perm} faalde`, error);
    return null;
  }

  return allowed ? children : null;
}
