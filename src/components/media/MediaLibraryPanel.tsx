import { useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useQuery } from '../../lib/useQuery';
import { deleteAsset, formatBytes, updateAssetMeta, useSignedUrls } from '../../lib/media';
import { errMsg, formatDateTime, unwrap } from '../../lib/util';
import type { MediaAsset, MediaPurpose, MediaUsageInfo } from '../../lib/types';
import { ConfirmDialog, EmptyState, ErrorNotice, Loading, StatusBadge, type Pending } from '../ui';
import ImageUploader from './ImageUploader';
import { Thumb } from './MediaPicker';

const PURPOSE_LABEL: Record<MediaPurpose, string> = { design: 'Design', announcement: 'Announcements', personnel: 'Faculty/staff photos', document: 'Documents', event: 'Events' };

/** Full media-library management: browse, search, describe, organize into folders/tags, see where a file is used, delete safely. */
export default function MediaLibraryPanel({ purposes, canUpload }: { purposes: MediaPurpose[]; canUpload: MediaPurpose[] }) {
  const [purpose, setPurpose] = useState<MediaPurpose | 'all'>(purposes.length === 1 ? purposes[0] : 'all');
  const [term, setTerm] = useState('');
  const [sel, setSel] = useState<MediaAsset | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const q = useQuery(async () => unwrap<MediaAsset[]>(await supabase.from('media_assets').select('*').eq('status', 'ready').in('purpose', purposes).order('created_at', { ascending: false }).limit(500)), [purposes.join(',')]);
  const usage = useQuery(async () => unwrap<MediaUsageInfo>(await supabase.rpc('media_storage_usage')), []);

  const rows = useMemo(() => (q.data ?? []).filter((a) => {
    if (purpose !== 'all' && a.purpose !== purpose) return false;
    const t = term.trim().toLowerCase();
    return !t || a.original_filename.toLowerCase().includes(t) || (a.alt_text ?? '').toLowerCase().includes(t) || a.folder.toLowerCase().includes(t) || a.tags.some((x) => x.toLowerCase().includes(t));
  }), [q.data, purpose, term]);

  const pct = usage.data ? Math.min(100, Math.round((usage.data.used_total / usage.data.settings.quota_total_bytes) * 100)) : 0;

  function askDelete(a: MediaAsset) {
    setPending({
      title: 'Delete this file?', message: `"${a.original_filename}" will be removed permanently. Files that are in use anywhere cannot be deleted.`, confirmLabel: 'Delete', danger: true,
      run: async () => { await deleteAsset(a); setSel(null); },
    });
  }

  return (
    <div>
      {usage.data && (
        <div className="card mb-4">
          <p className="text-sm font-medium">Storage used: {formatBytes(usage.data.used_total)} of {formatBytes(usage.data.settings.quota_total_bytes)} ({pct}%) · Your uploads: {formatBytes(usage.data.used_mine)}</p>
          <div className="mt-2 h-2 w-full overflow-hidden rounded bg-surface" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Storage used">
            <div className={`h-full ${pct > 85 ? 'bg-[#C22B2B]' : 'bg-maroon'}`} style={{ width: `${pct}%` }} />
          </div>
          <p className="hint">Images up to {formatBytes(usage.data.settings.max_image_bytes)}. Each upload is optimized to WebP in three sizes.</p>
        </div>
      )}
      {canUpload.length > 0 && (
        <details className="card mb-4">
          <summary className="cursor-pointer font-semibold">Upload images</summary>
          <div className="mt-3 space-y-3">
            {canUpload.length > 1 && (
              <div>
                <label className="label" htmlFor="ml-purpose">Use these images for</label>
                <select id="ml-purpose" className="input max-w-xs" value={purpose === 'all' ? canUpload[0] : (canUpload.includes(purpose) ? purpose : canUpload[0])} onChange={(e) => setPurpose(e.target.value as MediaPurpose)}>
                  {canUpload.map((p) => <option key={p} value={p}>{PURPOSE_LABEL[p]}</option>)}
                </select>
              </div>
            )}
            <ImageUploader purpose={purpose === 'all' || !canUpload.includes(purpose) ? canUpload[0] : purpose} onUploaded={() => { q.reload(); usage.reload(); }} multiple askAlt={false} label="Drag images here (several at once are fine)" />
            <p className="hint">Add descriptions after uploading: select an image below.</p>
          </div>
        </details>
      )}
      <div className="mb-3 flex flex-wrap gap-3">
        <div className="min-w-[12rem] flex-1">
          <label className="label" htmlFor="ml-q">Search library</label>
          <input id="ml-q" className="input" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Name, description, folder or tag" />
        </div>
        {purposes.length > 1 && (
          <div>
            <label className="label" htmlFor="ml-f">Type</label>
            <select id="ml-f" className="input" value={purpose} onChange={(e) => setPurpose(e.target.value as MediaPurpose | 'all')}>
              <option value="all">All</option>
              {purposes.map((p) => <option key={p} value={p}>{PURPOSE_LABEL[p]}</option>)}
            </select>
          </div>
        )}
      </div>
      {q.loading && <Loading />}
      {q.error && <ErrorNotice message={q.error} onRetry={q.reload} />}
      {q.data && rows.length === 0 && <EmptyState title="The library is empty">Uploaded files appear here and can be reused.</EmptyState>}
      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 lg:self-start">
          {rows.map((a) => (
            <li key={a.id}>
              <button type="button" onClick={() => setSel(a)} aria-pressed={sel?.id === a.id}
                className={`block w-full overflow-hidden rounded border text-left ${sel?.id === a.id ? 'border-maroon ring-2 ring-maroon' : 'border-line hover:border-maroon'}`}>
                <span className="block aspect-[4/3] bg-surface">{a.kind === 'image' ? <Thumb asset={a} /> : <span className="flex h-full items-center justify-center text-xs">{a.original_filename.split('.').pop()?.toUpperCase()}</span>}</span>
                <span className="flex items-center justify-between gap-1 px-2 py-1 text-xs">
                  <span className="truncate">{a.original_filename}</span>
                  {a.is_public && <StatusBadge label="Live" tone="success" />}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {sel && <AssetDetails key={sel.id} asset={sel} onSaved={(a) => { setSel(a); q.reload(); }} onDelete={() => askDelete(sel)} />}
      </div>
      <ConfirmDialog pending={pending} onClose={() => setPending(null)} onDone={() => { q.reload(); usage.reload(); }} />
    </div>
  );
}

function AssetDetails({ asset, onSaved, onDelete }: { asset: MediaAsset; onSaved: (a: MediaAsset) => void; onDelete: () => void }) {
  const [alt, setAlt] = useState(asset.alt_text ?? '');
  const [caption, setCaption] = useState(asset.caption ?? '');
  const [folder, setFolder] = useState(asset.folder);
  const [tags, setTags] = useState(asset.tags.join(', '));
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const use = useQuery(async () => unwrap<string[]>(await supabase.rpc('media_usage', { p_id: asset.id })), [asset.id]);
  const urls = useSignedUrls([asset.path_medium]);
  const big = asset.path_medium ? urls[asset.path_medium] : undefined;

  async function save() {
    setBusy(true); setMsg(null);
    const t = tags.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 10);
    try {
      await updateAssetMeta(asset.id, { alt, caption, folder, tags: t });
      setMsg({ ok: true, text: 'Saved.' });
      onSaved({ ...asset, alt_text: alt, caption, folder, tags: t });
    } catch (e) { setMsg({ ok: false, text: errMsg(e) }); } finally { setBusy(false); }
  }

  return (
    <aside aria-label="Selected file" className="card space-y-3 lg:self-start">
      {big && <img src={big} alt={asset.alt_text || ''} className="max-h-48 w-full rounded object-contain" />}
      <p className="break-words text-sm font-semibold">{asset.original_filename}</p>
      <p className="text-xs text-muted">{asset.width && `${asset.width}×${asset.height} · `}{formatBytes(asset.size_bytes)} · {formatDateTime(asset.created_at)}</p>
      <p className="text-xs">{use.loading ? 'Checking use…' : use.data && use.data.length ? `Used in: ${use.data.join(', ')}` : 'Not used anywhere.'}</p>
      <div><label className="label" htmlFor="ad-alt">Description (alt text)</label><input id="ad-alt" className="input" maxLength={300} value={alt} onChange={(e) => setAlt(e.target.value)} /></div>
      <div><label className="label" htmlFor="ad-cap">Caption</label><input id="ad-cap" className="input" maxLength={500} value={caption} onChange={(e) => setCaption(e.target.value)} /></div>
      <div><label className="label" htmlFor="ad-folder">Folder</label><input id="ad-folder" className="input" maxLength={60} value={folder} onChange={(e) => setFolder(e.target.value)} placeholder="e.g. Banners" /></div>
      <div><label className="label" htmlFor="ad-tags">Tags (comma separated)</label><input id="ad-tags" className="input" value={tags} onChange={(e) => setTags(e.target.value)} /></div>
      {msg && <p role={msg.ok ? 'status' : 'alert'} className={msg.ok ? 'text-sm text-[#1F6030]' : 'field-error'}>{msg.text}</p>}
      <div className="flex gap-2">
        <button type="button" className="btn btn-primary btn-sm" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save details'}</button>
        <button type="button" className="btn btn-outline btn-sm" onClick={onDelete} disabled={Boolean(use.data?.length)} title={use.data?.length ? 'In use: replace it there first' : undefined}>Delete</button>
      </div>
    </aside>
  );
}
