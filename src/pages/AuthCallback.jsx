// src/components/AuthProfileButton.jsx
import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../providers/AuthProvider';
import { useMembership } from '../hooks/useMembership';

export default function AuthProfileButton() {
  const { session, user } = useAuth();   // jouw provider
  const { role } = useMembership();      // ADMIN / TEAM / CUSTOMER
  const [busy, setBusy] = useState(false);

  // Niet ingelogd → altijd naar /login?intent=1 (geen Router nodig)
  if (!session) {
    return (
      <a
        href="/login?intent=1"
        className="w-full block text-center px-3 py-2 rounded-lg text-sm font-medium text-white bg-[#194297] hover:opacity-90"
      >
        Inloggen
      </a>
    );
  }

  // Ingelogd → subtiel profielblok + uitloggen
  const initials = String(user?.email || '?').slice(0,2).toUpperCase();

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
              // Altijd terug naar je Chatpilot-UI
              window.location.replace('/app');
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
