// src/main.jsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import { AuthProvider } from './providers/AuthProvider';
import BluelineChatpilot from './components/BluelineChatpilot';

// Optioneel/indien aanwezig in je project:
import Login from './pages/Login';
import AuthCallback from './pages/AuthCallback';
import AcceptInvite from './pages/AcceptInvite';
import Protected from './components/Protected.jsx';

import './index.css';

const root = createRoot(document.getElementById('root'));

root.render(
  <BrowserRouter>
    <AuthProvider>
      <Routes>
        {/* Hoofd-app */}
        <Route path="/app" element={<BluelineChatpilot />} />

        {/* Members: NIET rechtstreeks naar <MembersAdmin /> maar via dezelfde layout */}
        <Route
  path="/members"
  element={
    <Protected perm={null}>
      <BluelineChatpilot />
    </Protected>
  }
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
