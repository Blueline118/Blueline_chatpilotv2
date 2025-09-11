// src/components/MembersAdmin.jsx
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../providers/AuthProvider';
import { useMembership } from '../hooks/useMembership';

const ROLES = ['ADMIN','TEAM','CUSTOMER'];

export default function MembersAdmin() {
  const { activeOrgId } = useAuth();
  const { role, loading: roleLoading } = useMembership();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errMsg, setErrMsg] = useState(null);

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

  // UI
  return (
    <div style={{ marginTop: 32 }}>
      <h3 style={{ marginBottom: 8 }}>Leden beheren</h3>

      {!activeOrgId && <p>Kies eerst een workspace.</p>}

      {roleLoading ? <p>Rol bepalen…</p> : (
        role !== 'ADMIN'
          ? <p style={{opacity:.7}}>Alleen ADMIN kan leden beheren (jouw rol: {role ?? 'onbekend'}).</p>
          : null
      )}

      {errMsg && <p style={{color:'crimson'}}>Fout: {errMsg}</p>}
      {loading && <p>Leden laden…</p>}

      {activeOrgId && role === 'ADMIN' && !loading && !errMsg && (
        rows.length === 0
          ? <p>Geen leden gevonden.</p>
          : (
            <div style={{display:'grid', gap:8}}>
              {rows.map(row => (
                <div key={row.user_id} style={{display:'flex', justifyContent:'space-between', alignItems:'center', border:'1px solid #eee', borderRadius:8, padding:12}}>
                  <div>
                    <div style={{fontWeight:600}}>{row.email}</div>
                    <div style={{fontSize:12, opacity:.7}}>user_id: {row.user_id}</div>
                  </div>
                  <div>
                    <select
                      value={row.role}
                      onChange={(e) => changeRole(row.user_id, e.target.value)}
                      style={{ padding:6 }}
                    >
                      {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                </div>
              ))}
            </div>
          )
      )}
    </div>
  );
}
