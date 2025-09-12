// src/components/AuthProfileButton.jsx
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../providers/AuthProvider';
import { useMembership } from '../hooks/useMembership';

/**
 * Props:
 * - expanded?: boolean
 *   - true  => force "volledig" (desktop-achtig)
 *   - false => force "compact"  (collapsed-achtig)
 *   - undefined => auto: mobiel = compact, desktop = volledig
 */
export default function AuthProfileButton({ expanded }) {
  const { session, user } = useAuth();
  const { role } = useMembership();
  const [busy, setBusy] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Detecteer mobiel voor auto-modus
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const apply = () => setIsMobile(mq.matches);
    apply();
    mq.addEventListener?.('change', apply);
    return () => mq.removeEventListener?.('change', apply);
  }, []);

  // Bepaal modus
  // - als prop is meegegeven: respecteer die
  // - anders: mobiel => compact, desktop => volledig
  const mode = expanded === undefined
    ? (isMobile ? 'compact' : 'full')
    : (expanded ? 'full' : 'compact');

  // ===== UITGELOGD =====
  if (!session) {
    // Subtiele, smalle knop (geen full-width), werkt ook op mobiel
    return (
      <a
        href="/login?intent=1"
        className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-full border border-[#cfd7ee] text-xs font-medium text-[#194297] hover:bg-[#eef3ff] transition-colors"
        title="Inloggen"
      >
        {/* klein “key” icoon met pure CSS, zodat we geen icon-lib hoeven */}
        <span aria-hidden className="inline-block w-1.5 h-1.5 rounded-full bg-[#194297]" />
        Inloggen
      </a>
    );
  }

  // ===== INGELOGD =====
  const initials = String(user?.email || '?').slice(0, 2).toUpperCase();

  if (mode === 'compact') {
    // Compact: alleen avatar (mobiel of desktop-collapsed)
    return (
      <div className="w-full flex items-center justify-center">
        <div className="w-9 h-9 rounded-full bg-[#e8efff] grid place-items-center text-[#194297] font-semibold">
          {initials}
        </div>
      </div>
    );
  }

  // Volledig (desktop-uitgeklapt): avatar + naam + rol + (kleine) uitlogknop
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

      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={async () => {
            try {
              setBusy(true);
              await supabase.auth.signOut();
            } finally {
              setBusy(false);
              // Altijd terug naar je Chatpilot hoofdpagina
              window.location.replace('/app');
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
