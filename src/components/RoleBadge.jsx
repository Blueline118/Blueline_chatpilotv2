// change: read role from consolidated auth context
import { useAuth } from '../providers/AuthProvider';

const colorByRole = {
  ADMIN: { bg: '#eef4ff', text: '#194297', border: '#cfe0ff' },
  TEAM: { bg: '#eefaf2', text: '#1f7a46', border: '#cdeed9' },
  CUSTOMER: { bg: '#fff7ea', text: '#7a4d1f', border: '#f5e1bd' },
};

export default function RoleBadge({ role: roleProp, className = '' }) {
  const { roleForActiveOrg } = useAuth();
  const role = roleProp ?? roleForActiveOrg;
  const normalized = role ? String(role).toUpperCase() : null;
  const palette = normalized ? colorByRole[normalized] || colorByRole.CUSTOMER : null;

  return (
    <span
      className={`inline-flex items-center px-2 py-[2px] rounded-full text-[11px] font-medium border ${className}`}
      style={{
        backgroundColor: palette?.bg ?? '#f3f4f6',
        color: palette?.text ?? '#4b5563',
        borderColor: palette?.border ?? '#d1d5db',
      }}
      title={normalized ? `Rol: ${normalized}` : 'Geen actieve rol'}
    >
      {normalized ?? '—'}
    </span>
  );
}
