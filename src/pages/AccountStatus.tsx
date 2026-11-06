import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Loading } from '../components/ui';
import { homeFor } from '../lib/util';

export default function AccountStatus() {
  const { session, profile, loading, emailVerified, signOut } = useAuth();
  const navigate = useNavigate();
  if (loading) return <Loading />;
  if (!session) return <Navigate to="/login" replace />;
  if (emailVerified && profile?.status === 'approved') return <Navigate to={homeFor(profile.role)} replace />;

  let title = 'Your account is not active';
  let body = 'Please contact a campus administrator.';
  let tone = 'alert-info';
  if (!emailVerified) {
    title = 'Verify your email address';
    body = 'Open the verification link we sent to your email. After verifying, an administrator still needs to approve your account.';
  } else if (!profile || profile.status === 'pending_approval') {
    title = 'Waiting for administrator approval';
    body = 'Your email is verified. A campus administrator must approve your account before you can use the dashboard.';
    tone = 'alert-warning';
  } else if (profile.status === 'rejected') {
    title = 'Registration not approved';
    body = `An administrator did not approve this registration.${profile.status_reason ? ` Reason: ${profile.status_reason}` : ''}`;
    tone = 'alert-error';
  } else if (profile.status === 'suspended') {
    title = 'Account suspended';
    body = `This account is suspended.${profile.status_reason ? ` Reason: ${profile.status_reason}` : ''} Contact a campus administrator.`;
    tone = 'alert-error';
  } else if (profile.status === 'deactivated') {
    title = 'Account deactivated';
    body = 'This account has been deactivated. Contact a campus administrator if this is a mistake.';
    tone = 'alert-error';
  }

  return (
    <div className="page mt-12 max-w-xl">
      <h1 className="text-3xl font-bold">{title}</h1>
      <div role="status" className={`alert ${tone} mt-4`}>{body}</div>
      <p className="mt-6 flex gap-3">
        <button type="button" className="btn btn-outline" onClick={async () => { await signOut(); navigate('/', { replace: true }); }}>Sign out</button>
        <Link to="/" className="btn btn-primary">Back to the website</Link>
      </p>
    </div>
  );
}
