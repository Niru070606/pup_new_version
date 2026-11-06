import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { isEmail } from '../lib/util';

export default function ForgotPassword() {
  const { sendReset } = useAuth();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!isEmail(email.trim())) { setError('Enter a valid email address.'); return; }
    setBusy(true);
    setError(null);
    try { await sendReset(email); } catch { /* same response either way, so account existence is not revealed */ }
    setSent(true);
    setBusy(false);
  }

  return (
    <div className="page mt-12 max-w-md">
      <h1 className="text-3xl font-bold">Reset your password</h1>
      {sent ? (
        <div role="status" className="alert alert-success mt-4">If an account exists for that email address, a reset link has been sent.</div>
      ) : (
        <form onSubmit={submit} noValidate className="card mt-4 space-y-4">
          {error && <div role="alert" className="alert alert-error">{error}</div>}
          <div>
            <label className="label" htmlFor="f-email">Email</label>
            <input id="f-email" type="email" autoComplete="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <button type="submit" className="btn btn-primary w-full" disabled={busy}>{busy ? 'Sending…' : 'Send reset link'}</button>
        </form>
      )}
      <p className="mt-4 text-sm"><Link to="/login">Back to sign in</Link></p>
    </div>
  );
}
