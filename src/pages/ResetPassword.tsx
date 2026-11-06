import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { errMsg } from '../lib/util';
import { Loading } from '../components/ui';

export default function ResetPassword() {
  const { session, loading, updatePassword, signOut } = useAuth();
  const navigate = useNavigate();
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (pw.length < 10) { setError('Use at least 10 characters.'); return; }
    if (pw !== confirm) { setError('Passwords do not match.'); return; }
    setBusy(true);
    setError(null);
    try {
      await updatePassword(pw);
      await signOut();
      navigate('/login', { replace: true, state: { notice: 'Password updated. Sign in with your new password.' } });
    } catch (err) {
      setError(errMsg(err));
      setBusy(false);
    }
  }

  if (loading) return <Loading />;
  return (
    <div className="page mt-12 max-w-md">
      <h1 className="text-3xl font-bold">Choose a new password</h1>
      {!session ? (
        <div className="alert alert-info mt-4">
          Open the reset link from your email to continue. If the link has expired, <Link to="/forgot-password">request a new one</Link>.
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="card mt-4 space-y-4">
          {error && <div role="alert" className="alert alert-error">{error}</div>}
          <div>
            <label className="label" htmlFor="n-pw">New password</label>
            <input id="n-pw" type="password" autoComplete="new-password" className="input" value={pw} onChange={(e) => setPw(e.target.value)} />
            <p className="hint">At least 10 characters.</p>
          </div>
          <div>
            <label className="label" htmlFor="n-pw2">Confirm new password</label>
            <input id="n-pw2" type="password" autoComplete="new-password" className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </div>
          <button type="submit" className="btn btn-primary w-full" disabled={busy}>{busy ? 'Saving…' : 'Save new password'}</button>
        </form>
      )}
    </div>
  );
}
