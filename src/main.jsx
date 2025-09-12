import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import BluelineChatpilot from './components/BluelineChatpilot';
import Login from './pages/Login';
import AuthCallback from './pages/AuthCallback';

import './index.css'; // zorg dat Tailwind geladen blijft

createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/auth/callback" element={<AuthCallback />} />

      {/* jouw app blijft vrij toegankelijk */}
      <Route path="/app" element={<BluelineChatpilot />} />

      {/* default naar /app */}
      <Route path="*" element={<Navigate to="/app" replace />} />
    </Routes>
  </BrowserRouter>
);
