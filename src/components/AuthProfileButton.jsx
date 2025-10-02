// change: display role badge from consolidated auth context
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../providers/AuthProvider';
import RoleBadge from './RoleBadge';

export default function AuthProfileButton({ expanded }) {
  const { session, user, setActiveOrgId, roleForActiveOrg } = useAuth();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!session) {
      setBusy(false);
    }
  }, [session]);

  if (!session) {
    if (!expanded) return null;
    return (
      <a
        href="/login?intent=1"
        className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-full border border-[#cfd7ee] text-xs font-medium text-[#194297] hover:bg-[#eef3ff] transition-colors"
        title="Inloggen"
      >
        <span aria-hidden className="inline-block w-1.5 h-1.5 rounded-full bg-[#194297]" />
        Inloggen
      </a>
    );
  }

  const initials = String(user?.email || '?').slice(0, 2).toUpperCase();

  if (!expanded) {
    return (
      <div className="w-full flex items-center justify-center">
        <div className="w-9 h-9 rounded-full bg-[#e8efff] grid place-items-center text-[#194297] font-semibold">
          {initials}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-[#e8efff] grid place-items-center text-[#194297] font-semibold">
          {initials}
        </div>
        <div className="min-w-0">
          <div className="text-sm font-medium text-[#194297] truncate">{user?.email}</div>
          <div className="text-[11px] text-[#66676b] flex items-center gap-1">
            <span>Rol:</span>
            <RoleBadge role={roleForActiveOrg ?? undefined} />
          </div>
        </div>
      </div>

      <div className="mt-2">
        <button
          type="button"
          onClick={async () => {
            try {
              setBusy(true);
              await supabase.auth.signOut();
            } finally {
              setBusy(false);
              setActiveOrgId(null);
              window.location.assign('/login');
            }
          }}
          className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-md border border-[#e4e7f2] text-[12px] hover:bg-gray-50 transition-colors"
          disabled={busy}
          title="Uitloggen"
        >
          <span aria-hidden className="inline-block w-1.5 h-1.5 rounded-full bg-[#66676b]" />
          {busy ? 'Uitloggen…' : 'Uitloggen'}
        </button>
      </div>
    </div>
  );
}
