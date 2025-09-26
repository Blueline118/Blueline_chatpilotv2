// src/App.jsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './providers/AuthProvider';
import Protected from './components/Protected';
import Login from './pages/Login';
import AppHome from './pages/AppHome';
import AuthCallback from './pages/AuthCallback'; // ← import
import AcceptInvite from './pages/AcceptInvite';
import { usePermission } from './hooks/usePermission';

function AdminOnly({ children }) {
  const { allowed, loading, error } = usePermission('org:admin');

  if (loading) return null;
  if (error) {
    console.warn('[AdminOnlyRoute] has_permission failed', error);
    return <Navigate to="/app" replace />;
  }
  if (!allowed) {
    return <Navigate to="/app" replace />;
  }

  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/auth/callback" element={<AuthCallback />} /> {/* ← nieuw */}
          <Route path="/accept-invite" element={<AcceptInvite />} />
          <Route
            path="/app"
            element={
              <Protected>
                <AppHome />
              </Protected>
            }
          />
          <Route
            path="/members"
            element={
              <Protected>
                <AdminOnly>
                  <AppHome />
                </AdminOnly>
              </Protected>
            }
          />
          <Route path="*" element={<Navigate to="/app" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
