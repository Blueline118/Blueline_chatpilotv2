import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './providers/AuthProvider';

import Protected from './components/Protected';
import AppHome from './pages/AppHome';          // bestaat al en werkt
import Login from './pages/Login';
import AuthCallback from './pages/AuthCallback';

// Optioneel: als je al een aparte Chatpagina gemaakt hebt:
// import CxChat from './pages/CxChat';

createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/auth/callback" element={<AuthCallback />} />

        {/* Simpel en stabiel: gebruik je bestaande AppHome als /app */}
        <Route
          path="/app"
          element={
            <Protected>
              <AppHome />
            </Protected>
          }
        />

        {/* Default redirect */}
        <Route path="*" element={<Navigate to="/app" replace />} />
      </Routes>
    </AuthProvider>
  </BrowserRouter>
);
