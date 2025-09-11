import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../providers/AuthProvider';
import PermissionGate from './PermissionGate';

export default function ChatList() {
  const { activeOrgId } = useAuth();
  const [chats, setChats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);

  async function load() {
    if (!activeOrgId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('chats')
      .select('id, title, created_at')
      .eq('org_id', activeOrgId)
      .order('created_at', { ascending: false });
    if (!error) setChats(data || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [activeOrgId]);

  async function handleDelete(id) {
    if (!confirm('Weet je zeker dat je deze chat wilt verwijderen?')) return;
    setBusy(id);
    const { error } = await supabase
      .from('chats')
      .delete()
      .eq('org_id', activeOrgId)
      .eq('id', id);
    setBusy(null);
    if (error) {
      alert('Verwijderen mislukt: ' + error.message);
    } else {
      setChats((list) => list.filter((c) => c.id !== id));
    }
  }

  if (!activeOrgId) return <p>Kies eerst een workspace.</p>;
  if (loading) return <p>Laden…</p>;
  if (chats.length === 0) return <p>Geen chats.</p>;

  return (
    <div style={{ marginTop: 24, display: 'grid', gap: 8 }}>
      {chats.map((c) => (
        <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', border: '1px solid #eee', borderRadius: 8, padding: 12 }}>
          <div>
            <div style={{ fontWeight: 600 }}>{c.title}</div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>{new Date(c.created_at).toLocaleString()}</div>
          </div>

          {/* Delete-knop alléén als je chat.delete hebt */}
          <PermissionGate perm="chat.delete">
            <button
              onClick={() => handleDelete(c.id)}
              disabled={busy === c.id}
            >
              {busy === c.id ? 'Verwijderen…' : 'Verwijderen'}
            </button>
          </PermissionGate>
        </div>
      ))}
    </div>
  );
}
