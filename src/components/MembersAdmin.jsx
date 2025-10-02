// change: sync members admin with consolidated auth context
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../providers/AuthProvider';
import RoleBadge from './RoleBadge';
import AdminInviteForm from './AdminInviteForm';
import { supabase } from '../lib/supabaseClient';
import { resendInvite, revokeInvite } from '../lib/invitesApi';
import { deleteMember, updateMemberRole, MEMBER_ROLES, refetchAfterMembersMutation } from '../services/members';
import { warn, error as logError } from '../lib/log';

const ROLES = MEMBER_ROLES;
const ROLE_LABEL = { ADMIN: 'Admin', TEAM: 'Team', CUSTOMER: 'Customer' };
function classNames(...values) {
  return values.filter(Boolean).join(' ');
}

function toLogError(error) {
  if (!error) return null;
  if (typeof error === 'object') {
    return {
      message: error.message ?? String(error),
      code: error.code ?? error.status ?? null,
      details: error.details ?? undefined,
    };
  }
  return { message: String(error) };
}

function VisuallyHidden({ children }) {
  return (
    <span
      style={{
        position: 'absolute',
        left: -9999,
        top: 'auto',
        width: 1,
        height: 1,
        overflow: 'hidden',
      }}
    >
      {children}
    </span>
  );
}

function formatDateTime(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString('nl-NL', { dateStyle: 'short', timeStyle: 'short' });
}

function isInviteOpen(invite) {
  if (!invite || invite.used_at || invite.revoked_at) return false;
  if (!invite.expires_at) return true;
  const expiresAt = new Date(invite.expires_at).getTime();
  if (Number.isNaN(expiresAt)) return true;
  return expiresAt > Date.now();
}

function normalizeInviteError(error) {
  const raw = typeof error?.message === 'string' ? error.message : '';
  if (raw && /limit/i.test(raw)) {
    return 'Je hebt het limiet voor uitnodigingen bereikt. Probeer het later opnieuw.';
  }
  return raw || 'Er ging iets mis. Probeer later opnieuw.';
}

function inviteKey(invite) {
  if (!invite) return '';
  const token = invite.token ?? invite.id;
  if (token) return token;
  const email = invite.email ? String(invite.email).trim().toLowerCase() : '';
  if (email) return email;
  return invite.created_at ?? '';
}

function csvEscape(value = '') {
  const str = String(value ?? '');
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

function rowsToCsv(rows) {
  const header = ['email', 'user_id', 'role'];
  const lines = [header.join(',')];
  rows.forEach((row) => {
    lines.push([csvEscape(row.email), csvEscape(row.user_id), csvEscape(row.role)].join(','));
  });
  return '\uFEFF' + lines.join('\n');
}

function downloadCsv(filename, text) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

async function loadMembersForOrg(supabaseClient, orgId) {
  if (!orgId) return [];

  const { data, error } = await supabaseClient
    .from('memberships_view')
    .select('user_id,email,role')
    .eq('org_id', orgId)
    .order('email', { ascending: true });

  if (error) {
    logError('members_admin.fetch_members_failed', {
      orgId,
      error: toLogError(error),
    });
    throw error;
  }

  return (data ?? []).map((row) => ({
    user_id: row.user_id,
    role: String(row.role || '').toUpperCase(),
    email: row.email || '—',
  }));
}

function normalizeMembers(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => ({
    ...row,
    role: String(row.role || '').toUpperCase(),
    email: row.email ? String(row.email).trim() : '—',
  }));
}

function Toast({ msg, onClose }) {
  useEffect(() => {
    if (!msg) return undefined;
    const timer = setTimeout(onClose, 2200);
    return () => clearTimeout(timer);
  }, [msg, onClose]);
  if (!msg) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 right-4 z-50 rounded-md border border-[#dbe3ff] bg-[#f7f9ff] px-3 py-2 text-sm text-[#1c2b49] shadow-md"
    >
      {msg}
    </div>
  );
}

function ConfirmModal({
  open,
  title = 'Weet je het zeker?',
  body,
  confirmText = 'Verwijderen',
  onConfirm,
  onCancel,
}) {
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      className="fixed inset-0 z-40 grid place-items-center bg-black/30 p-4"
    >
      <div className="w-full max-w-sm rounded-xl border border-[#e7eaf6] bg-white shadow-xl">
        <div className="border-b border-[#f2f4f8] px-4 py-3">
          <h2 id="confirm-title" className="text-[15px] font-semibold text-[#1c2b49]">
            {title}
          </h2>
        </div>
        <div className="px-4 py-4 text-sm text-[#5b5e66]">{body}</div>
        <div className="flex justify-end gap-2 px-4 pb-4">
          <button
            type="button"
            onClick={onCancel}
            className="h-9 rounded-md border border-[#e5e7eb] px-3 text-sm hover:bg-gray-50"
          >
            Annuleren
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="h-9 rounded-md border border-rose-200 bg-rose-50 px-3 text-sm text-rose-700 hover:bg-rose-100"
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function MembersAdmin() {
  const { user, activeOrgId, roleForActiveOrg, refreshMemberships, membershipsLoading } = useAuth();

  const role = roleForActiveOrg ? String(roleForActiveOrg).toUpperCase() : '';
  const isAdmin = role === 'ADMIN';

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState('');
  const [busyUser, setBusyUser] = useState(null);
  const [q, setQ] = useState('');
  const [toast, setToast] = useState('');
  const [confirm, setConfirm] = useState({ open: false, userId: null, email: '' });
  const [invites, setInvites] = useState([]);
  const [invitesLoading, setInvitesLoading] = useState(false);
  const [invitesError, setInvitesError] = useState('');
  const [busyInvite, setBusyInvite] = useState(null);
  const [sendInviteEmail, setSendInviteEmail] = useState(true);

  const filtered = useMemo(() => {
    const search = q.toLowerCase();
    if (!search) return rows;
    return rows.filter((row) => row.email?.toLowerCase().includes(search));
  }, [rows, q]);

  const hasSearch = q.trim().length > 0;
  const openInvites = useMemo(() => invites.filter(isInviteOpen), [invites]);
  const displayRole = role || 'ONBEKEND';
  const GRID_COLS = 'grid-cols-[1fr_200px_96px]';

  const reloadMembers = useCallback(async () => {
    if (!activeOrgId || !isAdmin) {
      return;
    }
    try {
      const data = await loadMembersForOrg(supabase, activeOrgId);
      setRows(normalizeMembers(data));
      setErrMsg('');
    } catch (error) {
      warn('members_admin.reload_members_failed', { orgId: activeOrgId, error: toLogError(error) });
      setErrMsg(error?.message || 'Kon ledenlijst niet laden');
      setRows([]);
    }
  }, [activeOrgId, isAdmin]);

  const refreshAfterMutation = useCallback(async () => {
    if (!activeOrgId || !isAdmin) return;
    setLoading(true);
    try {
      await refetchAfterMembersMutation(refreshMemberships, reloadMembers);
    } finally {
      setLoading(false);
    }
  }, [activeOrgId, isAdmin, refreshMemberships, reloadMembers]);

  useEffect(() => {
    if (!activeOrgId) {
      setRows([]);
      setErrMsg('');
      setLoading(false);
      return;
    }
    if (!isAdmin) {
      setRows([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setErrMsg('');
    loadMembersForOrg(supabase, activeOrgId)
      .then((data) => {
        if (cancelled) return;
        setRows(normalizeMembers(data));
      })
      .catch((error) => {
        if (cancelled) return;
        warn('members_admin.load_members_effect_failed', { orgId: activeOrgId, error: toLogError(error) });
        setErrMsg(error?.message || 'Kon ledenlijst niet laden');
        setRows([]);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activeOrgId, isAdmin]);

  const fetchInvites = useCallback(async () => {
    if (!activeOrgId || !isAdmin) {
      setInvites([]);
      setInvitesError('');
      return;
    }
    setInvitesLoading(true);
    setInvitesError('');
    try {
      const { data, error } = await supabase
        .from('invites')
        .select('id,org_id,email,role,token,created_at,expires_at,used_at,revoked_at')
        .eq('org_id', activeOrgId)
        .order('created_at', { ascending: false });
      if (error) {
        throw error;
      }
      setInvites(Array.isArray(data) ? data : []);
    } catch (error) {
      warn('members_admin.list_invites_failed', { orgId: activeOrgId, error: toLogError(error) });
      setInvitesError(error?.message || 'Onbekende fout');
      setInvites([]);
    } finally {
      setInvitesLoading(false);
    }
  }, [activeOrgId, isAdmin]);

  useEffect(() => {
    fetchInvites();
  }, [fetchInvites]);

  const closeConfirm = useCallback(() => {
    setConfirm({ open: false, userId: null, email: '' });
  }, []);

  const askRemove = (userId, email) => {
    setConfirm({ open: true, userId, email });
  };

  async function doRemove() {
    const { userId, email } = confirm;
    closeConfirm();
    if (!userId || !activeOrgId || !isAdmin) {
      return;
    }
    setBusyUser(userId);
    try {
      await deleteMember(activeOrgId, userId);
      setToast(`Lid verwijderd: ${email}`);
      await refreshAfterMutation();
    } catch (error) {
      logError('members_admin.delete_member_failed', { orgId: activeOrgId, target: userId, error: toLogError(error) });
      setToast(`Actie mislukt: ${error?.message || 'geen recht'}`);
      await refreshAfterMutation();
    } finally {
      setBusyUser(null);
    }
  }

  async function changeRole(userId, nextRole) {
    if (!activeOrgId || !isAdmin) {
      return;
    }
    setBusyUser(userId);
    try {
      await updateMemberRole(activeOrgId, userId, nextRole);
      setToast('Rol bijgewerkt');
      await refreshAfterMutation();
    } catch (error) {
      logError('members_admin.update_member_role_failed', {
        orgId: activeOrgId,
        target: userId,
        nextRole,
        error: toLogError(error),
      });
      setToast(`Actie mislukt: ${error?.message || 'geen recht'}`);
      await refreshAfterMutation();
    } finally {
      setBusyUser(null);
    }
  }

  async function handleResend(invite) {
    const email = invite?.email ? String(invite.email).trim().toLowerCase() : '';
    if (!email) {
      setInvitesError('Geen e-mailadres beschikbaar voor deze invite.');
      return;
    }
    if (!activeOrgId || !isAdmin) {
      setInvitesError('Geen organisatie beschikbaar.');
      return;
    }
    const busyKey = inviteKey(invite) || email;
    setInvitesError('');
    setBusyInvite({ token: busyKey, action: 'resend' });
    try {
      const shouldSendEmail = Boolean(sendInviteEmail);
      const result = await resendInvite(activeOrgId, email, { sendEmail: shouldSendEmail });
      let toastMessage = '';
      let invitesMessage = '';
      if (shouldSendEmail && result?.emailed === false) {
        toastMessage =
          'Invite aangemaakt, maar e-mail verzenden mislukt. Kopieer de link handmatig.';
        invitesMessage = toastMessage;
      } else if (result?.emailed) {
        toastMessage = 'Nieuwe invite per e-mail verzonden. Link 7 dagen geldig.';
      } else {
        toastMessage = 'Nieuwe invite aangemaakt. Kopieer de link handmatig.';
      }
      setInvitesError(invitesMessage);
      setToast(toastMessage);
      await fetchInvites();
    } catch (error) {
      warn('members_admin.resend_invite_failed', { orgId: activeOrgId, email, error: toLogError(error) });
      setInvitesError(normalizeInviteError(error));
    } finally {
      setBusyInvite(null);
    }
  }

  async function handleRevoke(invite) {
    const token = invite?.token;
    if (!token) {
      setInvitesError('Geen invite token gevonden.');
      return;
    }
    if (!isAdmin) {
      setInvitesError('Je hebt geen rechten voor deze actie.');
      return;
    }
    const busyKey = inviteKey(invite) || token;
    setInvitesError('');
    setBusyInvite({ token: busyKey, action: 'revoke' });
    try {
      await revokeInvite(token);
      setToast('Invite ongeldig gemaakt.');
      await fetchInvites();
    } catch (error) {
      warn('members_admin.revoke_invite_failed', { token, error: toLogError(error) });
      setInvitesError(normalizeInviteError(error));
    } finally {
      setBusyInvite(null);
    }
  }

  const handleInviteResult = useCallback(
    (result) => {
      if (!result) return;
      const emailInfo = result.emailInfo;
      if (emailInfo?.attempted) {
        if (emailInfo.sent && result.email) {
          setToast(`Uitnodiging per e-mail verstuurd naar ${result.email}.`);
        } else {
          setToast('E-mail niet verstuurd, link gekopieerd.');
        }
      } else if (result.sendEmail === false) {
        setToast('E-mail overslagen, link gekopieerd.');
      } else if (result.acceptUrl) {
        setToast('Invite link aangemaakt.');
      }
      fetchInvites();
    },
    [fetchInvites],
  );

  const handleManualRefresh = () => {
    if (!activeOrgId || !isAdmin) return;
    refreshAfterMutation();
  };

  const exportCsv = () => {
    const csv = rowsToCsv(filtered);
    const date = new Date().toISOString().slice(0, 10);
    downloadCsv(`leden-${date}.csv`, csv);
  };

  const meId = user?.id;
  const searchDisabled = !activeOrgId || !isAdmin;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h3 className="text-lg font-semibold text-[#1c2b49]">Leden beheren</h3>
          {isAdmin && activeOrgId && rows.length > 0 && (
            <span className="text-xs text-[#6b7280]">{rows.length} leden</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <label className="relative">
            <VisuallyHidden>Zoeken op e-mail</VisuallyHidden>
            <input
              type="search"
              placeholder="Zoek op e-mail…"
              value={q}
              onChange={(event) => setQ(event.target.value)}
              disabled={searchDisabled}
              className="h-8 w-[220px] rounded-md border border-[#e5e7eb] bg-white px-2 text-sm outline-none focus:ring-2 focus:ring-[#d6e0ff] disabled:cursor-not-allowed disabled:bg-[#f9fafb]"
            />
          </label>
          <button
            type="button"
            onClick={handleManualRefresh}
            disabled={searchDisabled || loading}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[#e5e7eb] hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
            title="Vernieuwen"
            aria-label="Vernieuwen"
          >
            <svg
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <path d="M3 12a9 9 0 0 1 15.54-5.66" />
              <path d="M21 12a9 9 0 0 1-15.54 5.66" />
              <path d="M17 6v4h-4" />
              <path d="M7 18v-4h4" />
            </svg>
          </button>
          <button
            type="button"
            onClick={exportCsv}
            disabled={!isAdmin || !activeOrgId || !rows.length}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[#e5e7eb] hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
            title="Export CSV"
            aria-label="Export CSV"
          >
            <svg
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <path d="M12 3v12" />
              <path d="M8 11l4 4 4-4" />
              <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
            </svg>
          </button>
        </div>
      </div>

      {errMsg && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          Fout: {errMsg}
        </div>
      )}

      {membershipsLoading && (
        <div className="rounded-lg border border-[#eef1f6] bg-white p-4 text-sm text-[#5b5e66]">
          Rol bepalen…
        </div>
      )}

      {!activeOrgId && (
        <div className="rounded-lg border border-[#eef1f6] bg-[#fcfcfe] p-4 text-sm text-[#5b5e66]">
          Kies eerst een workspace.
        </div>
      )}

      {!membershipsLoading && activeOrgId && !isAdmin && (
        <div className="rounded-lg border border-[#eef1f6] bg-white p-4 text-sm text-[#5b5e66]">
          Alleen ADMIN kan leden beheren (jouw rol: {displayRole}).
        </div>
      )}

      {activeOrgId && isAdmin && (
        <>
          <div className="overflow-hidden rounded-xl border border-[#eef1f6] bg-white shadow-sm">
            <div
              className={classNames(
                'grid items-center gap-2 border-b border-[#f2f4f8] px-4 py-2 text-xs font-medium text-[#81848b]',
                GRID_COLS,
              )}
            >
              <div>Lid</div>
              <div>Rol</div>
              <div className="text-right">Acties</div>
            </div>

            {loading ? (
              <div className="px-4 py-6 text-sm text-[#6b7280]">Leden laden…</div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-6 py-12 text-center text-[#6b7280]">
                <svg width="64" height="64" viewBox="0 0 24 24" className="text-[#d1d5db]">
                  <path fill="currentColor" d="M12 12a5 5 0 1 0-5-5a5 5 0 0 0 5 5m-7 8a7 7 0 0 1 14 0z" />
                </svg>
                <div className="text-sm">
                  {hasSearch ? 'Geen resultaten. Wis je zoekfilter.' : 'Geen leden gevonden.'}
                </div>
              </div>
            ) : (
              <ul className="divide-y divide-[#f2f4f8]">
                {filtered.map((row) => {
                  const me = meId === row.user_id;
                  const isBusy = busyUser === row.user_id;
                  const hasEmail = row.email && row.email !== '—';
                  return (
                    <li
                      key={row.user_id}
                      className={classNames('grid items-center gap-2 px-4 py-3', GRID_COLS)}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          {hasEmail ? (
                            <a
                              href={`mailto:${row.email}`}
                              className="truncate text-[16px] font-medium text-[#1c2b49] hover:underline"
                              title={row.email}
                            >
                              {row.email}
                            </a>
                          ) : (
                            <span className="truncate text-[16px] font-medium text-[#1c2b49]">
                              {row.email}
                            </span>
                          )}
                          <RoleBadge role={row.role} />
                        </div>
                      </div>
                      <div className="w-[200px] justify-self-start">
                        <label className="sr-only" htmlFor={`role-${row.user_id}`}>
                          Wijzig rol
                        </label>
                        <select
                          id={`role-${row.user_id}`}
                          aria-label={`Rol voor ${row.email}`}
                          value={row.role}
                          onChange={(event) => changeRole(row.user_id, event.target.value)}
                          disabled={isBusy}
                          className="h-9 w-full rounded-md border border-[#e5e7eb] bg-white px-3 text-[16px] outline-none focus:ring-2 focus:ring-[#d6e0ff]"
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {ROLE_LABEL[r]}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex w-[96px] justify-end">
                        {!me ? (
                          <button
                            type="button"
                            onClick={() => askRemove(row.user_id, row.email)}
                            disabled={isBusy}
                            aria-label={`Verwijder ${row.email}`}
                            className="inline-flex h-9 items-center rounded-md border border-[#e5e7eb] px-2 text-sm text-[#3b4252] hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                            title="Verwijderen"
                          >
                            {isBusy ? (
                              <svg className="h-[18px] w-[18px] animate-spin" viewBox="0 0 24 24">
                                <circle cx="12" cy="12" r="10" stroke="#9aa0a6" strokeWidth="2" fill="none" />
                                <path
                                  d="M22 12a10 10 0 0 1-10 10"
                                  stroke="#3b82f6"
                                  strokeWidth="2"
                                  fill="none"
                                />
                              </svg>
                            ) : (
                              <svg
                                viewBox="0 0 24 24"
                                className="h-[18px] w-[18px]"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.7"
                              >
                                <path d="M3 6h18" />
                                <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                                <path d="M10 11v6" />
                                <path d="M14 11v6" />
                                <path d="M9 6V4a2 2 0 012-2h2a2 2 0 012 2v2" />
                              </svg>
                            )}
                          </button>
                        ) : (
                          <span className="text-[11px] text-[#9aa0a6]">—</span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="overflow-hidden rounded-xl border border-[#eef1f6] bg-white shadow-sm">
            <div className="border-b border-[#f2f4f8] px-4 py-2 text-xs font-medium text-[#81848b]">
              Openstaande uitnodigingen
            </div>
            <div className="px-4 pt-3 text-[12px] text-[#6b7280]">Link 7 dagen geldig.</div>
            {invitesError && (
              <div className="px-4 pt-2 text-sm text-rose-700">Fout: {invitesError}</div>
            )}
            {invitesLoading ? (
              <div className="px-4 py-6 text-sm text-[#6b7280]">Uitnodigingen laden…</div>
            ) : openInvites.length === 0 ? (
              <div className="px-4 py-6 text-sm text-[#6b7280]">
                Geen openstaande uitnodigingen.
              </div>
            ) : (
              <ul className="divide-y divide-[#f2f4f8] pt-2">
                {openInvites.map((invite, index) => {
                  const baseKey = inviteKey(invite);
                  const emailKey = invite?.email ? String(invite.email).trim().toLowerCase() : '';
                  const itemKey = baseKey || emailKey || invite?.created_at || `invite-${index}`;
                  const isBusy = busyInvite?.token === itemKey;
                  const busyAction = isBusy ? busyInvite?.action : null;
                  const canResend = Boolean(invite?.email && activeOrgId);
                  const canRevoke = Boolean(invite?.token);
                  const expiresLabel = formatDateTime(invite?.expires_at);
                  return (
                    <li key={itemKey} className="flex flex-wrap items-center gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span
                            className="truncate text-[15px] font-medium text-[#1c2b49]"
                            title={invite?.email ?? '—'}
                          >
                            {invite?.email ?? '—'}
                          </span>
                          {invite?.role && <RoleBadge role={invite.role} />}
                        </div>
                        <div className="text-[12px] text-[#6b7280]">
                          {expiresLabel ? `Verloopt op ${expiresLabel}` : 'Vervaldatum onbekend'}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => handleResend(invite)}
                          disabled={!canResend || isBusy}
                          aria-busy={isBusy && busyAction === 'resend'}
                          className="inline-flex h-9 items-center rounded-md border border-[#e5e7eb] px-3 text-sm text-[#1d4ed8] hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                          title={canResend ? undefined : 'Geen e-mailadres beschikbaar'}
                        >
                          {isBusy && busyAction === 'resend' ? (
                            <svg className="h-[18px] w-[18px] animate-spin" viewBox="0 0 24 24">
                              <circle cx="12" cy="12" r="10" stroke="#9aa0a6" strokeWidth="2" fill="none" />
                              <path
                                d="M22 12a10 10 0 0 1-10 10"
                                stroke="#3b82f6"
                                strokeWidth="2"
                                fill="none"
                              />
                            </svg>
                          ) : (
                            'Opnieuw sturen'
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRevoke(invite)}
                          disabled={!canRevoke || isBusy}
                          aria-busy={isBusy && busyAction === 'revoke'}
                          className="inline-flex h-9 items-center rounded-md border border-[#e5e7eb] px-3 text-sm text-[#b91c1c] hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isBusy && busyAction === 'revoke' ? (
                            <svg className="h-[18px] w-[18px] animate-spin" viewBox="0 0 24 24">
                              <circle cx="12" cy="12" r="10" stroke="#fca5a5" strokeWidth="2" fill="none" />
                              <path
                                d="M22 12a10 10 0 0 1-10 10"
                                stroke="#b91c1c"
                                strokeWidth="2"
                                fill="none"
                              />
                            </svg>
                          ) : (
                            'Ongeldig maken'
                          )}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <AdminInviteForm
            orgId={activeOrgId}
            onInviteResult={handleInviteResult}
            sendEmail={sendInviteEmail}
            onSendEmailChange={setSendInviteEmail}
          />
        </>
      )}

      <Toast msg={toast} onClose={() => setToast('')} />
      <ConfirmModal
        open={confirm.open}
        body={
          <span>
            Weet je zeker dat je <strong>{confirm.email}</strong> wilt verwijderen?
          </span>
        }
        onConfirm={doRemove}
        onCancel={closeConfirm}
      />
    </section>
  );
}
