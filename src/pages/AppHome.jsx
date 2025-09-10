// src/pages/AppHome.jsx
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../providers/AuthProvider';
import WorkspaceSwitcher from '../components/WorkspaceSwitcher';

export default function AppHome() {
  const { user, activeOrgId } = useAuth();

  const signOut = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <h2>Chatpilot</h2>
        <button onClick={signOut}>Uitloggen</button>
      </div>

      <div style={{ margin: '12px 0' }}>
        <WorkspaceSwitcher />
      </div>

      <div style={{ marginTop: 16 }}>
        <p><b>User:</b> {user?.email}</p>
        <p><b>Active org:</b> {activeOrgId || '— (nog niet gekozen) —'}</p>
        <p>Dit is je beveiligde app-omgeving. Alleen zichtbaar als je ingelogd bent.</p>
      </div>
    </div>
  );
}
