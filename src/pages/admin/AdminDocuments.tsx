import { useRef, useState, type FormEvent } from 'react';
import { supabase } from '../../lib/supabase';
import { useQuery } from '../../lib/useQuery';
import { deleteAsset, formatBytes, uploadDocument } from '../../lib/media';
import { check, errMsg, formatDateTime, fromLocalInput, toLocalInput, unwrap } from '../../lib/util';
import type { DocumentRow, MediaAsset } from '../../lib/types';
import { ConfirmDialog, EmptyState, ErrorNotice, Loading, PageHeader, StatusBadge, type Pending } from '../../components/ui';

const CATS: DocumentRow['category'][] = ['Forms', 'Guides', 'Downloads', 'Policies'];
interface Form { id?: string; title: string; description: string; category: DocumentRow['category']; display_order: string; is_published: boolean; publish_at: string; asset_id: string }
const EMPTY: Form = { title: '', description: '', category: 'Forms', display_order: '0', is_published: false, publish_at: '', asset_id: '' };

export default function AdminDocuments() {
  const q = useQuery(async () => {
    const docs = unwrap<DocumentRow[]>(await supabase.from('documents').select('*').order('category').order('display_order').order('title'));
    const ids = [...new Set(docs.map((d) => d.asset_id))];
    const assets = ids.length ? unwrap<MediaAsset[]>(await supabase.from('media_assets').select('*').in('id', ids)) : [];
    return { docs, assets };
  }, []);
  const [form, setForm] = useState<Form | null>(null);
  const [oldAsset, setOldAsset] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const asset = (id: string) => q.data?.assets.find((a) => a.id === id);

  async function pick(files: FileList | null) {
    const f = files?.[0];
    if (!f || !form) return;
    setError(null); setBusy(true);
    try {
      const a = await uploadDocument(f, {}, setProgress);
      if (form.asset_id && !oldAsset) setOldAsset(form.asset_id);
      setForm((p) => (p ? { ...p, asset_id: a.id, title: p.title || f.name.replace(/\.[^.]+$/, '') } : p));
      setProgress(`Uploaded ${f.name}.`);
    } catch (e) { setError(errMsg(e)); setProgress(null); } finally { setBusy(false); if (file.current) file.current.value = ''; }
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    if (!form.title.trim()) { setError('Enter a title.'); return; }
    if (!form.asset_id) { setError('Upload the document file first.'); return; }
    setBusy(true); setError(null);
    const payload = {
      title: form.title.trim(), description: form.description.trim() || null, category: form.category, asset_id: form.asset_id,
      display_order: parseInt(form.display_order, 10) || 0, is_published: form.is_published, publish_at: fromLocalInput(form.publish_at),
    };
    try {
      check(form.id ? await supabase.from('documents').update(payload).eq('id', form.id) : await supabase.from('documents').insert(payload));
      let msg = 'Document saved.';
      if (oldAsset && oldAsset !== form.asset_id) {
        try { const a = asset(oldAsset); if (a) { await deleteAsset(a); msg += ' The previous file was removed.'; } } catch { msg += ' The previous file is still stored (it may be used elsewhere).'; }
      }
      setNote(msg); setForm(null); setOldAsset(null); setProgress(null); q.reload();
    } catch (err) { setError(errMsg(err)); } finally { setBusy(false); }
  }

  function remove(d: DocumentRow) {
    setPending({
      title: `Delete “${d.title}”?`, message: 'The listing is removed and the stored file is deleted if nothing else uses it.', confirmLabel: 'Delete', danger: true,
      run: async () => {
        check(await supabase.from('documents').delete().eq('id', d.id));
        const a = asset(d.asset_id);
        if (a) { try { await deleteAsset(a); } catch { /* still referenced elsewhere */ } }
      },
    });
  }

  function statusOf(d: DocumentRow) {
    if (!d.is_published) return <StatusBadge label="Hidden" tone="neutral" />;
    if (d.publish_at && new Date(d.publish_at) > new Date()) return <StatusBadge label={`Scheduled ${formatDateTime(d.publish_at)}`} tone="info" />;
    return <StatusBadge label="Published" tone="success" />;
  }

  return (
    <>
      <PageHeader title="Forms & Document Center" intro="Upload PDF or Office documents and publish them on the Forms & Downloads page. Macro-enabled files are not accepted."
        actions={!form && <button type="button" className="btn btn-primary" onClick={() => { setForm(EMPTY); setError(null); setNote(null); }}>Add document</button>} />
      {note && <div role="status" className="alert alert-success mb-4">{note}</div>}
      {form && (
        <form onSubmit={save} noValidate className="card mb-6 space-y-4">
          <h2 className="text-lg font-bold">{form.id ? 'Edit document' : 'New document'}</h2>
          {error && <div role="alert" className="alert alert-error">{error}</div>}
          <div>
            <label className="label" htmlFor="dc-file">File</label>
            <input ref={file} id="dc-file" type="file" className="input" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx" disabled={busy} onChange={(e) => void pick(e.target.files)} />
            <p className="hint" aria-live="polite">{progress ?? (form.asset_id ? `Current file: ${asset(form.asset_id)?.original_filename ?? 'newly uploaded file'}. Choosing another file replaces it.` : 'PDF, DOC, DOCX, XLS, XLSX, PPT or PPTX.')}</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label className="label" htmlFor="dc-title">Title</label><input id="dc-title" className="input" maxLength={200} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
            <div><label className="label" htmlFor="dc-cat">Category</label>
              <select id="dc-cat" className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as DocumentRow['category'] })}>{CATS.map((c) => <option key={c}>{c}</option>)}</select></div>
            <div className="sm:col-span-2"><label className="label" htmlFor="dc-desc">Description (optional)</label><textarea id="dc-desc" rows={2} className="input" maxLength={1000} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div><label className="label" htmlFor="dc-order">Display order</label><input id="dc-order" type="number" className="input" value={form.display_order} onChange={(e) => setForm({ ...form, display_order: e.target.value })} /></div>
            <div><label className="label" htmlFor="dc-at">Publish at (optional)</label><input id="dc-at" type="datetime-local" className="input" value={form.publish_at} onChange={(e) => setForm({ ...form, publish_at: e.target.value })} />
              <p className="hint">Leave empty to publish immediately when “Published” is on.</p></div>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.is_published} onChange={(e) => setForm({ ...form, is_published: e.target.checked })} /> Published on the public site</label>
          <div className="flex gap-3">
            <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Working…' : 'Save document'}</button>
            <button type="button" className="btn btn-outline" disabled={busy} onClick={() => { setForm(null); setOldAsset(null); setProgress(null); }}>Cancel</button>
          </div>
        </form>
      )}
      {q.loading && <Loading />}
      {q.error && <ErrorNotice message={q.error} onRetry={q.reload} />}
      {q.data && q.data.docs.length === 0 && <EmptyState title="No documents yet">Add the first document with the button above.</EmptyState>}
      {q.data && q.data.docs.length > 0 && (
        <div className="card overflow-x-auto p-0">
          <table className="tbl">
            <caption className="sr-only">Documents</caption>
            <thead><tr><th scope="col">Title</th><th scope="col">Category</th><th scope="col">File</th><th scope="col">Status</th><th scope="col">Actions</th></tr></thead>
            <tbody>
              {q.data.docs.map((d) => {
                const a = asset(d.asset_id);
                return (
                  <tr key={d.id}>
                    <td className="font-medium">{d.title}</td>
                    <td>{d.category}</td>
                    <td className="text-xs">{a ? `${a.original_filename} · ${formatBytes(a.size_bytes)}` : '—'}</td>
                    <td>{statusOf(d)}</td>
                    <td><div className="flex gap-2">
                      <button type="button" className="btn btn-outline btn-sm" onClick={() => { setError(null); setNote(null); setOldAsset(null); setForm({ id: d.id, title: d.title, description: d.description ?? '', category: d.category, display_order: String(d.display_order), is_published: d.is_published, publish_at: toLocalInput(d.publish_at), asset_id: d.asset_id }); }}>Edit</button>
                      <button type="button" className="btn btn-outline btn-sm" onClick={() => remove(d)}>Delete</button>
                    </div></td>
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
