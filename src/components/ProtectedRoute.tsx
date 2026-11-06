import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import type { Role } from '../lib/types';
import { homeFor } from '../lib/util';
import { Loading } from './ui';

/**
 * Convenience gate for the UI only. The real protection is Row Level Security and the
 * RPC functions in the database: even if someone bypassed this component they would get no data.
 */
export default function ProtectedRoute({ role, children }: { role: Role | Role[]; children: ReactNode }) {
  const { session, profile, loading, emailVerified } = useAuth();
  const loc = useLocation();
  if (loading) return <Loading label="Checking your session…" />;
  if (!session) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  if (!emailVerified || !profile || profile.status !== 'approved') return <Navigate to="/account-status" replace />;
  const allowed = Array.isArray(role) ? role : [role];
  if (!allowed.includes(profile.role)) return <Navigate to={homeFor(profile.role)} replace />;
  return <>{children}</>;
}
