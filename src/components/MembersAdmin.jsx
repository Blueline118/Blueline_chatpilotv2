// src/components/MembersAdmin.jsx
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../providers/AuthProvider';
import { useMembership } from '../hooks/useMembership';
import RoleBadge from './RoleBadge';
import AdminInviteForm from './AdminInviteForm';

const ROLES = ['ADMIN', 'TEAM', 'CUSTOMER'];
const roleLabel = { ADMIN: 'Admin', TEAM: 'Team', CUSTOMER: 'Customer' };

// ------ helpers ------
function classNames(...xs) {
  return xs.filter(Boolean).join(' ');
}
function VisuallyHidden({ children }) {
  return (
    <span style={{ position: 'absolute', left: -9999, top: 'auto', width: 1, height: 1, overflow: 'hidden' }}>
      {children}
    </span>
  );
}

// CSV helpers
function csvEscape(v = '') {
  const s = String(v ?? '');
  const needsQuotes = /[",\n]/.test(s);
  return needsQuotes ? `"${s.replace(/"/g, '""')}"` : s;
}
function rowsToCsv(rows) {
  const header = ['email', 'user_id', 'role'];
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push([csvEscape(r.email), csvEscape(r.user_id), csvEscape(r.role)].join(','));
  }
  // BOM voor Excel: \uFEFF
  return '\uFEFF' + lines.join('\n');
}
function downloadCsv(filename, text) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ------ Toast ------
function Toast({ msg, onClose }) {
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(onClose, 2200);
    return () => clearTimeout(t);
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

// ------ Confirm Modal ------
function ConfirmModal({ open, title = 'Weet je het zeker?', body, confirmText = 'Verwijderen', onConfirm, onCancel }) {
  if (!open) return null;
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="confirm-title" className="fixed inset-0 z-40 grid place-items-center bg-black/30 p-4">
      <div className="w-full max-w-sm rounded-xl border border-[#e7eaf6] bg-white shadow-xl">
        <div className="border-b border-[#f2f4f8] px-4 py-3">
          <h2 id="confirm-title" className="text-[15px] font-semibold text-[#1c2b49]">{title}</h2>
        </div>
        <div className="px-4 py-4 text-sm text-[#5b5e66]">{body}</div>
        <div className="flex justify-end gap-2 px-4 pb-4">
          <button type="button" onClick={onCancel} className="h-9 rounded-md border border-[#e5e7eb] px-3 text-sm hover:bg-gray-50">Annuleren</button>
          <button type="button" onClick={onConfirm} className="h-9 rounded-md border border-rose-200 bg-rose-50 px-3 text-sm text-rose-700 hover:bg-rose-100">{confirmText}</button>
        </div>
      </div>
    </div>
  );
}

export default function MembersAdmin() {
  const { activeOrgId, user } = useAuth(); // voor self-check
  const { role, loading: roleLoading } = useMembership();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errMsg, setErrMsg] = useState('');
  const [busyUser, setBusyUser] = useState(null); // user_id waarvoor actie bezig is
  const [q, setQ] = useState('');
  const [toast, setToast] = useState('');
  const [confirm, setConfirm] = useState({ open: false, userId: null, email: '' });

  // ------- data ophalen -------
  async function fetchMembers() {
    if (!activeOrgId) return;
    setLoading(true);
    setErrMsg('');
    const { data, error } = await supabase.rpc('get_org_members', { org: activeOrgId });
    if (error) {
      console.error('[MembersAdmin] get_org_members error:', error);
      setErrMsg(error.message || 'Onbekende fout bij ophalen leden');
      setRows([]);
    } else {
      setRows(data || []);
    }
    setLoading(false);
  }
  useEffect(() => { fetchMembers(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [activeOrgId]);

  // ------- rol wijzigen -------
  async function changeRole(userId, newRole) {
    setBusyUser(userId);
    const { data, error } = await supabase.rpc('update_member_role', { org: activeOrgId, target: userId, new_role: newRole });
    setBusyUser(null);
    if (error || data !== true) {
      alert('Wijzigen mislukt: ' + (error?.message || 'geen recht'));
      return;
    }
    setRows(r => r.map(x => x.user_id === userId ? { ...x, role: newRole } : x));
    setToast('Rol bijgewerkt');
  }

  // ------- verwijderen (met modal) -------
  function askRemove(userId, email) { setConfirm({ open: true, userId, email }); }
  async function doRemove() {
    const { userId, email } = confirm;
    setConfirm({ open: false, userId: null, email: '' });
    if (!userId) return;

    setBusyUser(userId);
    const { data, error } = await supabase.rpc('delete_member', { p_org: activeOrgId, p_target: userId });
    setBusyUser(null);
    if (error || data !== true) {
      alert('Verwijderen mislukt: ' + (error?.message || 'geen recht'));
      return;
    }
    setRows(r => r.filter(x => x.user_id !== userId));
    setToast(`Lid verwijderd: ${email}`);
  }

  // ------- filter + export -------
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter(r => (r.email || '').toLowerCase().includes(s));
  }, [rows, q]);

  function exportCsv() {
    const csv = rowsToCsv(filtered);
    const date = new Date().toISOString().slice(0, 10);
    downloadCsv(`leden-${date}.csv`, csv);
  }

  return (
    <section className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h3 className="text-lg font-semibold text-[#1c2b49]">Leden beheren</h3>
          {activeOrgId && rows?.length > 0 && <span className="text-xs text-[#6b7280]">{rows.length} leden</span>}
        </div>
        <div className="flex items-center gap-2">
          <label className="relative">
            <VisuallyHidden>Zoeken op e-mail</VisuallyHidden>
            <input
              type="search"
              placeholder="Zoek op e-mail…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="h-8 rounded-md border border-[#e5e7eb] bg-white px-2 text-sm outline-none focus:ring-2 focus:ring-[#d6e0ff]"
            />
          </label>
          <button
            type="button"
            onClick={fetchMembers}
            className="h-8 rounded-md border border-[#e5e7eb] px-3 text-sm hover:bg-gray-50"
            title="Vernieuwen"
          >
            Vernieuwen
          </button>
          <button
            type="button"
            onClick={exportCsv}
            className="h-8 rounded-md border border-[#e5e7eb] px-3 text-sm hover:bg-gray-50"
            title="Exporteer CSV (gefilterde lijst)"
          >
            Export CSV
          </button>
        </div>
      </div>

      {/* Meldingen */}
      {errMsg && <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">Fout: {errMsg}</div>}
      {roleLoading && <div className="rounded-lg border border-[#eef1f6] bg-white p-4 text-sm text-[#5b5e66]">Rol bepalen…</div>}
      {!activeOrgId && <div className="rounded-lg border border-[#eef1f6] bg-[#fcfcfe] p-4 text-sm text-[#5b5e66]">Kies eerst een workspace.</div>}
      {!roleLoading && role !== 'ADMIN' && activeOrgId && (
        <div className="rounded-lg border border-[#eef1f6] bg-white p-4 text-sm text-[#5b5e66]">
          Alleen ADMIN kan leden beheren (jouw rol: {role ?? 'onbekend'}).
        </div>
      )}

      {/* Lijst + lege staat */}
      {activeOrgId && role === 'ADMIN' && (
        <>
          <div className="overflow-hidden rounded-xl border border-[#eef1f6] bg-white shadow-sm">
            <div className="grid grid-cols-[1fr_auto_auto] items-center gap-2 border-b border-[#f2f4f8] px-4 py-2 text-xs font-medium text-[#81848b]">
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
                <div className="text-sm">Geen leden gevonden.</div>
              </div>
            ) : (
              <ul className="divide-y divide-[#f2f4f8]">
                {filtered.map((row) => {
                  const me = user?.id === row.user_id;
                  const isBusy = busyUser === row.user_id;
                  return (
                    <li key={row.user_id} className="grid grid-cols-[1fr_auto_auto] items-center gap-2 px-4 py-3">
                      {/* Lid: email + badge + id */}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <a href={`mailto:${row.email}`} className="truncate text-[15px] font-medium text-[#1c2b49] hover:underline" title={row.email}>
                            {row.email}
                          </a>
                          <RoleBadge role={row.role} />
                        </div>
                        <div className="mt-0.5 text-[11px] text-[#80838a]">user_id: {row.user_id}</div>
                      </div>

                      {/* Rol */}
                      <div>
                        <label className="sr-only" htmlFor={`role-${row.user_id}`}>Wijzig rol</label>
                        <select
                          id={`role-${row.user_id}`}
                          aria-label={`Rol voor ${row.email}`}
                          value={row.role}
                          onChange={(e) => changeRole(row.user_id, e.target.value)}
                          disabled={isBusy}
                          className={classNames(
                            'h-9 rounded-md border border-[#e5e7eb] bg-white px-3 text-[15px] outline-none',
                            'focus:ring-2 focus:ring-[#d6e0ff]'
                          )}
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>{roleLabel[r]}</option>
                          ))}
                        </select>
                      </div>

                      {/* Acties */}
                      <div className="flex justify-end">
                        {!me ? (
                          <button
                            type="button"
                            onClick={() => askRemove(row.user_id, row.email)}
                            disabled={isBusy}
                            aria-label={`Verwijder ${row.email}`}
                            className="inline-flex h-9 items-center rounded-md border border-[#e5e7eb] px-2 text-sm text-[#3b4252] hover:bg-gray-50"
                            title="Verwijderen"
                          >
                            {isBusy ? (
                              <svg className="h-[18px] w-[18px] animate-spin" viewBox="0 0 24 24">
                                <circle cx="12" cy="12" r="10" stroke="#9aa0a6" strokeWidth="2" fill="none" />
                                <path d="M22 12a10 10 0 0 1-10 10" stroke="#3b82f6" strokeWidth="2" fill="none" />
                              </svg>
                            ) : (
                              <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.7">
                                <path d="M3 6h18" />
                                <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                                <path d="M10 11v6M14 11v6" />
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

          {/* Invite-form consistent in stijl */}
          <AdminInviteForm orgId={activeOrgId} />
        </>
      )}

      {/* Toaster / Confirm */}
      <Toast msg={toast} onClose={() => setToast('')} />
      <ConfirmModal
        open={confirm.open}
        body={<span>Weet je zeker dat je <strong>{confirm.email}</strong> wilt verwijderen?</span>}
        onConfirm={doRemove}
        onCancel={() => setConfirm({ open: false, userId: null, email: '' })}
      />
    </section>
  );
}
