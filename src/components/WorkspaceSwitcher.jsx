// src/components/WorkspaceSwitcher.jsx
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
      // memberships + gekoppelde organizations ophalen
      const { data, error } = await supabase
        .from('memberships')
        .select('org_id, role, organizations ( id, name )')
        .order('created_at', { ascending: true });
      if (!error) {
        const formatted = (data || []).map((row) => ({
          id: row.organizations?.id,
          name: row.organizations?.name,
          role: row.role
        })).filter(Boolean);
        setOrgs(formatted);

        // als er nog geen activeOrgId is en je hebt precies 1 org, kies die automatisch
        if (!activeOrgId && formatted.length === 1 && formatted[0].id) {
          setActiveOrgId(formatted[0].id);
        }
      }
      setLoading(false);
    })();
  }, [user]); // eslint-disable-line

  if (!user) return null;
  if (loading) return null;

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
