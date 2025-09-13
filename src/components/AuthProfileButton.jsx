// src/components/AuthProfileButton.jsx
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../providers/AuthProvider';
import { useMembership } from '../hooks/useMembership';

/**
 * Props:
 * - expanded (boolean): true = sidebar open, false = sidebar dicht
 *
 * Regels:
 * - Uitgelogd + expanded=false -> niets
 * - Uitgelogd + expanded=true  -> subtiele inlogknop
 * - Ingelogd  + expanded=false -> alleen avatar
 * - Ingelogd  + expanded=true  -> avatar + naam + rol + uitloggen
 *
 * (Mobiel volgt exact dezelfde regels; "expanded" is dus leidend.)
 */
export default function AuthProfileButton({ expanded }) {
  const { session, user } = useAuth();
  const { role } = useMembership();
  const [busy, setBusy] = useState(false);

  // --- UITGELOGD ---
  if (!session) {
    // Sidebar dicht: niets tonen (desktop én mobiel)
    if (!expanded) return null;

    // Sidebar open: subtiele, smalle inlogknop
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

  // --- INGELOGD ---
  const initials = String(user?.email || '?').slice(0, 2).toUpperCase();

  // Sidebar dicht: alleen avatar
  if (!expanded) {
    return (
      <div className="w-full flex items-center justify-center">
        <div className="w-9 h-9 rounded-full bg-[#e8efff] grid place-items-center text-[#194297] font-semibold">
          {initials}
        </div>
      </div>
    );
  }

  // Sidebar open: volledige info + uitloggen
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

      <div className="mt-2">
        <button
          type="button"
          onClick={async () => {
            try {
              setBusy(true);
              await supabase.auth.signOut();
            } finally {
              setBusy(false);
              window.location.replace('/app'); // terug naar hoofdpagina
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
