// change: enforce membership guard on app routes
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './providers/AuthProvider';
import Protected from './components/Protected';
import Login from './pages/Login';
import AppHome from './pages/AppHome';
import AuthCallback from './pages/AuthCallback';
import AcceptInvite from './pages/AcceptInvite';
import MembersAdmin from './components/MembersAdmin';

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
            path="/app/members"
            element={
              <Protected perm="members.read" requireMembership>
                <MembersAdmin />
              </Protected>
            }
          />
          <Route path="*" element={<Navigate to="/app" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
