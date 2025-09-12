import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './providers/AuthProvider';
import AppHome from './pages/AppHome';     // your working page
import Login from './pages/Login';
import AuthCallback from './pages/AuthCallback';

createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <AuthProvider>
      <Routes>
        {/* Keep login routes around, but don't gate /app right now */}
        <Route path="/login" element={<Login />} />
        <Route path="/auth/callback" element={<AuthCallback />} />

        {/* Show AppHome directly (no Protected) */}
        <Route path="/app" element={<AppHome />} />

        {/* Default route */}
        <Route path="*" element={<Navigate to="/app" replace />} />
      </Routes>
    </AuthProvider>
  </BrowserRouter>
);
