// change: sync active org through AuthProvider context
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../providers/AuthProvider';

export default function WorkspaceSwitcher() {
  const { user, activeOrgId, setActiveOrgId, refreshMemberships } = useAuth();
  const [orgs, setOrgs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setOrgs([]);
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      setLoading(true);

      let list = [];

      const { data: rpcData, error: rpcError } = await supabase.rpc('get_user_orgs');
      if (!rpcError && Array.isArray(rpcData)) {
        list = rpcData;
      }

      if (list.length === 0) {
        const { data, error } = await supabase
          .from('memberships')
          .select('org_id, role, organizations ( id, name )')
          .order('created_at', { ascending: true });

        if (!error && Array.isArray(data)) {
          list = data
            .map((row) => ({
              id: row.organizations?.id,
              name: row.organizations?.name,
              role: row.role,
            }))
            .filter((item) => item.id && item.name);
        } else if (error) {
          console.error('[WorkspaceSwitcher] fallback error:', error);
        }
      }

      if (cancelled) return;

      setOrgs(list);

      if (activeOrgId && !list.find((o) => o.id === activeOrgId)) {
        setActiveOrgId(null);
      }
      if (!activeOrgId && list.length === 1) {
        setActiveOrgId(list[0].id);
      }

      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  if (!user || loading) return null;

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <span style={{ fontSize: 12, opacity: 0.7 }}>Workspace:</span>
      <select
        value={activeOrgId || ''}
        onChange={async (e) => {
          const next = e.target.value || null;
          setActiveOrgId(next);
          await refreshMemberships();
        }}
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
