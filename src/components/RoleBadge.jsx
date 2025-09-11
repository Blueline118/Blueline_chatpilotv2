// src/components/RoleBadge.jsx
import { useMembership } from '../hooks/useMembership';

export default function RoleBadge() {
  const { role, loading } = useMembership();

  if (loading) return null;
  if (!role) return null;

  const style = {
    fontSize: 12,
    padding: '2px 8px',
    borderRadius: 999,
    border: '1px solid #ddd',
  };

  return <span style={style}>{role}</span>;
}
