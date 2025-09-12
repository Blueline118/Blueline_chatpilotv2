// src/components/AuthProfileButton.jsx
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../providers/AuthProvider';
import { useMembership } from '../hooks/useMembership';

/**
 * Props:
 * - expanded (boolean): desktop/sidebar uitgeklapt
 *
 * Desktop:
 *  - expanded=true  -> volledig blok (email/rol/uitlog)
 *  - expanded=false -> alleen avatar (ingelogd) / niets (uitgelogd)
 * Mobiel (<768px):
 *  - ingelogd  -> alleen avatar
 *  - uitgelogd -> compacte Inloggen-knop (router-vrij)
 */
export default function AuthProfileButton({ expanded = true }) {
  const { session, user } = useAuth();
  const { role } = useMembership();
  const [busy, setBusy] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Mobiel detectie
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const apply = () => setIsMobile(mq.matches);
    apply();
    mq.addEventListener?.('change', apply);
    return () => mq.removeEventListener?.('change', apply);
  }, []);

  // UITGELOGD
  if (!session) {
    if (isMobile) {
      // Mobiel: compacte login-knop
      return (
        <a
          href="/login?intent=1"
          className="w-full block text-center px-3 py-2 rounded-lg text-sm font-medium text-white bg-[#194297] hover:opacity-90"
        >
          Inloggen
        </a>
      );
    }
    // Desktop collapsed -> niets
    if (!expanded) return null;
    // Desktop expanded -> grote login-knop
    return (
      <a
        href="/login?intent=1"
        className="w-full block text-center px-3 py-2 rounded-lg text-sm font-medium text-white bg-[#194297] hover:opacity-90"
      >
        Inloggen
      </a>
    );
  }

  // INGELOGD
  const initials = String(user?.email || '?').slice(0, 2).toUpperCase();

  // Mobiel: alleen avatar
  if (isMobile) {
    return (
      <div className="w-full flex items-center justify-center">
        <div className="w-9 h-9 rounded-full bg-[#e8efff] grid place-items-center text-[#194297] font-semibold">
          {initials}
        </div>
      </div>
    );
  }

  // Desktop collapsed: alleen avatar
  if (!expanded) {
    return (
      <div className="w-full flex items-center justify-center">
        <div className="w-9 h-9 rounded-full bg-[#e8efff] grid place-items-center text-[#194297] font-semibold">
          {initials}
        </div>
      </div>
    );
  }

  // Desktop expanded: volledig profielblok + uitloggen
  return (
    <div className="w-full">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-[#e8efff] grid place-items-center text-[#194297] font-semibold">
          {initials}
        </div>
        <div className="min-w-0">
          <div className="text-sm font-medium text-[#194297] truncate">{user?.email}</div>
          <div className="text-[11px] text-[#66676b]">Rol: {role ?? '—'}</div>
        </div>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={async () => {
            try {
              setBusy(true);
              await supabase.auth.signOut();
            } finally {
              setBusy(false);
              window.location.replace('/app'); // terug naar main UI
            }
          }}
          className="px-3 py-1.5 rounded-md border text-[12px] hover:bg-gray-50"
          disabled={busy}
        >
          {busy ? 'Uitloggen…' : 'Uitloggen'}
        </button>
      </div>
    </div>
  );
}
