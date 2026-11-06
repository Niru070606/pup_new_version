import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useQuery } from '../../lib/useQuery';
import { useSignedUrls } from '../../lib/media';
import { unwrap } from '../../lib/util';
import type { MediaAsset, MediaPurpose } from '../../lib/types';
import { EmptyState, ErrorNotice, Loading } from '../ui';
import ImageUploader from './ImageUploader';

interface Props {
  purpose: MediaPurpose;
  title?: string;
  onSelect: (asset: MediaAsset) => void;
  onClose: () => void;
  /** Only show images that are already described (alt text). */
  requireAlt?: boolean;
}

export function Thumb({ asset, className = '' }: { asset: MediaAsset; className?: string }) {
  const urls = useSignedUrls([asset.path_thumb]);
  const u = asset.path_thumb ? urls[asset.path_thumb] : undefined;
  return u
    ? <img src={u} alt={asset.alt_text || asset.original_filename} loading="lazy" decoding="async" className={`h-full w-full object-cover ${className}`} />
    : <span className="flex h-full w-full items-center justify-center text-xs text-muted">…</span>;
}

/** Modal image chooser: pick from the reusable library or upload a new image. */
export default function MediaPicker({ purpose, title = 'Choose an image', onSelect, onClose, requireAlt = false }: Props) {
  const [tab, setTab] = useState<'library' | 'upload'>('library');
  const [term, setTerm] = useState('');
  const [folder, setFolder] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const q = useQuery(async () => unwrap<MediaAsset[]>(
    await supabase.from('media_assets').select('*').eq('kind', 'image').eq('purpose', purpose).eq('status', 'ready').order('created_at', { ascending: false }).limit(200)), [purpose]);

  useEffect(() => {
    ref.current?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);

  const folders = useMemo(() => [...new Set((q.data ?? []).map((a) => a.folder).filter(Boolean))].sort(), [q.data]);
  const rows = (q.data ?? []).filter((a) => {
    if (requireAlt && !a.alt_text) return false;
    if (folder && a.folder !== folder) return false;
    const t = term.trim().toLowerCase();
    return !t || a.original_filename.toLowerCase().includes(t) || (a.alt_text ?? '').toLowerCase().includes(t) || a.tags.some((x) => x.toLowerCase().includes(t));
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="presentation">
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="mp-title" className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-md bg-white p-5 shadow-lg">
        <div className="flex items-start justify-between gap-3">
          <h2 id="mp-title" className="text-lg font-bold">{title}</h2>
          <button type="button" className="btn btn-outline btn-sm" onClick={onClose}>Close</button>
        </div>
        <div role="tablist" aria-label="Image source" className="mt-3 flex gap-2">
          <button type="button" role="tab" aria-selected={tab === 'library'} className={`btn btn-sm ${tab === 'library' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setTab('library')}>Media library</button>
          <button type="button" role="tab" aria-selected={tab === 'upload'} className={`btn btn-sm ${tab === 'upload' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setTab('upload')}>Upload new</button>
        </div>
        <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
          {tab === 'upload' && (
            <ImageUploader purpose={purpose} onUploaded={(a) => { q.reload(); onSelect(a); }} />
          )}
          {tab === 'library' && (
            <>
              <div className="mb-3 flex flex-wrap gap-3">
                <div className="min-w-[12rem] flex-1">
                  <label className="label" htmlFor="mp-search">Search</label>
                  <input id="mp-search" className="input" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="File name, description or tag" />
                </div>
                {folders.length > 0 && (
                  <div>
                    <label className="label" htmlFor="mp-folder">Folder</label>
                    <select id="mp-folder" className="input" value={folder} onChange={(e) => setFolder(e.target.value)}>
                      <option value="">All folders</option>
                      {folders.map((f) => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </div>
                )}
              </div>
              {q.loading && <Loading />}
              {q.error && <ErrorNotice message={q.error} onRetry={q.reload} />}
              {q.data && rows.length === 0 && <EmptyState title="No images found">Upload an image using the “Upload new” tab.</EmptyState>}
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {rows.map((a) => (
                  <li key={a.id}>
                    <button type="button" onClick={() => onSelect(a)} className="block w-full overflow-hidden rounded border border-line text-left hover:border-maroon focus-visible:border-maroon">
                      <span className="block aspect-[4/3] bg-surface"><Thumb asset={a} /></span>
                      <span className="block truncate px-2 py-1 text-xs">{a.alt_text || a.original_filename}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
