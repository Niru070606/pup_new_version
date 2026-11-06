import { useRef, useState, type DragEvent } from 'react';
import { uploadImage } from '../../lib/media';
import { errMsg } from '../../lib/util';
import type { MediaAsset, MediaPurpose } from '../../lib/types';

interface Props {
  purpose: MediaPurpose;
  onUploaded: (asset: MediaAsset) => void;
  folder?: string;
  /** Ask for a description (alt text) at upload time. Recommended wherever the image will be shown. */
  askAlt?: boolean;
  multiple?: boolean;
  label?: string;
}

/** Drag-and-drop or click to upload. Shows what is happening and why a file was refused. */
export default function ImageUploader({ purpose, onUploaded, folder = '', askAlt = true, multiple = false, label = 'Drag an image here, or choose a file' }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [alt, setAlt] = useState('');
  const [caption, setCaption] = useState('');

  async function handle(files: FileList | File[]) {
    const list = Array.from(files);
    if (!list.length) return;
    setError(null); setDone(null);
    let ok = 0;
    for (let n = 0; n < list.length; n++) {
      const f = list[n];
      try {
        setBusy(`${list.length > 1 ? `File ${n + 1} of ${list.length}: ` : ''}Starting…`);
        const a = await uploadImage(f, { purpose, folder, alt: list.length === 1 ? alt : '', caption: list.length === 1 ? caption : '' },
          (s) => setBusy(`${list.length > 1 ? `File ${n + 1} of ${list.length}: ` : ''}${s}`));
        ok++;
        onUploaded(a);
      } catch (e) {
        setError(`${f.name}: ${errMsg(e)}`);
        break;
      }
    }
    setBusy(null);
    if (ok) { setDone(ok === 1 ? 'Image uploaded.' : `${ok} images uploaded.`); setAlt(''); setCaption(''); }
    if (input.current) input.current.value = '';
  }

  function onDrop(e: DragEvent) {
    e.preventDefault(); setOver(false);
    if (!busy) void handle(multiple ? e.dataTransfer.files : [e.dataTransfer.files[0]].filter(Boolean));
  }

  return (
    <div>
      {askAlt && !multiple && (
        <div className="mb-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor={`up-alt-${purpose}`}>Image description (alt text)</label>
            <input id={`up-alt-${purpose}`} className="input" maxLength={300} value={alt} onChange={(e) => setAlt(e.target.value)} placeholder="Describe what the image shows" />
            <p className="hint">Read aloud by screen readers. Required before anything using it can be submitted.</p>
          </div>
          <div>
            <label className="label" htmlFor={`up-cap-${purpose}`}>Caption (optional)</label>
            <input id={`up-cap-${purpose}`} className="input" maxLength={500} value={caption} onChange={(e) => setCaption(e.target.value)} />
          </div>
        </div>
      )}
      <div
        className={`dropzone ${over ? 'dropzone-active' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
      >
        <p>{label}</p>
        <p className="hint">JPG, PNG or WebP. Optimized automatically; location data is removed.</p>
        <button type="button" className="btn btn-outline mt-3" disabled={!!busy} onClick={() => input.current?.click()}>{busy ? 'Please wait…' : 'Choose file'}</button>
        <input ref={input} type="file" className="sr-only" tabIndex={-1} aria-label="Choose an image file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
          multiple={multiple} onChange={(e) => e.target.files && void handle(e.target.files)} />
      </div>
      <div aria-live="polite" className="mt-2 min-h-[1.25rem] text-sm">
        {busy && <p className="text-muted">{busy}</p>}
        {done && !busy && <p className="text-[#1F6030]">{done}</p>}
      </div>
      {error && <p role="alert" className="field-error">{error}</p>}
    </div>
  );
}
