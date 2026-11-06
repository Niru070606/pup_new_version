import { useState, type FormEvent } from 'react';
import { supabase } from '../../lib/supabase';
import { useQuery } from '../../lib/useQuery';
import { check, errMsg, formatDateTime, fromLocalInput, toLocalInput, unwrap } from '../../lib/util';
import type { CampusEvent, MediaAsset } from '../../lib/types';
import MediaPicker, { Thumb } from '../../components/media/MediaPicker';
import { ConfirmDialog, EmptyState, ErrorNotice, Loading, PageHeader, StatusBadge, type Pending } from '../../components/ui';

interface Form {
  id?: string; title: string; description: string; location: string; category: string; starts: string; ends: string; all_day: boolean;
  cover: MediaAsset | null; cover_asset_id: string | null; cover_alt: string; is_published: boolean; publish_at: string;
}
const EMPTY: Form = { title: '', description: '', location: '', category: '', starts: '', ends: '', all_day: false, cover: null, cover_asset_id: null, cover_alt: '', is_published: false, publish_at: '' };

function state(e: CampusEvent): { label: string; tone: 'success' | 'warning' | 'neutral' } {
  if (!e.is_published) return { label: 'Draft', tone: 'neutral' };
  if (e.publish_at && new Date(e.publish_at) > new Date()) return { label: 'Scheduled', tone: 'warning' };
  if (new Date(e.ends_at ?? e.starts_at) < new Date()) return { label: 'Past', tone: 'neutral' };
  return { label: 'Published', tone: 'success' };
}

export default function AdminEvents() {
  const q = useQuery(async () => {
    const events = unwrap<CampusEvent[]>(await supabase.from('campus_events').select('*').order('starts_at', { ascending: false }).limit(300));
    const ids = events.map((e) => e.cover_asset_id).filter((x): x is string => Boolean(x));
    const covers = ids.length ? unwrap<MediaAsset[]>(await supabase.from('media_assets').select('*').in('id', ids)) : [];
    return { events, covers };
  }, []);
  const [form, setForm] = useState<Form | null>(null);
  const [picker, setPicker] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const set = (k: keyof Form) => (e: { target: { value: string } }) => setForm((p) => (p ? { ...p, [k]: e.target.value } : p));

  function edit(e: CampusEvent) {
    setError(null);
    setForm({
      id: e.id, title: e.title, description: e.description ?? '', location: e.location ?? '', category: e.category ?? '', starts: toLocalInput(e.starts_at), ends: toLocalInput(e.ends_at),
      all_day: e.all_day, cover: q.data?.covers.find((c) => c.id === e.cover_asset_id) ?? null, cover_asset_id: e.cover_asset_id ?? null, cover_alt: e.cover_alt ?? '',
      is_published: Boolean(e.is_published), publish_at: toLocalInput(e.publish_at),
    });
  }

  async function save(ev: FormEvent) {
    ev.preventDefault();
    if (!form) return;
    if (!form.title.trim()) { setError('Enter an event title.'); return; }
    if (!form.starts) { setError('Choose when the event starts.'); return; }
    if (form.ends && new Date(form.ends) < new Date(form.starts)) { setError('The end time must be after the start time.'); return; }
    if (form.cover_asset_id && !form.cover_alt.trim()) { setError('Describe the cover image (alt text).'); return; }
    setBusy(true); setError(null);
    const payload = {
      title: form.title.trim(), description: form.description.trim() || null, location: form.location.trim() || null, category: form.category.trim() || null,
      starts_at: fromLocalInput(form.starts), ends_at: fromLocalInput(form.ends), all_day: form.all_day, cover_asset_id: form.cover_asset_id,
      cover_alt: form.cover_asset_id ? form.cover_alt.trim() : null, is_published: form.is_published, publish_at: fromLocalInput(form.publish_at),
    };
    try {
      check(form.id ? await supabase.from('campus_events').update(payload).eq('id', form.id) : await supabase.from('campus_events').insert(payload));
      setForm(null); q.reload();
    } catch (e) { setError(errMsg(e)); } finally { setBusy(false); }
  }

  function remove(e: CampusEvent) {
    setPending({ title: `Delete "${e.title}"?`, message: 'The event is removed from the calendar permanently.', confirmLabel: 'Delete', danger: true, run: async () => check(await supabase.from('campus_events').delete().eq('id', e.id)) });
  }

  return (
    <>
      <PageHeader title="Events calendar" intro="Events appear publicly only when published (and after their scheduled time)."
        actions={!form && <button type="button" className="btn btn-primary" onClick={() => { setForm(EMPTY); setError(null); }}>Add event</button>} />
      {form && (
        <form onSubmit={save} noValidate className="card mb-6 space-y-4">
          <h2 className="text-lg font-bold">{form.id ? 'Edit event' : 'New event'}</h2>
          {error && <div role="alert" className="alert alert-error">{error}</div>}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2"><label className="label" htmlFor="e-title">Title</label><input id="e-title" className="input" maxLength={200} value={form.title} onChange={set('title')} /></div>
            <div><label className="label" htmlFor="e-start">Starts</label><input id="e-start" type="datetime-local" className="input" value={form.starts} onChange={set('starts')} /></div>
            <div><label className="label" htmlFor="e-end">Ends (optional)</label><input id="e-end" type="datetime-local" className="input" value={form.ends} onChange={set('ends')} /></div>
            <div><label className="label" htmlFor="e-loc">Location</label><input id="e-loc" className="input" maxLength={200} value={form.location} onChange={set('location')} /></div>
            <div><label className="label" htmlFor="e-cat">Category</label><input id="e-cat" className="input" maxLength={60} value={form.category} onChange={set('category')} placeholder="e.g. Academic" /></div>
            <div className="sm:col-span-2"><label className="label" htmlFor="e-desc">Details</label><textarea id="e-desc" rows={5} className="input" maxLength={5000} value={form.description} onChange={set('description')} /></div>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.all_day} onChange={(e) => setForm((p) => (p ? { ...p, all_day: e.target.checked } : p))} /> All-day event</label>
          <fieldset className="space-y-2">
            <legend className="label">Cover image (optional)</legend>
            {form.cover && <div className="h-24 w-36 overflow-hidden rounded border border-line"><Thumb asset={form.cover} /></div>}
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setPicker(true)}>{form.cover_asset_id ? 'Change image' : 'Choose image'}</button>
              {form.cover_asset_id && <button type="button" className="btn btn-outline btn-sm" onClick={() => setForm((p) => (p ? { ...p, cover: null, cover_asset_id: null, cover_alt: '' } : p))}>Remove</button>}
            </div>
            {form.cover_asset_id && <div><label className="label" htmlFor="e-alt">Image description (alt text)</label><input id="e-alt" className="input" maxLength={300} value={form.cover_alt} onChange={set('cover_alt')} /></div>}
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.is_published} onChange={(e) => setForm((p) => (p ? { ...p, is_published: e.target.checked } : p))} /> Published</label>
            <div><label className="label" htmlFor="e-pub">Publish at (optional schedule)</label><input id="e-pub" type="datetime-local" className="input" value={form.publish_at} onChange={set('publish_at')} /></div>
          </div>
          <div className="flex gap-3">
            <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save event'}</button>
            <button type="button" className="btn btn-outline" onClick={() => setForm(null)}>Cancel</button>
          </div>
        </form>
      )}
      {picker && <MediaPicker purpose="event" title="Event cover image" onClose={() => setPicker(false)} onSelect={(a) => { setForm((p) => (p ? { ...p, cover: a, cover_asset_id: a.id, cover_alt: p.cover_alt || a.alt_text || '' } : p)); setPicker(false); }} />}
      {q.loading && <Loading />}
      {q.error && <ErrorNotice message={q.error} onRetry={q.reload} />}
      {q.data && q.data.events.length === 0 && <EmptyState title="No events yet">Add the first event with the button above.</EmptyState>}
      {q.data && q.data.events.length > 0 && (
        <div className="card overflow-x-auto p-0">
          <table className="tbl">
            <caption className="sr-only">Events</caption>
            <thead><tr><th scope="col">Event</th><th scope="col">When</th><th scope="col">Status</th><th scope="col">Actions</th></tr></thead>
            <tbody>
              {q.data.events.map((e) => {
                const s = state(e);
                return (
                  <tr key={e.id}>
                    <td className="font-medium">{e.title}<p className="text-xs font-normal text-muted">{e.location}</p></td>
                    <td className="whitespace-nowrap">{formatDateTime(e.starts_at)}</td>
                    <td><StatusBadge label={s.label} tone={s.tone} /></td>
                    <td><div className="flex gap-2"><button type="button" className="btn btn-outline btn-sm" onClick={() => edit(e)}>Edit</button><button type="button" className="btn btn-outline btn-sm" onClick={() => remove(e)}>Delete</button></div></td>
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
