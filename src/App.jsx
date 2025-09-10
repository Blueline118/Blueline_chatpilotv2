// src/App.jsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './providers/AuthProvider';
import Protected from './components/Protected';
import Login from './pages/Login';
import AppHome from './pages/AppHome';
import AuthCallback from './pages/AuthCallback'; // ← import

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/auth/callback" element={<AuthCallback />} /> {/* ← nieuw */}
          <Route
            path="/app"
            element={
              <Protected>
                <AppHome />
              </Protected>
            }
          />
          <Route path="*" element={<Navigate to="/app" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
