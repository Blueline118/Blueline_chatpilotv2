// src/components/PermissionGate.jsx
import React from 'react';
import { usePermission } from '../hooks/usePermission';

export default function PermissionGate({ perm, fallback = null, children }) {
  const { allowed, loading } = usePermission(perm);

  if (loading) return fallback;     // of null / skeleton
  if (!allowed) return null;
  return children;
}

