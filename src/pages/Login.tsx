import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { errMsg, homeFor, isEmail } from '../lib/util';

export default function Login() {
  const { signIn, session, loading, profile } = useAuth();
  const navigate = useNavigate();
  const loc = useLocation();
  const state = (loc.state ?? {}) as { from?: string; notice?: string };
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Once signed in (and the profile is loaded), continue. Route guards decide where the user may actually go.
  useEffect(() => {
    if (!loading && session) navigate(state.from ?? homeFor(profile?.role), { replace: true });
  }, [loading, session, navigate, state.from, profile]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!isEmail(email.trim()) || !password) { setError('Enter your email address and password.'); return; }
    setBusy(true);
    setError(null);
    try { await signIn(email, password); } catch (err) { setError(errMsg(err)); } finally { setBusy(false); }
  }

  return (
    <div className="page mt-12 max-w-md">
      <h1 className="text-3xl font-bold">Faculty/Staff login</h1>
      <p className="mt-2 text-sm text-muted">For approved Faculty/Staff and administrators. Visitors do not need an account.</p>
      {state.notice && <div role="status" className="alert alert-success mt-4">{state.notice}</div>}
      <form onSubmit={submit} noValidate className="card mt-4 space-y-4">
        {error && <div role="alert" className="alert alert-error">{error}</div>}
        <div>
          <label className="label" htmlFor="l-email">Email</label>
          <input id="l-email" type="email" autoComplete="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="l-pw">Password</label>
          <input id="l-pw" type="password" autoComplete="current-password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <button type="submit" className="btn btn-primary w-full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
      <p className="mt-4 flex flex-wrap justify-between gap-2 text-sm">
        <Link to="/forgot-password">Forgot your password?</Link>
        <Link to="/register">Create a Faculty/Staff account</Link>
      </p>
    </div>
  );
}
