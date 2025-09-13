// src/components/MembersAdmin.jsx
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../providers/AuthProvider';
import { useMembership } from '../hooks/useMembership';
import RoleBadge from './RoleBadge';
import AdminInviteForm from './AdminInviteForm';

const ROLES = ['ADMIN', 'TEAM', 'CUSTOMER'];

function initialsFromEmail(email = '') {
  const name = email.split('@')[0] || '';
  const parts = name.replace(/[^a-z0-9]+/gi, ' ').trim().split(' ');
  const a = (parts[0]?.[0] || '').toUpperCase();
  const b = (parts[1]?.[0] || '').toUpperCase();
  return (a + b || a || 'U').slice(0, 2);
}

export default function MembersAdmin() {
  const { activeOrgId, user } = useAuth();        // user.id voor “niet jezelf”
  const { role, loading: roleLoading } = useMembership();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errMsg, setErrMsg] = useState(null);
  const [busyUser, setBusyUser] = useState(null); // user_id die nu gewijzigd/verwijderd wordt
  const [q, setQ] = useState('');

  async function fetchMembers() {
    if (!activeOrgId) return;
    setLoading(true);
    setErrMsg(null);
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

  async function changeRole(userId, newRole) {
    setBusyUser(userId);
    const { data, error } = await supabase.rpc('update_member_role', {
      org: activeOrgId, target: userId, new_role: newRole
    });
    setBusyUser(null);
    if (error || data !== true) {
      alert('Wijzigen mislukt: ' + (error?.message || 'geen recht'));
      return;
    }
    setRows(r => r.map(x => x.user_id === userId ? { ...x, role: newRole } : x));
  }

  async function removeMember(userId, email) {
    if (!confirm(`Lid verwijderen?\n\n${email}`)) return;
    setBusyUser(userId);
    const { data, error } = await supabase.rpc('delete_member', {
      p_org: activeOrgId,
      p_target: userId
    });
    setBusyUser(null);
    if (error || data !== true) {
      alert('Verwijderen mislukt: ' + (error?.message || 'geen recht'));
      return;
    }
    setRows(r => r.filter(x => x.user_id !== userId));
  }

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter(r => (r.email || '').toLowerCase().includes(s));
  }, [rows, q]);

  return (
    <section className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h3 className="text-lg font-semibold text-[#1c2b49]">Leden beheren</h3>
          {activeOrgId && rows?.length > 0 && (
            <span className="text-xs text-[#6b7280]">{rows.length} leden</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <input
              type="search"
              placeholder="Zoek op e-mail…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="h-8 rounded-md border border-[#e5e7eb] bg-white px-2 text-sm outline-none focus:ring-2 focus:ring-[#d6e0ff]"
            />
          </div>
          <button
            type="button"
            onClick={fetchMembers}
            className="h-8 rounded-md border border-[#e5e7eb] px-3 text-sm hover:bg-gray-50"
            title="Vernieuwen"
          >
            Vernieuwen
          </button>
        </div>
      </div>

      {!activeOrgId && (
        <div className="rounded-lg border border-[#eef1f6] bg-[#fcfcfe] p-4 text-sm text-[#5b5e66]">
          Kies eerst een workspace.
        </div>
      )}

      {roleLoading && (
        <div className="rounded-lg border border-[#eef1f6] bg-white p-4 text-sm text-[#5b5e66]">
          Rol bepalen…
        </div>
      )}

      {!roleLoading && role !== 'ADMIN' && (
        <div className="rounded-lg border border-[#eef1f6] bg-white p-4 text-sm text-[#5b5e66]">
          Alleen ADMIN kan leden beheren (jouw rol: {role ?? 'onbekend'}).
        </div>
      )}

      {errMsg && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          Fout: {errMsg}
        </div>
      )}

      {activeOrgId && role === 'ADMIN' && (
        <>
          {/* Lijst */}
          <div className="overflow-hidden rounded-xl border border-[#eef1f6] bg-white shadow-sm">
            <div className="grid grid-cols-[1fr_auto_auto] items-center gap-2 border-b border-[#f2f4f8] px-4 py-2 text-xs font-medium text-[#81848b]">
              <div>Lid</div>
              <div>Rol</div>
              <div className="text-right">Acties</div>
            </div>

            {loading ? (
              <div className="px-4 py-6 text-sm text-[#6b7280]">Leden laden…</div>
            ) : filtered.length === 0 ? (
              <div className="px-4 py-6 text-sm text-[#6b7280]">Geen leden gevonden.</div>
            ) : (
              <ul className="divide-y divide-[#f2f4f8]">
                {filtered.map((row) => {
                  const me = user?.id === row.user_id;
                  return (
                    <li key={row.user_id} className="grid grid-cols-[1fr_auto_auto] items-center gap-2 px-4 py-3">
                      {/* Lid: avatar + email + id + badge */}
                      <div className="min-w-0 flex items-center gap-3">
                        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#eef4ff] text-[#194297] text-xs font-semibold">
                          {initialsFromEmail(row.email)}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <a
                              href={`mailto:${row.email}`}
                              className="truncate text-[15px] font-medium text-[#1c2b49] hover:underline"
                              title={row.email}
                            >
                              {row.email}
                            </a>
                            <RoleBadge role={row.role} />
                          </div>
                          <div className="mt-0.5 text-[11px] text-[#80838a]">user_id: {row.user_id}</div>
                        </div>
                      </div>

                      {/* Rol select */}
                      <div>
                        <select
                          value={row.role}
                          onChange={(e) => changeRole(row.user_id, e.target.value)}
                          disabled={busyUser === row.user_id}
                          className="h-8 rounded-md border border-[#e5e7eb] bg-white px-2 text-sm outline-none focus:ring-2 focus:ring-[#d6e0ff]"
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>{r}</option>
                          ))}
                        </select>
                      </div>

                      {/* Acties */}
                      <div className="flex justify-end">
                        {!me ? (
                          <button
                            type="button"
                            onClick={() => removeMember(row.user_id, row.email)}
                            disabled={busyUser === row.user_id}
                            className="inline-flex h-8 items-center rounded-md border border-[#e5e7eb] px-2 text-sm text-[#3b4252] hover:bg-gray-50"
                            title="Verwijderen"
                          >
                            {/* Trash icon (inline SVG) */}
                            <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.7">
                              <path d="M3 6h18" />
                              <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                              <path d="M10 11v6M14 11v6" />
                              <path d="M9 6V4a2 2 0 012-2h2a2 2 0 012 2v2" />
                            </svg>
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

          {/* Invite-form in dezelfde stijl */}
          <AdminInviteForm orgId={activeOrgId} />
        </>
      )}
    </section>
  );
}
