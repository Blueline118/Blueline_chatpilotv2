// src/main.jsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import { AuthProvider } from './providers/AuthProvider';
import BluelineChatpilot from './components/BluelineChatpilot';
import { usePermission } from './hooks/usePermission';

// Optioneel/indien aanwezig in je project:
import Login from './pages/Login';
import AuthCallback from './pages/AuthCallback';
import AcceptInvite from './pages/AcceptInvite';
import Protected from './components/Protected.jsx';

import './index.css';

function AdminOnly({ children }) {
  const { allowed, loading, error } = usePermission('org:admin');

  if (loading) return null;
  if (error) {
    console.warn('[AdminOnly] has_permission failed', error);
    return <Navigate to="/app" replace />;
  }
  if (!allowed) {
    return <Navigate to="/app" replace />;
  }

  return children;
}

const root = createRoot(document.getElementById('root'));

root.render(
  <BrowserRouter>
    <AuthProvider>
      <Routes>
        {/* Hoofd-app */}
        <Route
          path="/app"
          element={(
            <Protected>
              <BluelineChatpilot />
            </Protected>
          )}
        />

        {/* Members: NIET rechtstreeks naar <MembersAdmin /> maar via dezelfde layout */}
        <Route
          path="/members"
          element={(
            <Protected>
              <AdminOnly>
                <BluelineChatpilot />
              </AdminOnly>
            </Protected>
          )}
        />


        {/* Overige (optioneel, laat staan als je deze routes gebruikt) */}
        <Route path="/login" element={<Login />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/accept-invite" element={<AcceptInvite />} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/app" replace />} />
      </Routes>
    </AuthProvider>
  </BrowserRouter>
);
