import { useState, type FormEvent } from 'react';
import { supabase } from '../../lib/supabase';
import { useQuery } from '../../lib/useQuery';
import { useContent } from '../../context/ContentContext';
import { check, errMsg, unwrap } from '../../lib/util';
import type { AcademicProgram, CampusContentRow } from '../../lib/types';
import { ConfirmDialog, EmptyState, ErrorNotice, Loading, PageHeader, type Pending } from '../../components/ui';

const GROUP_TITLES: Record<string, string> = {
  home: 'Homepage', about: 'About the campus', contact: 'Contact and location', links: 'Quick links', settings: 'Website settings',
};

function ContentRow({ row, onSaved }: { row: CampusContentRow; onSaved: () => void }) {
  const [v, setV] = useState(row.value);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const id = `cc-${row.key}`;

  async function save() {
    const val = v.trim();
    setMsg(null);
    if (row.kind === 'url' && val && !val.startsWith('https://')) { setMsg({ ok: false, text: 'The link must start with https://' }); return; }
    if (row.key === 'map_embed_url' && val && !val.startsWith('https://www.google.com/maps/embed')) { setMsg({ ok: false, text: 'Use the “Embed a map” link from Google Maps (starts with https://www.google.com/maps/embed).' }); return; }
    setBusy(true);
    try {
      check(await supabase.from('campus_content').update({ value: val }).eq('key', row.key));
      setMsg({ ok: true, text: 'Saved.' });
      onSaved();
    } catch (e) { setMsg({ ok: false, text: errMsg(e) }); } finally { setBusy(false); }
  }

  return (
    <div className="card space-y-2">
      <label className="label" htmlFor={id}>{row.label}</label>
      {row.kind === 'longtext' && <textarea id={id} rows={5} className="input" maxLength={5000} value={v} onChange={(e) => setV(e.target.value)} />}
      {(row.kind === 'text' || row.kind === 'url') && <input id={id} className="input" maxLength={row.kind === 'url' ? 1000 : 500} value={v} onChange={(e) => setV(e.target.value)} />}
      {row.kind === 'toggle' && (
        <select id={id} className="input max-w-xs" value={v} onChange={(e) => setV(e.target.value)}>
          <option value="true">On</option>
          <option value="false">Off</option>
        </select>
      )}
      <div className="flex items-center gap-3">
        <button type="button" className="btn btn-primary btn-sm" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        {msg && <span role={msg.ok ? 'status' : 'alert'} className={msg.ok ? 'text-sm text-[#1F6030]' : 'field-error'}>{msg.text}</span>}
      </div>
    </div>
  );
}

interface PForm { id?: string; name: string; description: string; display_order: string; is_published: boolean }
const PEMPTY: PForm = { name: '', description: '', display_order: '0', is_published: true };

function Programs() {
  const q = useQuery(async () => unwrap<AcademicProgram[]>(await supabase.from('academic_programs').select('*').order('display_order').order('name')), []);
  const [form, setForm] = useState<PForm | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    if (!form.name.trim()) { setError('Enter the program name.'); return; }
    setBusy(true); setError(null);
    const payload = { name: form.name.trim(), description: form.description.trim() || null, display_order: parseInt(form.display_order, 10) || 0, is_published: form.is_published };
    try {
      check(form.id ? await supabase.from('academic_programs').update(payload).eq('id', form.id) : await supabase.from('academic_programs').insert(payload));
      setForm(null); q.reload();
    } catch (err) { setError(errMsg(err)); } finally { setBusy(false); }
  }

  return (
    <section className="mt-10" aria-labelledby="prog-h">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 id="prog-h" className="text-xl font-bold">Academic programs</h2>
        {!form && <button type="button" className="btn btn-primary btn-sm" onClick={() => { setForm(PEMPTY); setError(null); }}>Add program</button>}
      </div>
      <p className="mb-3 text-sm text-muted">Only list programs that are verified. Do not add accreditation claims you cannot confirm.</p>
      {form && (
        <form onSubmit={save} noValidate className="card mb-4 space-y-3">
          {error && <div role="alert" className="alert alert-error">{error}</div>}
          <div><label className="label" htmlFor="pg-name">Program name</label><input id="pg-name" className="input" maxLength={200} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><label className="label" htmlFor="pg-desc">Description (optional)</label><textarea id="pg-desc" rows={4} className="input" maxLength={2000} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div className="flex flex-wrap items-end gap-4">
            <div><label className="label" htmlFor="pg-order">Display order</label><input id="pg-order" type="number" className="input w-28" value={form.display_order} onChange={(e) => setForm({ ...form, display_order: e.target.value })} /></div>
            <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" checked={form.is_published} onChange={(e) => setForm({ ...form, is_published: e.target.checked })} /> Show publicly</label>
          </div>
          <div className="flex gap-3">
            <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save program'}</button>
            <button type="button" className="btn btn-outline" onClick={() => setForm(null)}>Cancel</button>
          </div>
        </form>
      )}
      {q.loading && <Loading />}
      {q.error && <ErrorNotice message={q.error} onRetry={q.reload} />}
      {q.data && q.data.length === 0 && <EmptyState title="No programs listed yet" />}
      <ul className="space-y-2">
        {q.data?.map((p) => (
          <li key={p.id} className="card flex flex-wrap items-center justify-between gap-2 py-3">
            <span><span className="font-medium">{p.name}</span>{!p.is_published && <span className="ml-2 text-xs text-muted">(hidden)</span>}</span>
            <span className="flex gap-2">
              <button type="button" className="btn btn-outline btn-sm" onClick={() => { setError(null); setForm({ id: p.id, name: p.name, description: p.description ?? '', display_order: String(p.display_order), is_published: p.is_published }); }}>Edit</button>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setPending({ title: `Delete “${p.name}”?`, message: 'This removes the program from the website. It cannot be undone.', confirmLabel: 'Delete', danger: true, run: async () => check(await supabase.from('academic_programs').delete().eq('id', p.id)) })}>Delete</button>
            </span>
          </li>
        ))}
      </ul>
      <ConfirmDialog pending={pending} onClose={() => setPending(null)} onDone={q.reload} />
    </section>
  );
}

export default function AdminContent({ mode }: { mode: 'content' | 'settings' }) {
  const { reload } = useContent();
  const q = useQuery(async () => unwrap<CampusContentRow[]>(await supabase.from('campus_content').select('*').order('label')), []);
  const groups = mode === 'settings' ? ['settings'] : ['home', 'about', 'contact', 'links'];

  return (
    <>
      <PageHeader
        title={mode === 'settings' ? 'Website settings' : 'Campus content'}
        intro={mode === 'settings' ? 'Site-wide options. Changes are recorded in the activity log.' : 'Everything here is shown on the public site exactly as written. Leave a field blank and visitors see a “not yet provided” note instead.'}
      />
      {q.loading && <Loading />}
      {q.error && <ErrorNotice message={q.error} onRetry={q.reload} />}
      {q.data && groups.map((g) => (
        <section key={g} className="mb-8" aria-labelledby={`g-${g}`}>
          <h2 id={`g-${g}`} className="mb-3 text-xl font-bold">{GROUP_TITLES[g]}</h2>
          <div className="space-y-3">
            {q.data!.filter((r) => r.grp === g).map((r) => <ContentRow key={r.key} row={r} onSaved={reload} />)}
          </div>
        </section>
      ))}
      {mode === 'content' && <Programs />}
    </>
  );
}
