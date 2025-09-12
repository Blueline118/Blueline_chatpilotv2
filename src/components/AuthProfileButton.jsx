// src/components/AuthProfileButton.jsx
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function AuthProfileButton() {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        // Session + user ophalen zonder AuthProvider
        const { data: s } = await supabase.auth.getSession();
        if (cancelled) return;
        setSession(s?.session || null);

        const { data: u } = await supabase.auth.getUser();
        if (cancelled) return;
        setUser(u?.user || null);

        // Probeer rol te bepalen (optioneel, alleen als org + user bestaan)
        const activeOrgId = localStorage.getItem('activeOrgId');
        if (u?.user?.id && activeOrgId) {
          const { data, error } = await supabase
            .from('memberships')
            .select('role')
            .eq('org_id', activeOrgId)
            .eq('user_id', u.user.id)
            .single();
          if (!error && data?.role) setRole(data.role);
        }
      } catch {
        // geen crash; laat gewoon de Inloggen-knop zien
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  // Niet ingelogd → simpele link naar /login, geen Router nodig
  if (!session) {
    return (
      <a
        href="/login"
        className="w-full block text-center px-3 py-2 rounded-lg text-sm font-medium text-white bg-[#194297] hover:opacity-90"
      >
        Inloggen
      </a>
    );
  }

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
              // Zonder Router: gewoon hard navigeren
              window.location.href = '/login';
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
