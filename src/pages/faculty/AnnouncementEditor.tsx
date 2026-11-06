import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useQuery } from '../../lib/useQuery';
import { announcementStatusInfo, errMsg, fromLocalInput, isEditable, isUuid, moveItem, toLocalInput, unwrap } from '../../lib/util';
import { usePageTitle } from '../../lib/usePageTitle';
import { CATEGORIES } from '../../config/site';
import type { AnnouncementImage, AnnouncementOverview, MediaAsset, Review } from '../../lib/types';
import MediaPicker, { Thumb } from '../../components/media/MediaPicker';
import { ConfirmDialog, ErrorNotice, Loading, PageHeader, StatusBadge, type Pending } from '../../components/ui';

/** Shared by the Faculty/Staff dashboard and the Admin dashboard. Saving never publishes: that needs admin approval. */
interface Img { asset: MediaAsset; role: 'cover' | 'inline'; caption: string; alt: string }
const MAX_INLINE = 12;

export default function AnnouncementEditor({ base }: { base: '/dashboard' | '/admin' }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const prefill = ((useLocation().state ?? {}) as { prefill?: { title?: string; body?: string; category?: string; office?: string } }).prefill;
  usePageTitle(id ? 'Edit announcement' : 'Create announcement');
  const [form, setForm] = useState({ title: prefill?.title ?? '', category: prefill?.category ?? '', office: prefill?.office ?? '', body: prefill?.body ?? '', publishAt: '', expiresAt: '' });
  const [cover, setCover] = useState<Img | null>(null);
  const [inline, setInline] = useState<Img[]>([]);
  const [picker, setPicker] = useState<null | 'cover' | 'inline'>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const [loaded, setLoaded] = useState(!id);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);

  const existing = useQuery(async () => {
    if (!id || !isUuid(id)) return null;
    const row = unwrap<AnnouncementOverview | null>(await supabase.from('announcement_overview').select('*').eq('id', id).maybeSingle());
    let review: Review | null = null;
    if (row && (row.latest_status === 'rejected' || row.latest_status === 'revision_required')) {
      const r = unwrap<Review[]>(await supabase.from('announcement_reviews').select('revision_id,decision,reason,created_at').eq('revision_id', row.latest_revision_id).order('created_at', { ascending: false }).limit(1));
      review = r[0] ?? null;
    }
    let images: AnnouncementImage[] = [];
    if (row) {
      images = unwrap<AnnouncementImage[]>(await supabase.from('announcement_images').select('*, media:media_assets(*)').eq('revision_id', row.latest_revision_id).order('position'));
    }
    return { row, review, images };
  }, [id]);

  const row = existing.data?.row ?? null;
  useEffect(() => {
    if (row && !loaded) {
      setForm({ title: row.title, category: row.category ?? '', office: row.issuing_office, body: row.body, publishAt: toLocalInput(row.publish_at), expiresAt: toLocalInput(row.expires_at) });
      const imgs = existing.data?.images ?? [];
      const toImg = (i: AnnouncementImage): Img | null => (i.media ? { asset: i.media, role: i.role, caption: i.caption ?? '', alt: i.alt_text } : null);
      const c = imgs.find((i) => i.role === 'cover');
      setCover(c ? toImg(c) : null);
      setInline(imgs.filter((i) => i.role === 'inline').map(toImg).filter((x): x is Img => x !== null));
      setLoaded(true);
    }
  }, [row, loaded, existing.data]);

  const afterSubmit = base === '/admin' ? '/admin/review' : '/dashboard/announcements';
  const locked = !!row && !isEditable(row);
  const isRevisionOfPublished = !!row && row.status === 'published';
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((p) => ({ ...p, [k]: e.target.value }));

  function validate(submit: boolean): string | null {
    if (form.title.trim().length < 3) return 'Enter a title of at least 3 characters.';
    if (submit && form.body.trim().length < 10) return 'Write the announcement content before submitting.';
    if (submit && !form.office.trim()) return 'Enter the issuing office or approved author name.';
    const pub = fromLocalInput(form.publishAt);
    const exp = fromLocalInput(form.expiresAt);
    if (pub && exp && new Date(exp) <= new Date(pub)) return 'The expiry date must be after the publication date.';
    if (submit && exp && new Date(exp) <= new Date()) return 'The expiry date has already passed.';
    if (submit && [cover, ...inline].some((i) => i && !i.alt.trim())) return 'Describe every image (alt text) before submitting, so screen-reader users can understand it.';
    return null;
  }

  async function persist(submit: boolean): Promise<string> {
    return unwrap<string>(
      await supabase.rpc('save_announcement', {
        p_id: id ?? null, p_title: form.title, p_body: form.body, p_category: form.category || null, p_office: form.office, p_submit: submit,
        p_publish_at: fromLocalInput(form.publishAt), p_expires_at: fromLocalInput(form.expiresAt),
        p_images: [
          ...(cover ? [{ asset_id: cover.asset.id, role: 'cover', position: 0, caption: cover.caption, alt_text: cover.alt }] : []),
          ...inline.map((i, k) => ({ asset_id: i.asset.id, role: 'inline', position: k + 1, caption: i.caption, alt_text: i.alt })),
        ],
      }),
    );
  }

  async function saveDraft() {
    const v = validate(false);
    if (v) { setError(v); return; }
    setBusy(true); setError(null); setNotice(null);
    try {
      const newId = await persist(false);
      setNotice('Draft saved.');
      if (!id) navigate(`${base}/announcements/${newId}/edit`, { replace: true });
      else existing.reload();
    } catch (e) { setError(errMsg(e)); } finally { setBusy(false); }
  }

  function askSubmit() {
    const v = validate(true);
    if (v) { setError(v); return; }
    setError(null);
    setPending({
      title: isRevisionOfPublished ? 'Submit revision for approval?' : 'Submit for administrator review?',
      message: isRevisionOfPublished
        ? 'The currently published version stays public until an administrator approves your changes.'
        : 'You will not be able to edit it while it is under review. It is not public until approved.',
      confirmLabel: 'Submit for review',
      run: async () => {
        await persist(true);
        navigate(afterSubmit, { state: { notice: 'Submitted for administrator review.' } });
      },
    });
  }

  function pick(a: MediaAsset) {
    const img: Img = { asset: a, role: picker === 'cover' ? 'cover' : 'inline', caption: a.caption ?? '', alt: a.alt_text ?? '' };
    if (picker === 'cover') setCover(img);
    else setInline((l) => (l.length >= MAX_INLINE ? l : [...l, img]));
    setPicker(null);
  }
  const patchInline = (k: number, p: Partial<Img>) => setInline((l) => l.map((x, i) => (i === k ? { ...x, ...p } : x)));
  function insertToken(n: number) {
    const el = bodyRef.current;
    const token = `\n{{image:${n}}}\n`;
    const pos = el ? el.selectionStart : form.body.length;
    setForm((p) => ({ ...p, body: p.body.slice(0, pos) + token + p.body.slice(pos) }));
  }

  if (id && !isUuid(id)) return <ErrorNotice message="This announcement does not exist." />;
  if (id && existing.loading) return <Loading />;
  if (existing.error) return <ErrorNotice message={existing.error} onRetry={existing.reload} />;
  if (id && !row) return <ErrorNotice message="Announcement not found, or you do not have access to it." />;

  const status = row ? announcementStatusInfo(row) : null;

  return (
    <>
      <PageHeader
        title={id ? 'Edit announcement' : 'Create announcement'}
        intro="Plain text with optional images. Line breaks are kept. An administrator must approve it before it appears publicly."
        actions={status && <StatusBadge {...status} />}
      />
      {existing.data?.review && (
        <div className="alert alert-warning mb-4">
          <p className="font-semibold">{existing.data.review.decision === 'rejected' ? 'Rejected' : 'Revision requested'} by an administrator</p>
          <p className="prose-plain mt-1">{existing.data.review.reason}</p>
        </div>
      )}
      {isRevisionOfPublished && <div className="alert alert-info mb-4">This announcement is live. Your edits become a new revision; the public keeps seeing the approved version until an administrator approves the change.</div>}
      {locked && <div className="alert alert-warning mb-4">This announcement can not be edited right now ({row!.latest_status === 'pending' ? 'it is awaiting review' : 'it is unpublished or archived'}).</div>}
      {error && <div role="alert" className="alert alert-error mb-4">{error}</div>}
      {notice && <div role="status" className="alert alert-success mb-4">{notice}</div>}

      <form className="card space-y-4" onSubmit={(e) => e.preventDefault()} noValidate>
        <div>
          <label className="label" htmlFor="a-title">Title</label>
          <input id="a-title" className="input" maxLength={200} value={form.title} onChange={set('title')} disabled={locked} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="a-cat">Category (optional)</label>
            <select id="a-cat" className="input" value={form.category} onChange={set('category')} disabled={locked}>
              <option value="">No category</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="a-office">Issuing office or author</label>
            <input id="a-office" className="input" maxLength={150} value={form.office} onChange={set('office')} disabled={locked} />
            <p className="hint">Shown publicly as the source of this announcement.</p>
          </div>
        </div>
        <div>
          <label className="label" htmlFor="a-body">Content</label>
          <textarea id="a-body" ref={bodyRef} rows={12} className="input" maxLength={10000} value={form.body} onChange={set('body')} disabled={locked} />
          <p className="hint">{form.body.length} / 10,000 characters. Use the “Insert in text” button next to an inline image to place it inside the text.</p>
        </div>

        <fieldset className="space-y-3 rounded border border-line p-4" disabled={locked}>
          <legend className="px-1 text-sm font-semibold">Cover image</legend>
          {cover ? (
            <div className="flex flex-wrap items-start gap-3">
              <span className="block h-24 w-32 shrink-0 overflow-hidden rounded bg-surface"><Thumb asset={cover.asset} /></span>
              <div className="min-w-[14rem] flex-1 space-y-2">
                <div><label className="label" htmlFor="cv-alt">Image description (alt text) — required</label><input id="cv-alt" className="input" maxLength={300} value={cover.alt} onChange={(e) => setCover({ ...cover, alt: e.target.value })} /></div>
                <div><label className="label" htmlFor="cv-cap">Caption (optional)</label><input id="cv-cap" className="input" maxLength={300} value={cover.caption} onChange={(e) => setCover({ ...cover, caption: e.target.value })} /></div>
                <div className="flex gap-2">
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => setPicker('cover')}>Replace</button>
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => setCover(null)}>Remove</button>
                </div>
              </div>
            </div>
          ) : <button type="button" className="btn btn-outline btn-sm" onClick={() => setPicker('cover')}>Add cover image</button>}
        </fieldset>

        <fieldset className="space-y-3 rounded border border-line p-4" disabled={locked}>
          <legend className="px-1 text-sm font-semibold">Inline images ({inline.length} of {MAX_INLINE})</legend>
          <ul className="space-y-3">
            {inline.map((img, k) => (
              <li key={img.asset.id} draggable onDragStart={() => setDragFrom(k)} onDragOver={(e) => e.preventDefault()}
                onDrop={() => { if (dragFrom !== null) setInline((l) => moveItem(l, dragFrom, k)); setDragFrom(null); }}
                className="flex flex-wrap items-start gap-3 rounded border border-line bg-white p-3">
                <span className="mt-1 cursor-grab text-muted" aria-hidden="true">⠿</span>
                <span className="block h-20 w-28 shrink-0 overflow-hidden rounded bg-surface"><Thumb asset={img.asset} /></span>
                <div className="min-w-[14rem] flex-1 space-y-2">
                  <p className="text-xs font-semibold">Image {k + 1} — token {`{{image:${k + 1}}}`}</p>
                  <div><label className="label" htmlFor={`in-alt-${k}`}>Description (alt text) — required</label><input id={`in-alt-${k}`} className="input" maxLength={300} value={img.alt} onChange={(e) => patchInline(k, { alt: e.target.value })} /></div>
                  <div><label className="label" htmlFor={`in-cap-${k}`}>Caption (optional)</label><input id={`in-cap-${k}`} className="input" maxLength={300} value={img.caption} onChange={(e) => patchInline(k, { caption: e.target.value })} /></div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="btn btn-outline btn-sm" disabled={k === 0} onClick={() => setInline((l) => moveItem(l, k, k - 1))} aria-label={`Move image ${k + 1} up`}>Up</button>
                    <button type="button" className="btn btn-outline btn-sm" disabled={k === inline.length - 1} onClick={() => setInline((l) => moveItem(l, k, k + 1))} aria-label={`Move image ${k + 1} down`}>Down</button>
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => insertToken(k + 1)}>Insert in text</button>
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => setInline((l) => l.filter((_, i) => i !== k))}>Remove</button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <button type="button" className="btn btn-outline btn-sm" disabled={inline.length >= MAX_INLINE} onClick={() => setPicker('inline')}>Add inline image</button>
          <p className="hint">Drag images to reorder, or use Up/Down. Images not placed with a token appear after the text.</p>
        </fieldset>

        <fieldset className="grid gap-4 rounded border border-line p-4 sm:grid-cols-2" disabled={locked}>
          <legend className="px-1 text-sm font-semibold">Schedule (optional)</legend>
          <div>
            <label className="label" htmlFor="a-pub">Publish at</label>
            <input id="a-pub" type="datetime-local" className="input" value={form.publishAt} onChange={set('publishAt')} />
            <p className="hint">After approval it appears at this time. Leave blank to publish on approval.</p>
          </div>
          <div>
            <label className="label" htmlFor="a-exp">Expires at</label>
            <input id="a-exp" type="datetime-local" className="input" value={form.expiresAt} onChange={set('expiresAt')} />
            <p className="hint">It is hidden automatically after this time.</p>
          </div>
        </fieldset>
        <div className="flex flex-wrap gap-3">
          <button type="button" className="btn btn-outline" onClick={saveDraft} disabled={busy || locked}>Save draft</button>
          <button type="button" className="btn btn-primary" onClick={askSubmit} disabled={busy || locked}>
            {isRevisionOfPublished ? 'Submit revision for approval' : 'Submit for review'}
          </button>
          <Link to={base === '/admin' ? '/admin/announcements' : '/dashboard/announcements'} className="btn btn-outline">Back to list</Link>
        </div>
      </form>
      {picker && <MediaPicker purpose="announcement" title={picker === 'cover' ? 'Choose a cover image' : 'Choose an inline image'} onSelect={pick} onClose={() => setPicker(null)} />}
      <ConfirmDialog pending={pending} onClose={() => setPending(null)} onDone={() => {}} />
    </>
  );
}
