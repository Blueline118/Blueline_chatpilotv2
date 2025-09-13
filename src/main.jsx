// === main.jsx (alleen noodzakelijke aanpassingen toegepast) ===
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './providers/AuthProvider';
import BluelineChatpilot from './components/BluelineChatpilot';
import Login from './pages/Login';
import AuthCallback from './pages/AuthCallback';
import AcceptInvite from './pages/AcceptInvite';
import MembersAdmin from './components/MembersAdmin.jsx'; // of jouw pad
import Protected from './components/Protected.jsx'; // [NIEUW] nodig voor /members

import './index.css';

createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/accept-invite" element={<AcceptInvite />} /> {/* [NIEUW] */}

        {/* Chatpilot blijft vrij toegankelijk */}
        <Route path="/app" element={<BluelineChatpilot />} />

        {/* Ledenbeheer alleen voor ingelogde users */}
        <<Route
  path="/members"
  element={
    <Protected>
      <BluelineChatpilot />
    </Protected>
  }
/>

        <Route path="*" element={<Navigate to="/app" replace />} />
      </Routes>
    </AuthProvider>
  </BrowserRouter>
);

// Opmerking: eventuele losse/verdwaalde <Routes> blokken onderaan dit bestand zijn verwijderd.
// Alle routes zitten nu netjes binnen het createRoot().
