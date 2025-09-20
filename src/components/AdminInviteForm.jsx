// src/components/AdminInviteForm.jsx
import { useState } from 'react';
import { authHeader } from '../lib/authHeader';
import { netlifyJson } from '../lib/netlifyFetch';

const ROLES = ['ADMIN', 'TEAM', 'CUSTOMER'];
const roleLabel = { ADMIN: 'Admin', TEAM: 'Team', CUSTOMER: 'Customer' };

function normalizeRole(value = '') {
  return String(value || '').trim().toUpperCase();
}

async function copyToClipboard(value) {
  try {
    await navigator.clipboard?.writeText(value);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Uitgelijnd met MembersAdmin (grid-cols-[1fr_200px_96px]).
 * Genereert invite link en kopieert deze direct naar het klembord.
 */
export default function AdminInviteForm({ orgId, gridCols = 'grid-cols-[1fr_200px_96px]', onInviteResult }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('CUSTOMER');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');       // tekstfeedback
  const [lastLink, setLastLink] = useState(''); // laatste gegenereerde link (fallback kopie)

  async function onGenerate() {
    setErr('');
    setOk('');
    setLastLink('');

    const cleanedEmail = email.trim();

    if (!orgId) { setErr('Geen organisatie gekozen.'); return; }
    if (!cleanedEmail) { setErr('Vul een e-mailadres in.'); return; }

    setBusy(true);
    try {
      const headers = await authHeader();
      if (!headers.Authorization) {
        throw new Error('Geen toegangstoken beschikbaar.');
      }

      const nextRole = normalizeRole(role);
      if (!ROLES.includes(nextRole)) {
        throw new Error('Onbekende rol.');
      }

      const body = await netlifyJson('createInvite', {
        method: 'POST',
        headers,
        body: JSON.stringify({ p_org: orgId, p_email: cleanedEmail, p_role: nextRole }),
      });

      const acceptUrl = typeof body?.acceptUrl === 'string' ? body.acceptUrl : '';
      if (acceptUrl) {
        setLastLink(acceptUrl);
        const copied = await copyToClipboard(acceptUrl);
        setOk(copied ? 'Invite link gekopieerd.' : 'Invite link gegenereerd. (Kopieer handmatig)');
      } else {
        setLastLink('');
        setOk('Invite verstuurd.');
      }

      if (body?.sent && !acceptUrl) {
        setOk(`Uitnodiging verstuurd naar ${cleanedEmail}`);
      } else if (body?.sent) {
        setOk(`Uitnodiging verstuurd naar ${cleanedEmail} (link ook beschikbaar).`);
      }

      if (typeof onInviteResult === 'function') {
        onInviteResult({
          email: cleanedEmail,
          role: nextRole,
          acceptUrl: acceptUrl || null,
          sent: body?.sent === true,
        });
      }

      setEmail('');
      setRole('CUSTOMER');
    } catch (e) {
      console.error('[AdminInviteForm] create_invite error:', e);
      setErr(e.message || 'Kon invite niet genereren.');
    } finally {
      setBusy(false);
    }
  }

  function copyAgain() {
    if (!lastLink) return;
    navigator.clipboard?.writeText(lastLink).then(
      () => setOk('Link gekopieerd.'),
      () => setErr('Kopiëren mislukt.')
    );
  }

  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-[#eef1f6] bg-white">
      <div className="border-b border-[#f2f4f8] px-4 py-2 text-xs font-medium text-[#81848b]">
        Lid uitnodigen
      </div>

      {/* zelfde grid als ledenlijst */}
      <div className={`grid ${gridCols} items-center gap-2 px-4 py-3`}>
        {/* E-mail */}
        <div className="min-w-0">
          <label htmlFor="invite-email" className="sr-only">E-mail</label>
          <input
            id="invite-email"
            type="email"
            placeholder="naam@bedrijf.nl"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-10 w-full rounded-md border border-[#e5e7eb] bg-white px-3 text-[15px] outline-none focus:ring-2 focus:ring-[#d6e0ff]"
            autoComplete="off"
          />
        </div>

        {/* Rol */}
        <div className="w-[200px] justify-self-start">
          <label htmlFor="invite-role" className="sr-only">Rol</label>
          <select
            id="invite-role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="h-10 w-full rounded-md border border-[#e5e7eb] bg-white px-3 text-[16px] outline-none focus:ring-2 focus:ring-[#d6e0ff]"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>{roleLabel[r]}</option>
            ))}
          </select>
        </div>

        {/* Actieknop */}
        <div className="flex justify-end w-[96px]">
          <button
            type="button"
            onClick={onGenerate}
            disabled={busy}
            className="inline-flex h-10 w-[96px] items-center justify-center rounded-md border border-[#e5e7eb] text-sm hover:bg-gray-50"
            title="Genereer invite link (en kopieer)"
            aria-label="Genereer invite link"
          >
            {busy ? (
              <svg className="h-[18px] w-[18px] animate-spin" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" stroke="#9aa0a6" strokeWidth="2" fill="none" />
                <path d="M22 12a10 10 0 0 1-10 10" stroke="#3b82f6" strokeWidth="2" fill="none" />
              </svg>
            ) : (
              'Link'
            )}
          </button>
        </div>
      </div>

      {(err || ok || lastLink) && (
        <div className="flex items-center justify-between gap-3 px-4 pb-3">
          <div className="text-sm">
            {err && <span className="text-rose-700">{err}</span>}
            {!err && ok && <span className="text-emerald-700">{ok}</span>}
          </div>
          {lastLink && (
            <button
              type="button"
              onClick={copyAgain}
              className="text-sm text-[#1d4ed8] hover:underline"
              title="Kopieer link nogmaals"
            >
              Kopieer opnieuw
            </button>
          )}
        </div>
      )}
    </div>
  );
}
