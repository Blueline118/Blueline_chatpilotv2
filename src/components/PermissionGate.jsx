// change: gate children with has_permission rpc
import { useEffect, useState } from 'react';
import { useAuth } from '../providers/AuthProvider';

export default function PermissionGate({ perm, children, fallback = null }) {
  const { session, activeOrgId, hasPermission } = useAuth();
  const [allowed, setAllowed] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;

    if (!perm) {
      setAllowed(false);
      setChecking(false);
      return () => {
        cancelled = true;
      };
    }

    if (!session || !activeOrgId) {
      setAllowed(false);
      setChecking(false);
      return () => {
        cancelled = true;
      };
    }

    setChecking(true);
    hasPermission(activeOrgId, perm).then((result) => {
      if (cancelled) return;
      setAllowed(Boolean(result));
      setChecking(false);
    });

    return () => {
      cancelled = true;
    };
  }, [activeOrgId, hasPermission, perm, session]);

  if (!perm || !session || !activeOrgId) return fallback;
  if (checking) return null;
  if (!allowed) return fallback;

  return <>{children}</>;
}
