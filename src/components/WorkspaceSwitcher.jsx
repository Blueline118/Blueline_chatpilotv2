import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../providers/AuthProvider';

export default function WorkspaceSwitcher() {
  const { user, activeOrgId, setActiveOrgId } = useAuth();
  const [orgs, setOrgs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase.rpc('get_user_orgs');
      if (error) {
        console.error('[WorkspaceSwitcher] get_user_orgs error:', error);
        setOrgs([]);
      } else {
        setOrgs(data || []);
        // reset als activeOrgId niet meer bestaat
        if (activeOrgId && !data?.find(o => o.id === activeOrgId)) {
          setActiveOrgId(null);
        }
        // precies 1 org? kies automatisch
        if (!activeOrgId && data && data.length === 1) {
          setActiveOrgId(data[0].id);
        }
      }
      setLoading(false);
    })();
  }, [user]); // eslint-disable-line

  if (!user || loading) return null;

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <span style={{ fontSize: 12, opacity: 0.7 }}>Workspace:</span>
      <select
        value={activeOrgId || ''}
        onChange={(e) => setActiveOrgId(e.target.value || null)}
        style={{ padding: 6 }}
      >
        <option value="">— kies —</option>
        {orgs.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name} ({o.role})
          </option>
        ))}
      </select>
    </div>
  );
}
