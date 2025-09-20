import { useState } from 'react';
import { authHeader } from '../lib/authHeader';

const ROLES = ['ADMIN', 'TEAM', 'CUSTOMER'];
const ROLE_LABEL = {
  ADMIN: 'Admin',
  TEAM: 'Team',
  CUSTOMER: 'Customer',
};
const DEFAULT_ORG_ID = '54ec8e89-d265-474d-98fc-d2ba579ac83f';

function normalizeRole(value = '') {
  const next = String(value || '').trim().toUpperCase();
  return ROLES.includes(next) ? next : 'CUSTOMER';
}

export default function AdminInviteForm({
  orgId,
  gridCols = 'grid-cols-[1fr_200px_96px]',
  onInviteResult,
}) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('CUSTOMER');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [copyLink, setCopyLink] = useState('');
  const [copied, setCopied] = useState(false);

  async function handleGenerate() {
    setError('');
    setMessage('');
    setCopyLink('');
    setCopied(false);

    const cleanedEmail = email.trim();
    const targetRole = normalizeRole(role);
    const targetOrg = orgId || DEFAULT_ORG_ID;

    if (!targetOrg) {
      setError('Geen organisatie beschikbaar.');
      return;
    }
    if (!cleanedEmail) {
      setError('Vul een e-mailadres in.');
      return;
    }

    setBusy(true);
    try {
      const headers = await authHeader();
      const auth = headers.Authorization;
      if (!auth) {
        throw new Error('Geen toegangstoken beschikbaar.');
      }

      const res = await fetch('/.netlify/functions/createInvite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: auth,
        },
        body: JSON.stringify({
          p_org: targetOrg,
          p_email: cleanedEmail,
          p_role: targetRole,
        }),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.error || 'Invite mislukt');
      }

      const acceptUrl = typeof body?.acceptUrl === 'string' ? body.acceptUrl : '';
      setCopyLink(acceptUrl);
      setMessage(
        acceptUrl
          ? 'Invite link aangemaakt. Kopieer de link hieronder om te delen.'
          : 'Invite aangemaakt.'
      );
      setEmail('');
      setRole('CUSTOMER');

      if (typeof onInviteResult === 'function') {
        onInviteResult({
          email: cleanedEmail,
          role: targetRole,
          acceptUrl: acceptUrl || null,
          invite: body?.invite,
        });
      }
    } catch (e) {
      console.error('[AdminInviteForm] createInvite error', e);
      setError(e?.message || 'Invite mislukt');
    } finally {
      setBusy(false);
    }
  }

  async function copyLinkToClipboard() {
    if (!copyLink) return;
    try {
      await navigator.clipboard?.writeText(copyLink);
      setCopied(true);
      setMessage('Invite link gekopieerd.');
      setError('');
    } catch (e) {
      console.error('[AdminInviteForm] copy error', e);
      setError('Kon link niet kopiëren.');
    }
  }

  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-[#eef1f6] bg-white">
      <div className="border-b border-[#f2f4f8] px-4 py-2 text-xs font-medium text-[#81848b]">
        Lid uitnodigen
      </div>

      <div className={`grid ${gridCols} items-center gap-2 px-4 py-3`}>
        <div className="min-w-0">
          <label htmlFor="invite-email" className="sr-only">
            E-mail
          </label>
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

        <div className="w-[200px] justify-self-start">
          <label htmlFor="invite-role" className="sr-only">
            Rol
          </label>
          <select
            id="invite-role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="h-10 w-full rounded-md border border-[#e5e7eb] bg-white px-3 text-[16px] outline-none focus:ring-2 focus:ring-[#d6e0ff]"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex w-[96px] justify-end">
          <button
            type="button"
            onClick={handleGenerate}
            disabled={busy}
            className="inline-flex h-10 w-[96px] items-center justify-center rounded-md border border-[#e5e7eb] text-sm hover:bg-gray-50"
          >
            {busy ? (
              <svg className="h-[18px] w-[18px] animate-spin" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" stroke="#9aa0a6" strokeWidth="2" fill="none" />
                <path d="M22 12a10 10 0 0 1-10 10" stroke="#3b82f6" strokeWidth="2" fill="none" />
              </svg>
            ) : (
              'Genereer'
            )}
          </button>
        </div>
      </div>

      {(error || message || copyLink) && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 pb-3">
          <div className="text-sm">
            {error && <span className="text-rose-700">{error}</span>}
            {!error && message && <span className="text-emerald-700">{message}</span>}
          </div>
          {copyLink && (
            <button
              type="button"
              onClick={copyLinkToClipboard}
              className="text-sm text-[#1d4ed8] hover:underline"
            >
              {copied ? 'Gekopieerd' : 'Copy'}
            </button>
          )}
        </div>
      )}

      {copyLink && (
        <div className="border-t border-[#f2f4f8] bg-[#f9fafb] px-4 py-3 text-sm">
          <div className="truncate" title={copyLink}>
            {copyLink}
          </div>
        </div>
      )}
    </div>
  );
}
