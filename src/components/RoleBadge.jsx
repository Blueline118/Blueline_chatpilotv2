// src/components/RoleBadge.jsx
import { useMembership } from '../hooks/useMembership';

export default function RoleBadge() {
  const { role, loading } = useMembership();
  if (loading) return null;
  if (!role) return null;
  const tone = role === 'ADMIN' ? 'bg-black text-white' 
              : role === 'TEAM' ? 'bg-gray-900 text-white'
              : 'bg-gray-200 text-gray-800';
  return (
    <span className={`text-xs px-2 py-1 rounded-full ${tone}`}>
      {role}
    </span>
  );
}
