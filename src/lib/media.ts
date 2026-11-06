import { useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase';
import { check, unwrap } from './util';
import type { ImageRef, MediaAsset, MediaPurpose } from './types';

/**
 * Media pipeline (browser side). The database and Storage policies are the real gatekeepers:
 *   1. media_begin_upload()  - server checks role, type, size, quota and reserves an id
 *   2. files are uploaded to the PRIVATE bucket, only into that reserved folder
 *   3. media_finish_upload() - server re-measures the stored objects and activates the asset
 * Images are re-encoded to WebP in the browser (strips EXIF/GPS and any hidden payload) and three sizes are produced.
 */
export const BUCKET = 'site-media';

export const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'webp'] as const;
export const DOC_EXT = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'] as const;
export const DOC_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};
const IMAGE_MIME: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

export const fileExt = (name: string): string => (name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? '');

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}

export interface Limits { max_image_bytes: number; max_document_bytes: number }
let limitsCache: Limits | null = null;
export async function getLimits(): Promise<Limits> {
  if (limitsCache) return limitsCache;
  try {
    limitsCache = unwrap<Limits>(await supabase.rpc('media_limits'));
  } catch {
    limitsCache = { max_image_bytes: 5242880, max_document_bytes: 15728640 };
  }
  return limitsCache;
}

// ------------------------------------------------------------------ validation
async function sniffImage(file: File): Promise<'jpeg' | 'png' | 'webp' | null> {
  const b = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'webp';
  return null;
}
async function sniffDocument(file: File, ext: string): Promise<boolean> {
  const b = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  if (ext === 'pdf') return b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46; // %PDF
  if (ext === 'docx' || ext === 'xlsx' || ext === 'pptx') return b[0] === 0x50 && b[1] === 0x4b; // zip container
  return b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0; // legacy OLE2 (doc, xls, ppt)
}

export async function validateImageFile(file: File): Promise<string | null> {
  const ext = fileExt(file.name);
  if (!(IMAGE_EXT as readonly string[]).includes(ext)) return 'Only JPG, PNG or WebP images can be uploaded (SVG and other formats are not accepted).';
  if (file.type && !Object.values(IMAGE_MIME).includes(file.type)) return 'This file is not a JPG, PNG or WebP image.';
  const limits = await getLimits();
  if (file.size === 0) return 'The file is empty.';
  if (file.size > limits.max_image_bytes) return `The image is larger than the ${formatBytes(limits.max_image_bytes)} limit. Choose a smaller image.`;
  if (!(await sniffImage(file))) return 'This file does not look like a real JPG, PNG or WebP image.';
  return null;
}

export async function validateDocumentFile(file: File): Promise<string | null> {
  const ext = fileExt(file.name);
  if (!(DOC_EXT as readonly string[]).includes(ext)) return 'Only PDF and Microsoft Office documents (PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX) are accepted. Macro-enabled files are not allowed.';
  const limits = await getLimits();
  if (file.size === 0) return 'The file is empty.';
  if (file.size > limits.max_document_bytes) return `The document is larger than the ${formatBytes(limits.max_document_bytes)} limit.`;
  if (!(await sniffDocument(file, ext))) return 'The file content does not match its file type.';
  return null;
}

// ------------------------------------------------------------------ image processing
interface Processed { original: Blob; medium: Blob; thumb: Blob; width: number; height: number; widthMedium: number; widthThumb: number }

async function decode(file: File): Promise<{ w: number; h: number; draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void; close: () => void }> {
  if (typeof createImageBitmap === 'function') {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
    return { w: bmp.width, h: bmp.height, draw: (ctx, w, h) => ctx.drawImage(bmp, 0, 0, w, h), close: () => bmp.close() };
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('decode'));
      i.src = url;
    });
    return { w: img.naturalWidth, h: img.naturalHeight, draw: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h), close: () => URL.revokeObjectURL(url) };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}

function toWebp(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('encode'))), 'image/webp', quality));
}

export async function processImage(file: File): Promise<Processed> {
  const src = await decode(file);
  try {
    if (src.w < 16 || src.h < 16) throw new Error('This image is too small to use.');
    if (src.w > 12000 || src.h > 12000) throw new Error('This image has too many pixels. Resize it first.');
    const make = async (maxSide: number, quality: number) => {
      const scale = Math.min(1, maxSide / Math.max(src.w, src.h));
      const w = Math.max(1, Math.round(src.w * scale));
      const h = Math.max(1, Math.round(src.h * scale));
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const ctx = c.getContext('2d');
      if (!ctx) throw new Error('Your browser cannot process images.');
      src.draw(ctx, w, h);
      return { blob: await toWebp(c, quality), w, h };
    };
    const o = await make(2400, 0.84);
    const m = await make(1024, 0.8);
    const t = await make(320, 0.75);
    return { original: o.blob, medium: m.blob, thumb: t.blob, width: o.w, height: o.h, widthMedium: m.w, widthThumb: t.w };
  } catch (e) {
    throw new Error(e instanceof Error && e.message !== 'decode' && e.message !== 'encode' ? e.message : 'This image could not be read. Try saving it again as JPG or PNG.');
  } finally {
    src.close();
  }
}

// ------------------------------------------------------------------ upload / delete
export interface UploadMeta { purpose: MediaPurpose; alt?: string; caption?: string; folder?: string }

async function putObject(path: string, blob: Blob, contentType: string): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType, upsert: false, cacheControl: '31536000' });
  if (error) throw new Error('The upload was blocked or failed. Check your connection and permissions, then try again.');
}

async function abort(id: string, paths: string[]): Promise<void> {
  try {
    await supabase.rpc('media_request_delete', { p_id: id });
    await supabase.storage.from(BUCKET).remove(paths);
  } catch { /* best effort: reservations expire from the quota after an hour */ }
}

export async function uploadImage(file: File, meta: UploadMeta, onProgress?: (label: string) => void): Promise<MediaAsset> {
  const problem = await validateImageFile(file);
  if (problem) throw new Error(problem);
  onProgress?.('Optimizing image…');
  const p = await processImage(file);
  onProgress?.('Checking permissions…');
  const id = unwrap<string>(await supabase.rpc('media_begin_upload', {
    p_purpose: meta.purpose, p_kind: 'image', p_filename: file.name, p_mime: IMAGE_MIME[fileExt(file.name)] ?? file.type, p_bytes: file.size,
  }));
  const paths = [`${id}/original.webp`, `${id}/medium.webp`, `${id}/thumb.webp`];
  try {
    onProgress?.('Uploading (1 of 3)…');
    await putObject(paths[0], p.original, 'image/webp');
    onProgress?.('Uploading (2 of 3)…');
    await putObject(paths[1], p.medium, 'image/webp');
    onProgress?.('Uploading (3 of 3)…');
    await putObject(paths[2], p.thumb, 'image/webp');
    onProgress?.('Finishing…');
    return unwrap<MediaAsset>(await supabase.rpc('media_finish_upload', {
      p_id: id, p_width: p.width, p_height: p.height, p_width_medium: p.widthMedium, p_width_thumb: p.widthThumb,
      p_alt: meta.alt ?? '', p_caption: meta.caption ?? '', p_folder: meta.folder ?? '',
    }));
  } catch (e) {
    await abort(id, paths);
    throw e;
  }
}

export async function uploadDocument(file: File, meta: { caption?: string; folder?: string }, onProgress?: (label: string) => void): Promise<MediaAsset> {
  const problem = await validateDocumentFile(file);
  if (problem) throw new Error(problem);
  const ext = fileExt(file.name);
  const mime = DOC_MIME[ext];
  onProgress?.('Checking permissions…');
  const id = unwrap<string>(await supabase.rpc('media_begin_upload', { p_purpose: 'document', p_kind: 'document', p_filename: file.name, p_mime: mime, p_bytes: file.size }));
  const path = `${id}/original.${ext}`;
  try {
    onProgress?.('Uploading…');
    await putObject(path, file, mime);
    onProgress?.('Finishing…');
    return unwrap<MediaAsset>(await supabase.rpc('media_finish_upload', {
      p_id: id, p_width: null, p_height: null, p_width_medium: null, p_width_thumb: null, p_alt: '', p_caption: meta.caption ?? '', p_folder: meta.folder ?? '',
    }));
  } catch (e) {
    await abort(id, [path]);
    throw e;
  }
}

/** Safe deletion: the server refuses while the file is used anywhere, then the files are removed. */
export async function deleteAsset(asset: Pick<MediaAsset, 'id' | 'path_original' | 'path_medium' | 'path_thumb'>): Promise<void> {
  check(await supabase.rpc('media_request_delete', { p_id: asset.id }));
  const paths = [asset.path_original, asset.path_medium, asset.path_thumb].filter((p): p is string => Boolean(p));
  if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
}

export async function updateAssetMeta(id: string, v: { alt: string; caption: string; folder: string; tags: string[] }): Promise<void> {
  check(await supabase.rpc('media_update_meta', { p_id: id, p_alt: v.alt, p_caption: v.caption, p_folder: v.folder, p_tags: v.tags }));
}

export function assetToRef(a: Pick<MediaAsset, 'id' | 'path_original' | 'path_medium' | 'path_thumb' | 'width' | 'height' | 'width_medium' | 'width_thumb'>): ImageRef {
  return { id: a.id, path_original: a.path_original, path_medium: a.path_medium, path_thumb: a.path_thumb, width: a.width, height: a.height, width_medium: a.width_medium, width_thumb: a.width_thumb };
}

// ------------------------------------------------------------------ signed URLs (private bucket)
const TTL = 3600;
const cache = new Map<string, { url: string; exp: number }>();
const inflight = new Map<string, Promise<void>>();

function fresh(path: string): string | null {
  const c = cache.get(path);
  return c && c.exp > Date.now() + 60_000 ? c.url : null;
}

/** Signs any paths that are not cached yet, in a single request. Missing/forbidden files simply stay unsigned. */
export async function signPaths(paths: string[]): Promise<void> {
  const need = [...new Set(paths)].filter((p) => p && !fresh(p));
  if (!need.length) return;
  const key = need.sort().join('|');
  const existing = inflight.get(key);
  if (existing) return existing;
  const job = (async () => {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrls(need, TTL);
    for (const row of data ?? []) {
      if (row.path && row.signedUrl) cache.set(row.path, { url: row.signedUrl, exp: Date.now() + TTL * 1000 });
    }
  })().finally(() => inflight.delete(key));
  inflight.set(key, job);
  return job;
}

export async function downloadUrl(path: string, filename: string): Promise<string | null> {
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 300, { download: filename });
  return data?.signedUrl ?? null;
}

/** Returns { path: url } for every path that could be signed; re-renders when ready. */
export function useSignedUrls(paths: (string | null | undefined)[]): Record<string, string> {
  const list = useMemo(() => [...new Set(paths.filter((p): p is string => Boolean(p)))].sort(), [paths.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps
  const [, bump] = useState(0);
  useEffect(() => {
    let live = true;
    if (list.every((p) => fresh(p))) return;
    signPaths(list).then(() => { if (live) bump((n) => n + 1); });
    return () => { live = false; };
  }, [list]);
  const out: Record<string, string> = {};
  for (const p of list) {
    const u = fresh(p);
    if (u) out[p] = u;
  }
  return out;
}
