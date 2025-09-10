// src/components/Protected.jsx
import { Navigate } from 'react-router-dom';
import { useAuth } from '../providers/AuthProvider';

export default function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null; // of een spinner
  if (!user) return <Navigate to="/login" replace />;
  return children;
}
