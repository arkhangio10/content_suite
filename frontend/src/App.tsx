import { Navigate, Route, Routes } from 'react-router-dom';

import { useAuth } from './auth/AuthContext';
import { ProtectedRoute } from './auth/ProtectedRoute';
import LoginPage from './pages/Login';
import HomePage from './pages/Home';
import ArchitectPage from './pages/Architect';
import CreativePage from './pages/Creative';
import GovernancePage from './pages/Governance';
import ObservabilityPage from './pages/Observability';
import { Shell } from './layout/Shell';

export default function App() {
  const { user, ready } = useAuth();

  if (!ready) {
    return (
      <div className="h-screen w-screen grid place-items-center">
        <div className="h-8 w-8 rounded-full border-2 border-accent border-r-transparent animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Shell>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route
          path="/brand-dna"
          element={
            <ProtectedRoute roles={['creator', 'approver_a', 'approver_b']}>
              <ArchitectPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/creative"
          element={
            <ProtectedRoute roles={['creator', 'approver_a', 'approver_b']}>
              <CreativePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/governance"
          element={
            <ProtectedRoute roles={['approver_a', 'approver_b']}>
              <GovernancePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/observability"
          element={
            <ProtectedRoute roles={['creator', 'approver_a', 'approver_b']}>
              <ObservabilityPage />
            </ProtectedRoute>
          }
        />
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  );
}
