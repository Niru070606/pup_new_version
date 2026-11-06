import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useQuery } from '../../lib/useQuery';
import { usePageTitle } from '../../lib/usePageTitle';
import { check, errMsg, formatDate, isEmail, PH_MONTHS, unwrap } from '../../lib/util';
import type { AcademicProgram, AdminUser, DirectoryEntry, EmploymentStatus, MediaAsset, PersonnelPrivate, PersonnelSection } from '../../lib/types';
import MediaPicker, { Thumb } from '../../components/media/MediaPicker';
import { ConfirmDialog, EmptyState, ErrorNotice, Loading, PageHeader, StatusBadge, type Pending } from '../../components/ui';

const SECTIONS: Record<PersonnelSection, string> = { administration: 'Campus Administration', teaching: 'Teaching Personnel', non_teaching: 'Non-Teaching Personnel' };
const STATUSES: EmploymentStatus[] = ['permanent', 'temporary', 'contractual', 'part_time', 'job_order', 'on_leave', 'retired', 'resigned'];

interface Form {
  id?: string; full_name: string; job_title: string; department: string; public_email: string; public_phone: string; is_public: boolean; display_order: string; profile_id: string;
  section: PersonnelSection; program_id: string; is_director: boolean; photo_asset_id: string; photo_approved: boolean;
  consent_contact: boolean; consent_birthday: boolean; consent_retirement: boolean; employment_verified: boolean;
  date_joined: string; birthday: string; retirement_date: string; employment_status: string; personal_phone: string; personal_email: string; notes: string;
}
const EMPTY: Form = {
  full_name: '', job_title: '', department: '', public_email: '', public_phone: '', is_public: true, display_order: '0', profile_id: '', section: 'teaching', program_id: '', is_director: false,
  photo_asset_id: '', photo_approved: false, consent_contact: false, consent_birthday: false, consent_retirement: false, employment_verified: false,
  date_joined: '', birthday: '', retirement_date: '', employment_status: '', personal_phone: '', personal_email: '', notes: '',
};

function yearsOfService(joined: string | null | undefined): number | null {
  if (!joined) return null;
  const d = new Date(joined), n = new Date();
  let y = n.getFullYear() - d.getFullYear();
  if (n.getMonth() < d.getMonth() || (n.getMonth() === d.getMonth() && n.getDate() < d.getDate())) y--;
  return y < 0 ? null : y;
}
const isNew = (joined: string | null | undefined) => {
  if (!joined) return false;
  const d = new Date(joined), lim = new Date(); lim.setMonth(lim.getMonth() - 3);
  return d > lim && d <= new Date();
};

export default function AdminDirectory() {
  usePageTitle('Faculty and staff records');
  const navigate = useNavigate();
  const q = useQuery(async () => {
    const entries = unwrap<DirectoryEntry[]>(await supabase.from('faculty_directory').select('*').order('display_order').order('full_name'));
    const priv = unwrap<PersonnelPrivate[]>(await supabase.from('personnel_private').select('*'));
    const users = unwrap<AdminUser[]>(await supabase.rpc('admin_list_users')).filter((u) => u.role === 'faculty' && u.status === 'approved');
    const programs = unwrap<AcademicProgram[]>(await supabase.from('academic_programs').select('*').order('name'));
    return { entries, priv: new Map(priv.map((p) => [p.directory_id, p])), users, programs };
  }, []);
  const [form, setForm] = useState<Form | null>(null);
  const [photo, setPhoto] = useState<MediaAsset | null>(null);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [term, setTerm] = useState('');
  const [fSection, setFSection] = useState('');
  const set = (k: keyof Form) => (e: { target: { value: string } }) => setForm((p) => (p ? { ...p, [k]: e.target.value } : p));
  const flag = (k: keyof Form) => (e: { target: { checked: boolean } }) => setForm((p) => (p ? { ...p, [k]: e.target.checked } : p));

  function edit(d: DirectoryEntry) {
    const p = q.data?.priv.get(d.id);
    setError(null); setPhoto(null);
    setForm({
      id: d.id, full_name: d.full_name, job_title: d.job_title ?? '', department: d.department ?? '', public_email: d.public_email ?? '', public_phone: d.public_phone ?? '', is_public: d.is_public,
      display_order: String(d.display_order), profile_id: d.profile_id ?? '', section: d.section, program_id: d.program_id ?? '', is_director: d.is_director, photo_asset_id: d.photo_asset_id ?? '',
      photo_approved: d.photo_approved, consent_contact: d.consent_contact, consent_birthday: d.consent_birthday, consent_retirement: d.consent_retirement, employment_verified: d.employment_verified,
      date_joined: p?.date_joined ?? '', birthday: p?.birthday ?? '', retirement_date: p?.retirement_date ?? '', employment_status: p?.employment_status ?? '',
      personal_phone: p?.personal_phone ?? '', personal_email: p?.personal_email ?? '', notes: p?.notes ?? '',
    });
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    if (!form.full_name.trim()) { setError('Enter a name.'); return; }
    if (form.public_email.trim() && !isEmail(form.public_email.trim())) { setError('Enter a valid public email address, or leave it blank.'); return; }
    if (form.personal_email.trim() && !isEmail(form.personal_email.trim())) { setError('Enter a valid private email address, or leave it blank.'); return; }
    if (form.public_phone.trim() && !/^[0-9 +().-]{5,40}$/.test(form.public_phone.trim())) { setError('The public phone number may only contain digits, spaces and + ( ) . -'); return; }
    if (form.retirement_date && form.date_joined && form.retirement_date < form.date_joined) { setError('The retirement date cannot be before the date joined.'); return; }
    setBusy(true); setError(null);
    const section = form.is_director ? 'administration' : form.section;
    const payload = {
      full_name: form.full_name.trim(), job_title: form.job_title.trim() || null, department: form.department.trim() || null,
      public_email: form.public_email.trim() || null, public_phone: form.public_phone.trim() || null, is_public: form.is_public,
      display_order: parseInt(form.display_order, 10) || 0, profile_id: form.profile_id || null, section, program_id: section === 'teaching' ? form.program_id || null : null,
      is_director: form.is_director, photo_asset_id: form.photo_asset_id || null, photo_approved: Boolean(form.photo_asset_id) && form.photo_approved,
      consent_contact: form.consent_contact, consent_birthday: form.consent_birthday, consent_retirement: form.consent_retirement, employment_verified: form.employment_verified,
    };
    try {
      let id = form.id;
      if (id) check(await supabase.from('faculty_directory').update(payload).eq('id', id));
      else {
        const row = unwrap<{ id: string }>(await supabase.from('faculty_directory').insert(payload).select('id').single());
        id = row.id;
      }
      const priv = {
        directory_id: id, date_joined: form.date_joined || null, birthday: form.birthday || null, retirement_date: form.retirement_date || null,
        employment_status: form.employment_status || null, personal_phone: form.personal_phone.trim() || null, personal_email: form.personal_email.trim() || null, notes: form.notes.trim() || null,
      };
      check(await supabase.from('personnel_private').upsert(priv, { onConflict: 'directory_id' }));
      setForm(null);
      q.reload();
    } catch (err) { setError(errMsg(err)); } finally { setBusy(false); }
  }

  function remove(d: DirectoryEntry) {
    setPending({
      title: `Delete ${d.full_name}?`, message: 'This removes the directory record and its private employment information. It cannot be undone.', confirmLabel: 'Delete', danger: true,
      run: async () => check(await supabase.from('faculty_directory').delete().eq('id', d.id)),
    });
  }

  const rows = useMemo(() => (q.data?.entries ?? []).filter((d) => {
    if (fSection && d.section !== fSection) return false;
    const t = term.trim().toLowerCase();
    return !t || [d.full_name, d.job_title, d.department].some((x) => (x ?? '').toLowerCase().includes(t));
  }), [q.data, term, fSection]);

  // ---------------- highlights (administrators see everything; announcement drafts use consented/verified people only)
  const month = new Date().getMonth() + 1;
  const hl = useMemo(() => {
    if (!q.data) return { birthdays: [] as { d: DirectoryEntry; day: number; consent: boolean }[], newcomers: [] as { d: DirectoryEntry; verified: boolean }[] };
    const data = q.data;
    const birthdays = data.entries.flatMap((d) => {
      const b = data.priv.get(d.id)?.birthday;
      return b && new Date(b + 'T00:00:00').getMonth() + 1 === month ? [{ d, day: new Date(b + 'T00:00:00').getDate(), consent: d.consent_birthday }] : [];
    }).sort((a, b) => a.day - b.day);
    const newcomers = data.entries.filter((d) => isNew(data.priv.get(d.id)?.date_joined)).map((d) => ({ d, verified: d.employment_verified }));
    return { birthdays, newcomers };
  }, [q.data, month]);

  function draft(kind: 'birthdays' | 'new') {
    if (kind === 'birthdays') {
      const list = hl.birthdays.filter((x) => x.consent && x.d.is_public);
      const body = `Happy birthday to our colleagues celebrating in ${PH_MONTHS[month - 1]}:\n\n${list.map((x) => `- ${x.d.full_name} (${PH_MONTHS[month - 1]} ${x.day})`).join('\n')}\n\nWe wish them good health and a wonderful year ahead.`;
      navigate('/admin/announcements/new', { state: { prefill: { title: `${PH_MONTHS[month - 1]} birthday celebrants`, body, category: 'Student Activities', office: 'Campus Administration' } } });
    } else {
      const list = hl.newcomers.filter((x) => x.verified && x.d.is_public);
      const body = `Please join us in welcoming our newest faculty and staff members:\n\n${list.map((x) => `- ${x.d.full_name}${x.d.job_title ? `, ${x.d.job_title}` : ''}`).join('\n')}\n\nWe are glad to have them on the team.`;
      navigate('/admin/announcements/new', { state: { prefill: { title: 'Welcome to our new faculty and staff', body, category: 'Official Notices', office: 'Campus Administration' } } });
    }
  }
  const bdayOk = hl.birthdays.filter((x) => x.consent && x.d.is_public).length;
  const newOk = hl.newcomers.filter((x) => x.verified && x.d.is_public).length;

  const prog = (id: string | null) => q.data?.programs.find((p) => p.id === id)?.name ?? null;

  return (
    <>
      <PageHeader
        title="Faculty and staff directory"
        intro="Only add details that are verified and approved for public display. Private employment information is stored separately and is never public."
        actions={!form && <button type="button" className="btn btn-primary" onClick={() => { setForm(EMPTY); setPhoto(null); setError(null); }}>Add person</button>}
      />

      {form && (
        <form onSubmit={save} noValidate className="mb-6 space-y-5">
          <h2 className="text-lg font-bold">{form.id ? 'Edit record' : 'New record'}</h2>
          {error && <div role="alert" className="alert alert-error">{error}</div>}

          <fieldset className="card space-y-4">
            <legend className="px-1 text-base font-bold text-maroon-strong">Public information</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><label className="label" htmlFor="d-name">Full name</label><input id="d-name" className="input" maxLength={120} value={form.full_name} onChange={set('full_name')} /></div>
              <div><label className="label" htmlFor="d-title">Position (verified)</label><input id="d-title" className="input" maxLength={120} value={form.job_title} onChange={set('job_title')} /></div>
              <div>
                <label className="label" htmlFor="d-sec">Section</label>
                <select id="d-sec" className="input" value={form.is_director ? 'administration' : form.section} disabled={form.is_director} onChange={set('section')}>
                  {(Object.keys(SECTIONS) as PersonnelSection[]).map((k) => <option key={k} value={k}>{SECTIONS[k]}</option>)}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="d-prog">Academic program / course</label>
                <select id="d-prog" className="input" value={form.program_id} disabled={form.is_director || form.section !== 'teaching'} onChange={set('program_id')}>
                  <option value="">None</option>
                  {q.data?.programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <p className="hint">Teaching personnel are grouped by program.</p>
              </div>
              <div><label className="label" htmlFor="d-dept">Department (verified)</label><input id="d-dept" className="input" maxLength={120} value={form.department} onChange={set('department')} /></div>
              <div><label className="label" htmlFor="d-order">Display order</label><input id="d-order" type="number" className="input" value={form.display_order} onChange={set('display_order')} /></div>
              <div><label className="label" htmlFor="d-mail">Public email (optional)</label><input id="d-mail" type="email" className="input" value={form.public_email} onChange={set('public_email')} /></div>
              <div><label className="label" htmlFor="d-phone">Public phone (optional)</label><input id="d-phone" className="input" value={form.public_phone} onChange={set('public_phone')} /></div>
              <div>
                <label className="label" htmlFor="d-user">Linked account (optional)</label>
                <select id="d-user" className="input" value={form.profile_id} onChange={set('profile_id')}>
                  <option value="">Not linked</option>
                  {q.data?.users.map((u) => <option key={u.id} value={u.id}>{u.full_name || u.email}</option>)}
                </select>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.is_director} onChange={flag('is_director')} /> This is the Director of Campus (always listed first under Campus Administration; only one allowed)</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.is_public} onChange={flag('is_public')} /> Show on the public directory</label>

            <div>
              <p className="label">Profile photo</p>
              <div className="flex flex-wrap items-center gap-3">
                <span className="block h-20 w-20 overflow-hidden rounded-full bg-surface">{photo ? <Thumb asset={photo} /> : <span className="flex h-full items-center justify-center text-xs text-muted">{form.photo_asset_id ? 'Chosen' : 'None'}</span>}</span>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => setPicking(true)}>{form.photo_asset_id ? 'Change photo' : 'Choose photo'}</button>
                {form.photo_asset_id && <button type="button" className="btn btn-outline btn-sm" onClick={() => { setPhoto(null); setForm((p) => (p ? { ...p, photo_asset_id: '', photo_approved: false } : p)); }}>Remove</button>}
              </div>
              <label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" disabled={!form.photo_asset_id} checked={form.photo_approved} onChange={flag('photo_approved')} /> The person approved this photo for public display</label>
            </div>

            <div className="rounded border border-line bg-gold-soft p-3">
              <p className="text-sm font-semibold">Written consent (recorded with your name and the time)</p>
              <p className="hint">Tick only after the person gave written permission. Without it these details stay hidden from the public.</p>
              <label className="mt-2 flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" checked={form.consent_contact} onChange={flag('consent_contact')} /> The person gave written consent to publish their contact details (public email and phone).</label>
              <label className="mt-1 flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" checked={form.consent_birthday} onChange={flag('consent_birthday')} /> The person gave written consent to publish their birthday (month and day only, never the year).</label>
              <label className="mt-1 flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" checked={form.consent_retirement} onChange={flag('consent_retirement')} /> The person gave written consent to publish retirement date and employment status.</label>
            </div>
            <label className="flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" checked={form.employment_verified} onChange={flag('employment_verified')} /> Employment dates were verified against official records (enables “years of service” and “new member” highlights).</label>
          </fieldset>

          <fieldset className="card space-y-4 border-2 border-dashed border-gray-400 bg-surface">
            <legend className="px-1 text-base font-bold text-maroon-strong">Private – administrators only</legend>
            <p className="text-sm text-muted">Never shown publicly. Only derived items (years of service, and fields with consent above) can appear.</p>
            <div className="grid gap-4 sm:grid-cols-3">
              <div><label className="label" htmlFor="p-join">Date joined</label><input id="p-join" type="date" className="input" value={form.date_joined} onChange={set('date_joined')} /></div>
              <div><label className="label" htmlFor="p-bday">Birthday</label><input id="p-bday" type="date" className="input" value={form.birthday} onChange={set('birthday')} /></div>
              <div><label className="label" htmlFor="p-ret">Retirement date</label><input id="p-ret" type="date" className="input" value={form.retirement_date} onChange={set('retirement_date')} /></div>
              <div>
                <label className="label" htmlFor="p-stat">Employment status</label>
                <select id="p-stat" className="input" value={form.employment_status} onChange={set('employment_status')}>
                  <option value="">Not set</option>
                  {STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                </select>
              </div>
              <div><label className="label" htmlFor="p-phone">Personal phone</label><input id="p-phone" className="input" maxLength={40} value={form.personal_phone} onChange={set('personal_phone')} /></div>
              <div><label className="label" htmlFor="p-mail">Personal email</label><input id="p-mail" type="email" className="input" value={form.personal_email} onChange={set('personal_email')} /></div>
            </div>
            <div><label className="label" htmlFor="p-notes">Private notes</label><textarea id="p-notes" rows={2} className="input" maxLength={1000} value={form.notes} onChange={set('notes')} /></div>
          </fieldset>

          <section className="card" aria-label="Public preview">
            <h3 className="text-base font-bold">What the public will see</h3>
            <PublicPreview f={form} program={prog(form.program_id)} />
          </section>

          <div className="flex gap-3">
            <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save record'}</button>
            <button type="button" className="btn btn-outline" onClick={() => setForm(null)}>Cancel</button>
          </div>
        </form>
      )}
      {picking && <MediaPicker purpose="personnel" title="Choose a profile photo" requireAlt={false} onClose={() => setPicking(false)} onSelect={(a) => { setPhoto(a); setForm((p) => (p ? { ...p, photo_asset_id: a.id } : p)); setPicking(false); }} />}

      {q.loading && <Loading />}
      {q.error && <ErrorNotice message={q.error} onRetry={q.reload} />}

      {q.data && !form && (hl.birthdays.length > 0 || hl.newcomers.length > 0) && (
        <section aria-labelledby="ah-h" className="card mb-6 bg-gold-soft">
          <h2 id="ah-h" className="text-lg font-bold">Highlights for {PH_MONTHS[month - 1]}</h2>
          <div className="mt-2 grid gap-4 text-sm md:grid-cols-2">
            <div>
              <h3 className="font-bold">Birthdays this month</h3>
              {hl.birthdays.length === 0 ? <p className="text-muted">None.</p> : (
                <ul className="mt-1 space-y-0.5">{hl.birthdays.map((x) => <li key={x.d.id}>{x.d.full_name} – {PH_MONTHS[month - 1]} {x.day} {x.consent ? '' : <span className="badge badge-neutral">no consent: not public</span>}</li>)}</ul>
              )}
              <button type="button" className="btn btn-outline btn-sm mt-2" disabled={bdayOk === 0} onClick={() => draft('birthdays')}>Draft an announcement ({bdayOk} with consent)</button>
            </div>
            <div>
              <h3 className="font-bold">New members (first 3 months)</h3>
              {hl.newcomers.length === 0 ? <p className="text-muted">None.</p> : (
                <ul className="mt-1 space-y-0.5">{hl.newcomers.map((x) => <li key={x.d.id}>{x.d.full_name} {x.verified ? '' : <span className="badge badge-neutral">unverified: not public</span>}</li>)}</ul>
              )}
              <button type="button" className="btn btn-outline btn-sm mt-2" disabled={newOk === 0} onClick={() => draft('new')}>Draft an announcement ({newOk} verified)</button>
            </div>
          </div>
          <p className="hint">Drafts open in the announcement editor for you to review; nothing is published automatically.</p>
        </section>
      )}

      {q.data && !form && (
        <div className="mb-3 flex flex-wrap gap-3">
          <div className="min-w-[12rem] flex-1"><label className="label" htmlFor="ad-q">Search</label><input id="ad-q" type="search" className="input" value={term} onChange={(e) => setTerm(e.target.value)} /></div>
          <div><label className="label" htmlFor="ad-s">Section</label>
            <select id="ad-s" className="input" value={fSection} onChange={(e) => setFSection(e.target.value)}>
              <option value="">All</option>
              {(Object.keys(SECTIONS) as PersonnelSection[]).map((k) => <option key={k} value={k}>{SECTIONS[k]}</option>)}
            </select></div>
        </div>
      )}
      {q.data && q.data.entries.length === 0 && <EmptyState title="No directory records yet">Add the first person using the button above.</EmptyState>}
      {q.data && rows.length > 0 && (
        <div className="card overflow-x-auto p-0">
          <table className="tbl">
            <caption className="sr-only">Directory records</caption>
            <thead><tr><th scope="col">Name</th><th scope="col">Section / program</th><th scope="col">Years of service</th><th scope="col">Visibility</th><th scope="col">Actions</th></tr></thead>
            <tbody>
              {rows.map((d) => {
                const yrs = yearsOfService(q.data!.priv.get(d.id)?.date_joined);
                return (
                  <tr key={d.id}>
                    <td><p className="font-medium">{d.full_name}{d.is_director && <span className="ml-2 badge badge-info">Director</span>}</p><p className="text-xs text-muted">{d.job_title || '—'}{d.department ? ` · ${d.department}` : ''}</p></td>
                    <td>{SECTIONS[d.section]}{prog(d.program_id) && <p className="text-xs text-muted">{prog(d.program_id)}</p>}</td>
                    <td>{yrs === null ? '—' : yrs}{yrs !== null && !d.employment_verified && <p className="text-xs text-muted">unverified</p>}</td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        <StatusBadge label={d.is_public ? 'Public' : 'Hidden'} tone={d.is_public ? 'success' : 'neutral'} />
                        <StatusBadge label={d.employment_verified ? 'Verified' : 'Unverified'} tone={d.employment_verified ? 'success' : 'warning'} />
                        {d.photo_asset_id && <StatusBadge label={d.photo_approved ? 'Photo approved' : 'Photo pending'} tone={d.photo_approved ? 'success' : 'warning'} />}
                      </div>
                    </td>
                    <td><div className="flex gap-2"><button type="button" className="btn btn-outline btn-sm" onClick={() => edit(d)}>Edit</button><button type="button" className="btn btn-outline btn-sm" onClick={() => remove(d)}>Delete</button></div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <ConfirmDialog pending={pending} onClose={() => setPending(null)} onDone={q.reload} />
    </>
  );
}

/** Mirrors the public_directory view rules so administrators can see exactly what visitors will see. */
function PublicPreview({ f, program }: { f: Form; program: string | null }) {
  const yrs = f.employment_verified ? yearsOfService(f.date_joined) : null;
  const newbie = f.employment_verified && isNew(f.date_joined);
  const bd = f.consent_birthday && f.birthday ? new Date(f.birthday + 'T00:00:00') : null;
  const sec = f.is_director ? 'administration' : f.section;
  return (
    <div className="mt-2 rounded border border-line p-3 text-sm">
      {!f.is_public && <p className="mb-2 text-[#8A1C1C]">This record is hidden: visitors will not see it.</p>}
      <p className="text-xs text-muted">{SECTIONS[sec]}{sec === 'teaching' ? ` · ${program ?? 'Other teaching personnel'}` : ''}</p>
      <p className="text-lg font-bold">{f.full_name || '(name)'}</p>
      {f.job_title && <p className="font-medium">{f.job_title}</p>}
      {f.department && <p className="text-muted">{f.department}</p>}
      <div className="mt-1 flex flex-wrap gap-1">
        {newbie && <StatusBadge label="New member" tone="info" />}
        {yrs !== null && yrs >= 1 && <StatusBadge label={`${yrs} years of service`} tone="neutral" />}
      </div>
      {f.photo_asset_id && <p className="mt-1">{f.photo_approved ? 'Photo shown.' : 'Photo hidden until approved.'}</p>}
      {f.consent_contact && f.public_email && <p>{f.public_email}</p>}
      {f.consent_contact && f.public_phone && <p>{f.public_phone}</p>}
      {!f.consent_contact && (f.public_email || f.public_phone) && <p className="text-[#8A1C1C]">Public email/phone are hidden: contact consent not recorded.</p>}
      {bd && <p>Birthday: {PH_MONTHS[bd.getMonth()]} {bd.getDate()}</p>}
      {f.consent_retirement && f.retirement_date && <p>Retirement: {formatDate(f.retirement_date)}</p>}
      {f.consent_retirement && f.employment_status && <p>Status: {f.employment_status.replace(/_/g, ' ')}</p>}
    </div>
  );
}
