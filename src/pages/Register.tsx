import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { errMsg, isEmail } from '../lib/util';

export default function Register() {
  const { signUp } = useAuth();
  const [f, setF] = useState({ fullName: '', email: '', department: '', password: '', confirm: '' });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (f.fullName.trim().length < 2) er.fullName = 'Enter your full name.';
    if (!isEmail(f.email.trim())) er.email = 'Enter a valid institutional email address.';
    if (!f.department.trim()) er.department = 'Enter your department or office.';
    if (f.password.length < 10) er.password = 'Use at least 10 characters.';
    if (f.confirm !== f.password) er.confirm = 'Passwords do not match.';
    setErrs(er);
    if (Object.keys(er).length) return;
    setBusy(true);
    setError(null);
    try {
      await signUp(f);
      setDone(true);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="page mt-12 max-w-xl">
        <h1 className="text-3xl font-bold">Check your email</h1>
        <div role="status" className="alert alert-success mt-4">
          If the details were accepted, a verification link has been sent to your email address. Open it to verify your
          address. After that, a campus administrator must approve your account before you can sign in to the dashboard.
        </div>
        <p className="mt-4"><Link to="/login">Back to sign in</Link></p>
      </div>
    );
  }

  const field = (id: keyof typeof f, label: string, type = 'text', auto?: string, hint?: string) => (
    <div>
      <label className="label" htmlFor={`r-${id}`}>{label}</label>
      <input id={`r-${id}`} type={type} autoComplete={auto} className="input" value={f[id]} onChange={set(id)} aria-invalid={!!errs[id]} aria-describedby={errs[id] ? `r-${id}-e` : hint ? `r-${id}-h` : undefined} />
      {hint && !errs[id] && <p id={`r-${id}-h`} className="hint">{hint}</p>}
      {errs[id] && <p id={`r-${id}-e`} className="field-error">{errs[id]}</p>}
    </div>
  );

  return (
    <div className="page mt-12 max-w-md">
      <h1 className="text-3xl font-bold">Create a Faculty/Staff account</h1>
      <p className="mt-2 text-sm text-muted">New accounts need email verification and administrator approval. This form cannot create administrator accounts.</p>
      <form onSubmit={submit} noValidate className="card mt-4 space-y-4">
        {error && <div role="alert" className="alert alert-error">{error}</div>}
        {field('fullName', 'Full name', 'text', 'name')}
        {field('email', 'Institutional email', 'email', 'email')}
        {field('department', 'Department or office', 'text', 'organization-title')}
        {field('password', 'Password', 'password', 'new-password', 'At least 10 characters.')}
        {field('confirm', 'Confirm password', 'password', 'new-password')}
        <button type="submit" className="btn btn-primary w-full" disabled={busy}>{busy ? 'Creating account…' : 'Create account'}</button>
      </form>
      <p className="mt-4 text-sm">Already registered? <Link to="/login">Sign in</Link></p>
    </div>
  );
}
