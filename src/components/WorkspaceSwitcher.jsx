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

      // 1) Try RPC
      let list = [];
      let err = null;
      {
        const { data, error } = await supabase.rpc('get_user_orgs');
        if (error) err = error;
        else list = data || [];
      }

      // 2) Fallback to direct select if RPC failed or returned empty (covers most RLS hiccups)
      if (err || list.length === 0) {
        const { data, error } = await supabase
          .from('memberships')
          .select('org_id, role, organizations ( id, name )')
          .order('created_at', { ascending: true });

        if (!error && data) {
          list = data
            .map((row) => ({
              id: row.organizations?.id,
              name: row.organizations?.name,
              role: row.role,
            }))
            .filter((x) => x.id && x.name);
        } else if (error) {
          console.error('[WorkspaceSwitcher] fallback error:', error);
        }
      }

      setOrgs(list);

      // Reset activeOrgId if it no longer exists
      if (activeOrgId && !list.find((o) => o.id === activeOrgId)) {
        setActiveOrgId(null);
      }
      // Auto-pick when there is exactly one org
      if (!activeOrgId && list.length === 1) {
        setActiveOrgId(list[0].id);
      }

      setLoading(false);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

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
