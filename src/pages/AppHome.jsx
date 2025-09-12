// src/pages/AppHome.jsx
import PermissionGate from '../components/PermissionGate';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../providers/AuthProvider';
import WorkspaceSwitcher from '../components/WorkspaceSwitcher';
import ChatList from '../components/ChatList';
import MembersAdmin from '../components/MembersAdmin';
import RoleBadge from '../components/RoleBadge';

export default function AppHome() {
  const { user, activeOrgId } = useAuth();

  const signOut = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  return (
    <div style={{ padding: 16, maxWidth: 800, margin: '0 auto' }}>
      <header style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
        <h2>Chatpilot</h2>
        <div style={{ display:'flex', gap:12, alignItems:'center' }}>
          <WorkspaceSwitcher />
          <RoleBadge />
          <button onClick={signOut}>Uitloggen</button>
        </div>
      </header>

      <section style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 14, opacity: 0.8 }}>
          Ingelogd als: <strong>{user?.email}</strong>
        </div>
        <div style={{ fontSize: 12, opacity: 0.6 }}>
          Active org: {activeOrgId ?? '—'}
        </div>
      </section>

      <section style={{ marginTop: 16 }}>
        <PermissionGate
          perm="chat.delete"
          fallback={<button disabled>Verwijderen (geen recht)</button>}
        >
          <button onClick={() => alert('Toegestaan: je bent TEAM of ADMIN')}>
            Verwijderen (test)
          </button>
        </PermissionGate>
      </section>

      <ChatList />

      <MembersAdmin />
    </div>
  );
}
