// src/components/RoleBadge.jsx
import { useMembership } from '../hooks/useMembership';

const colorByRole = {
  ADMIN:   { bg: '#eef4ff', text: '#194297', border: '#cfe0ff' },
  TEAM:    { bg: '#eefaf2', text: '#1f7a46', border: '#cdeed9' },
  CUSTOMER:{ bg: '#fff7ea', text: '#7a4d1f', border: '#f5e1bd' },
};

export default function RoleBadge({ role: roleProp, className = '' }) {
  // Als er geen rol via props wordt meegegeven, val terug op je eigen rol
  const { role: myRole } = useMembership();
  const role = (roleProp || myRole || 'CUSTOMER').toUpperCase();

  const c = colorByRole[role] || colorByRole.CUSTOMER;

  return (
    <span
      className={`inline-flex items-center px-2 py-[2px] rounded-full text-[11px] font-medium border ${className}`}
      style={{ backgroundColor: c.bg, color: c.text, borderColor: c.border }}
      title={`Rol: ${role}`}
    >
      {role}
    </span>
  );
}
