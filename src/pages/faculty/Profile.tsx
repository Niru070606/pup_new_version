import { useState, type FormEvent } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { accountStatusInfo, check, errMsg } from '../../lib/util';
import { PageHeader, StatusBadge } from '../../components/ui';

export default function Profile() {
  const { profile, refreshProfile } = useAuth();
  const [name, setName] = useState(profile?.full_name ?? '');
  const [dept, setDept] = useState(profile?.department ?? '');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  if (!profile) return null;

  async function save(e: FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2) { setMsg({ ok: false, text: 'Enter your full name.' }); return; }
    setBusy(true); setMsg(null);
    try {
      // The database only allows these two columns to be changed by the user.
      check(await supabase.from('profiles').update({ full_name: name.trim(), department: dept.trim() }).eq('id', profile!.id));
      await refreshProfile();
      setMsg({ ok: true, text: 'Profile saved.' });
    } catch (err) { setMsg({ ok: false, text: errMsg(err) }); } finally { setBusy(false); }
  }

  const s = accountStatusInfo(profile.status);
  return (
    <>
      <PageHeader title="My profile" intro="You can update your name and department. Email, role and account status are managed by administrators. Public directory details are also maintained by administrators." />
      <form onSubmit={save} noValidate className="card max-w-lg space-y-4">
        {msg && <div role={msg.ok ? 'status' : 'alert'} className={`alert ${msg.ok ? 'alert-success' : 'alert-error'}`}>{msg.text}</div>}
        <div>
          <label className="label" htmlFor="p-email">Email</label>
          <input id="p-email" className="input bg-surface" value={profile.email} readOnly />
        </div>
        <div className="flex items-center gap-2 text-sm"><span>Account status:</span><StatusBadge {...s} /></div>
        <div>
          <label className="label" htmlFor="p-name">Full name</label>
          <input id="p-name" className="input" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="p-dept">Department or office</label>
          <input id="p-dept" className="input" maxLength={120} value={dept} onChange={(e) => setDept(e.target.value)} />
        </div>
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save profile'}</button>
      </form>
    </>
  );
}
