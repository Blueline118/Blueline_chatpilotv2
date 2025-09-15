// src/components/ChatList.jsx
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../providers/AuthProvider';
import { useMembership } from '../hooks/useMembership';
import { isOwnerOrAdmin } from '../utils/acl';

export default function ChatList() {
  const { activeOrgId, user } = useAuth();
  const { role } = useMembership(); // rol uit memberships (RLS-proof)
  const [chats, setChats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);

  async function load() {
    if (!activeOrgId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('chats')
      .select('id, title, created_at, owner_id') // ⬅ owner_id toegevoegd
      .eq('org_id', activeOrgId)
      .order('created_at', { ascending: false });
    if (!error) setChats(data || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [activeOrgId]);

  async function handleDelete(id) {
  if (!confirm('Weet je zeker dat je deze chat wilt verwijderen?')) return;
  setBusy(id);

  // ✅ log precies vóór de DB-call
  console.log('[DELETE]', { id, activeOrgId, user: user?.id, role });

  try {
    const { error } = await supabase
      .from('chats')
      .delete()
      .eq('org_id', activeOrgId)
      .eq('id', id);

    if (error) throw error;

    setChats((list) => list.filter((c) => c.id !== id));
  } catch (e) {
    alert('Je kunt deze chat niet verwijderen (alleen eigenaar of admin).');
  } finally {
    setBusy(null);
  }
}

// ✅ boven je return, is prima zo; je kunt ‘m evt. dempen:
if (!loading && chats.length > 0) {
  console.table(
    chats.map(c => ({
      id: c.id,
      owner_id: c.owner_id,
      you: user?.id,
      role
    }))
  );
}

// in handleDelete net vóór de delete-call:
console.log('[DELETE]', { id, activeOrgId, user: user?.id, role });

  if (!activeOrgId) return <p>Kies eerst een workspace.</p>;
  if (loading) return <p>Laden…</p>;
  if (chats.length === 0) return <p>Geen chats.</p>;

  return (
    <div style={{ marginTop: 24, display: 'grid', gap: 8 }}>
      {chats.map((c) => {
        const canDelete = isOwnerOrAdmin({ row: c, userId: user?.id, role });

        return (
          <div
            key={c.id}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              border: '1px solid #eee',
              borderRadius: 8,
              padding: 12
            }}
          >
            <div>
              <div style={{ fontWeight: 600 }}>{c.title}</div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>
                {new Date(c.created_at).toLocaleString()}
              </div>
            </div>

            {canDelete && (
              <button
                onClick={() => handleDelete(c.id)}
                disabled={busy === c.id}
              >
                {busy === c.id ? 'Verwijderen…' : 'Verwijderen'}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
