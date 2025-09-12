import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './providers/AuthProvider';

import BluelineChatpilot from './components/BluelineChatpilot';
import Login from './pages/Login';
import AuthCallback from './pages/AuthCallback';

import './index.css';

createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        {/* Chatpilot blijft vrij toegankelijk */}
        <Route path="/app" element={<BluelineChatpilot />} />
        <Route path="*" element={<Navigate to="/app" replace />} />
      </Routes>
    </AuthProvider>
  </BrowserRouter>
);
