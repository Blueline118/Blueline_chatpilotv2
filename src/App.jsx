// change: /app/members uses sync admin guard (roleForActiveOrg) to avoid async bounce
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './providers/AuthProvider';
import Protected from './components/Protected';
import Login from './pages/Login';
import AppHome from './pages/AppHome';
import AuthCallback from './pages/AuthCallback';
import AcceptInvite from './pages/AcceptInvite';
import MembersAdmin from './components/MembersAdmin';

/**
 * Minimal, sync-only guard for ADMIN access.
 * - Wacht niet op async permissies; gebruikt alleen session + roleForActiveOrg.
 * - Voorkomt bounce als permissie-RPC nog laadt.
 */
function ProtectedAdmin({ children }) {
  const { session, roleForActiveOrg } = useAuth() || {};
  const location = useLocation();

  // Auth state nog aan het initialiseren → niets renderen (geen redirect)
  if (session === undefined) return null;

  // Niet ingelogd → naar login met next
  if (!session) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }

  // Ingelogd maar geen ADMIN → terug naar /app
  if (roleForActiveOrg !== 'ADMIN') {
    return <Navigate to="/app" replace />;
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/accept-invite" element={<AcceptInvite />} />

          <Route
            path="/app"
            element={
              <Protected requireMembership>
                <AppHome />
              </Protected>
            }
          />

          <Route
  path="/members"
  element={
    <ProtectedAdmin>
      <MembersAdmin />
    </ProtectedAdmin>
  }
/>
          <Route path="*" element={<Navigate to="/app" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
