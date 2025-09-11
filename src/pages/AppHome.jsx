import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../providers/AuthProvider';
import AuthStatus from '../components/AuthStatus';
import WorkspaceSwitcher from '../components/WorkspaceSwitcher';
import PermissionGate from '../components/PermissionGate';
import RoleBadge from '../components/RoleBadge';



export default function AppHome() {
  const { user, activeOrgId } = useAuth();

  const signOut = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  return (
    <div style={{ padding: 16 }}>
      <AuthStatus />   {/* eventueel tijdelijk voor debug */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
  <h2>Chatpilot</h2>
  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
    <RoleBadge />
    <button onClick={signOut}>Uitloggen</button>
  </div>
</div>

<div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
  <PermissionGate perm="chat.delete" fallback={<button disabled>Verwijderen (geen recht)</button>}>
    <button
      onClick={() => alert('Je ziet dit alleen als TEAM/ADMIN. (Actie-API komt in stap 5)')}
    >
      Verwijderen (test)
    </button>
  </PermissionGate>
</div>
      <div style={{ margin: '12px 0' }}>
        <WorkspaceSwitcher />
      </div>

      <div style={{ marginTop: 16 }}>
        <p><b>User:</b> {user?.email}</p>
        <p><b>Active org:</b> {activeOrgId || '— (nog niet gekozen) —'}</p>
      </div>
    </div>
  );
}
