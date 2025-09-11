// src/components/AuthProfileButton.jsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../providers/AuthProvider';
import { useMembership } from '../hooks/useMembership';

export default function AuthProfileButton() {
  const navigate = useNavigate();
  const { session, user } = useAuth();        // uit jouw AuthProvider
  const { role } = useMembership();           // bepaalt ADMIN/TEAM/CUSTOMER
  const [busy, setBusy] = useState(false);

  if (!session) {
    // Niet ingelogd: toon nette Inloggen-knop
    return (
      <button
        type="button"
        onClick={() => navigate('/login')}
        className="w-full px-3 py-2 rounded-lg text-sm font-medium text-white bg-[#194297] hover:opacity-90"
      >
        Inloggen
      </button>
    );
  }

  // Ingelogd: toon email + rol + snelle acties
  return (
    <div className="w-full">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-[#e8efff] grid place-items-center text-[#194297] font-semibold">
          {String(user.email || '?').slice(0,2).toUpperCase()}
        </div>
        <div className="min-w-0">
          <div className="text-sm font-medium text-[#194297] truncate">{user.email}</div>
          <div className="text-[11px] text-[#66676b]">Rol: {role ?? '—'}</div>
        </div>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2">
        {role === 'ADMIN' && (
          <button
            type="button"
            onClick={() => navigate('/app/settings')}
            className="px-3 py-1.5 rounded-md border text-[12px] hover:bg-gray-50"
            title="Leden & instellingen"
          >
            Instellingen
          </button>
        )}
        <button
          type="button"
          onClick={async () => {
            setBusy(true);
            await supabase.auth.signOut();
            setBusy(false);
            navigate('/login', { replace: true });
          }}
          className="px-3 py-1.5 rounded-md border text-[12px] hover:bg-gray-50"
          disabled={busy}
          title="Uitloggen"
        >
          {busy ? 'Uitloggen…' : 'Uitloggen'}
        </button>
      </div>
    </div>
  );
}
