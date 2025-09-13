// src/components/MembersAdmin.jsx
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../providers/AuthProvider';
import { useMembership } from '../hooks/useMembership';
import RoleBadge from './RoleBadge';
import AdminInviteForm from './AdminInviteForm';

const ROLES = ['ADMIN', 'TEAM', 'CUSTOMER'];

export default function MembersAdmin() {
  const { activeOrgId, user } = useAuth();        // user.id nodig om jezelf niet te tonen voor verwijderen
  const { role, loading: roleLoading } = useMembership();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errMsg, setErrMsg] = useState(null);

  // Leden ophalen
  useEffect(() => {
    if (!activeOrgId) return;
    (async () => {
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
    })();
  }, [activeOrgId]);

  // Rol wijzigen
  async function changeRole(userId, newRole) {
    const { data, error } = await supabase.rpc('update_member_role', {
      org: activeOrgId, target: userId, new_role: newRole
    });
    if (error || data !== true) {
      alert('Wijzigen mislukt: ' + (error?.message || 'geen recht'));
      return;
    }
    setRows(r => r.map(x => x.user_id === userId ? { ...x, role: newRole } : x));
  }

  // Lid verwijderen (alleen ADMIN; laatste admin wordt door RPC geblokt)
  async function removeMember(userId, email) {
    if (!confirm(`Lid verwijderen?\n\n${email}`)) return;
    const { data, error } = await supabase.rpc('delete_member', {
      p_org: activeOrgId,
      p_target: userId
    });
    if (error || data !== true) {
      alert('Verwijderen mislukt: ' + (error?.message || 'geen recht'));
      return;
    }
    setRows(r => r.filter(x => x.user_id !== userId));
  }

  // UI
  return (
    <div style={{ marginTop: 32 }}>
      <div style={{ display:'flex', alignItems:'baseline', gap:12, marginBottom: 8 }}>
        <h3 style={{ margin: 0 }}>Leden beheren</h3>
        {activeOrgId && rows?.length > 0 && (
          <span style={{ fontSize: 12, opacity: .65 }}>{rows.length} leden</span>
        )}
      </div>

      {!activeOrgId && <p>Kies eerst een workspace.</p>}

      {roleLoading ? (
        <p>Rol bepalen…</p>
      ) : (
        role !== 'ADMIN'
          ? <p style={{opacity:.7}}>Alleen ADMIN kan leden beheren (jouw rol: {role ?? 'onbekend'}).</p>
          : null
      )}

      {errMsg && <p style={{color:'crimson'}}>Fout: {errMsg}</p>}
      {loading && <p>Leden laden…</p>}

      {activeOrgId && !loading && !errMsg && (
        <>
          {rows.length === 0 ? (
            <p>Geen leden gevonden.</p>
          ) : (
            <div style={{display:'grid', gap:8, marginBottom:16}}>
              {rows.map(row => (
                <div
                  key={row.user_id}
                  style={{
                    display:'flex',
                    justifyContent:'space-between',
                    alignItems:'center',
                    gap: 12,
                    border:'1px solid #eee',
                    borderRadius:8,
                    padding:12
                  }}
                >
                  {/* Links: e-mail + badge + id */}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <div style={{ fontWeight:600, overflow:'hidden', textOverflow:'ellipsis' }}>
                        {row.email}
                      </div>
                      <RoleBadge role={row.role} /> {/* toont nu de echte rij-rol */}
                    </div>
                    <div style={{fontSize:12, opacity:.7, marginTop:4}}>
                      user_id: {row.user_id}
                    </div>
                  </div>

                  {/* Rechts: rol select + verwijderen (niet bij jezelf) */}
                  {role === 'ADMIN' ? (
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <select
                        value={row.role}
                        onChange={(e) => changeRole(row.user_id, e.target.value)}
                        style={{ padding:6 }}
                      >
                        {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>

                      {user?.id !== row.user_id && (
                        <button
                          type="button"
                          onClick={() => removeMember(row.user_id, row.email)}
                          className="px-2 py-1 text-[12px] rounded-md border border-[#e0e4ef] hover:bg-gray-50"
                          title="Verwijderen"
                        >
                          Verwijderen
                        </button>
                      )}
                    </div>
                  ) : (
                    <div style={{ fontSize:12, opacity:.6 }}>—</div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Invite form (alleen zichtbaar voor ADMIN) */}
          {role === 'ADMIN' && <AdminInviteForm orgId={activeOrgId} />}
        </>
      )}
    </div>
  );
}
