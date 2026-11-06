import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useQuery } from '../../lib/useQuery';
import { assetToRef } from '../../lib/media';
import { errMsg, moveItem, newId, unwrap } from '../../lib/util';
import {
  ALL_SECTIONS, BLEND_MODES, DEFAULT_BACKGROUND, DEFAULT_DESIGN, FONT_STACKS, SECTION_LABELS, cloneDesign, contrastRatio, isSafeLink, sanitizeDesign,
  type BackgroundCfg, type DesignConfig, type FontKey, type SectionKey,
} from '../../lib/design';
import type { DesignRevision, ImageRef, LiveDesign, MediaAsset, RevisionStatus } from '../../lib/types';
import { ConfirmDialog, ErrorNotice, Loading, PageHeader, RevisionBadge, type Pending } from '../../components/ui';
import MediaPicker, { Thumb } from '../../components/media/MediaPicker';
import SitePreview from '../../components/design/SitePreview';
import { usePageTitle } from '../../lib/usePageTitle';

type Base = '/designer' | '/admin';
const editorPath = (base: Base, id: string) => (base === '/admin' ? `/admin/design/editor/${id}` : `/designer/editor/${id}`);
const TABS = ['Branding', 'Colors', 'Typography', 'Layout', 'Hero', 'Banner', 'Page background', 'Carousel'] as const;
type Tab = (typeof TABS)[number];
type PickTarget = 'logo' | 'favicon' | 'heroImage' | 'heroBg' | 'banner' | 'pageBg' | 'newSlide' | { slide: string };

function ColorField({ label, value, onChange, optional = false }: { label: string; value: string | null; onChange: (v: string | null) => void; optional?: boolean }) {
  const [text, setText] = useState(value ?? '');
  useEffect(() => setText(value ?? ''), [value]);
  const id = `c-${label.replace(/\W+/g, '-')}`;
  return (
    <div>
      <label className="label" htmlFor={id}>{label}</label>
      <div className="flex items-center gap-2">
        <input type="color" aria-label={`${label} picker`} value={value ?? '#000000'} onChange={(e) => onChange(e.target.value.toUpperCase())} className="h-9 w-12 cursor-pointer rounded border border-gray-400" />
        <input id={id} className="input w-28 font-mono" value={text} maxLength={7} onChange={(e) => { setText(e.target.value); if (/^#[0-9A-Fa-f]{6}$/.test(e.target.value)) onChange(e.target.value.toUpperCase()); }} placeholder="#RRGGBB" />
        {optional && value && <button type="button" className="btn btn-outline btn-sm" onClick={() => onChange(null)}>None</button>}
      </div>
    </div>
  );
}

function Range({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  const id = `r-${label.replace(/\W+/g, '-')}`;
  return (
    <div>
      <label className="label" htmlFor={id}>{label}: {Math.round(value * 100) / 100}</label>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full" />
    </div>
  );
}

function ImageField({ label, assetId, assets, onPick, onClear }: { label: string; assetId: string | null; assets: Record<string, MediaAsset>; onPick: () => void; onClear: () => void }) {
  const a = assetId ? assets[assetId] : null;
  return (
    <div>
      <p className="label">{label}</p>
      <div className="flex items-center gap-3">
        <span className="block h-14 w-20 shrink-0 overflow-hidden rounded border border-line bg-surface">{a ? <Thumb asset={a} /> : null}</span>
        <button type="button" className="btn btn-outline btn-sm" onClick={onPick}>{a ? 'Change image' : 'Choose image'}</button>
        {assetId && <button type="button" className="btn btn-outline btn-sm" onClick={onClear}>Remove</button>}
      </div>
      {assetId && !a && <p className="hint">Image not found in your library.</p>}
    </div>
  );
}

function BgEditor({ label, value, assets, onChange, onPick }: { label: string; value: BackgroundCfg; assets: Record<string, MediaAsset>; onChange: (v: BackgroundCfg) => void; onPick: () => void }) {
  const set = <K extends keyof BackgroundCfg>(k: K, v: BackgroundCfg[K]) => onChange({ ...value, [k]: v });
  return (
    <fieldset className="space-y-3 rounded border border-line p-3">
      <legend className="px-1 text-sm font-semibold">{label}</legend>
      <ImageField label="Image" assetId={value.assetId} assets={assets} onPick={onPick} onClear={() => set('assetId', null)} />
      <ColorField label={`${label} colour`} value={value.color} optional onChange={(v) => set('color', v)} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Range label="Horizontal position (%)" value={value.positionX} min={0} max={100} step={1} onChange={(v) => set('positionX', v)} />
        <Range label="Vertical position (%)" value={value.positionY} min={0} max={100} step={1} onChange={(v) => set('positionY', v)} />
        <div>
          <label className="label" htmlFor={`bg-size-${label}`}>Size</label>
          <select id={`bg-size-${label}`} className="input" value={value.size} onChange={(e) => set('size', e.target.value as BackgroundCfg['size'])}>
            <option value="cover">Cover (fill)</option><option value="contain">Contain (fit)</option><option value="auto">Original size</option>
          </select>
        </div>
        <Range label="Image opacity" value={value.opacity} min={0} max={1} step={0.05} onChange={(v) => set('opacity', v)} />
      </div>
      <ColorField label={`${label} overlay colour`} value={value.overlayColor} optional onChange={(v) => set('overlayColor', v)} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Range label="Overlay opacity" value={value.overlayOpacity} min={0} max={1} step={0.05} onChange={(v) => set('overlayOpacity', v)} />
        <div>
          <label className="label" htmlFor={`bg-blend-${label}`}>Blend mode</label>
          <select id={`bg-blend-${label}`} className="input" value={value.blendMode} onChange={(e) => set('blendMode', e.target.value as BackgroundCfg['blendMode'])}>
            {BLEND_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
      </div>
    </fieldset>
  );
}

function Reorder({ label, onUp, onDown, disabledUp, disabledDown }: { label: string; onUp: () => void; onDown: () => void; disabledUp: boolean; disabledDown: boolean }) {
  return (
    <span className="flex gap-1">
      <button type="button" className="btn btn-outline btn-sm" onClick={onUp} disabled={disabledUp} aria-label={`Move ${label} up`}>↑</button>
      <button type="button" className="btn btn-outline btn-sm" onClick={onDown} disabled={disabledDown} aria-label={`Move ${label} down`}>↓</button>
    </span>
  );
}

export default function VisualEditor({ base }: { base: Base }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [cfg, setCfg] = useState<DesignConfig>(() => cloneDesign(DEFAULT_DESIGN));
  const [name, setName] = useState('Untitled design');
  const [note, setNote] = useState('');
  const [rev, setRev] = useState<DesignRevision | null>(null);
  const [ready, setReady] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState<Tab>('Branding');
  const [mode, setMode] = useState<'desktop' | 'mobile'>('desktop');
  const [pick, setPick] = useState<PickTarget | null>(null);
  const [assets, setAssets] = useState<Record<string, MediaAsset>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [dragFrom, setDragFrom] = useState<{ list: 'sections' | 'slides'; i: number } | null>(null);
  usePageTitle('Visual editor');

  const lib = useQuery(async () => unwrap<MediaAsset[]>(await supabase.from('media_assets').select('*').eq('kind', 'image').eq('purpose', 'design').eq('status', 'ready').limit(500)), []);
  useEffect(() => { if (lib.data) setAssets((p) => { const m = { ...p }; for (const a of lib.data!) m[a.id] = a; return m; }); }, [lib.data]);
  const resolve = useCallback((aid: string): ImageRef | null => (assets[aid] ? assetToRef(assets[aid]) : null), [assets]);

  const loadLive = useCallback(async () => {
    const live = unwrap<LiveDesign | null>(await supabase.rpc('get_live_design'));
    return live ? sanitizeDesign(live.config) : cloneDesign(DEFAULT_DESIGN);
  }, []);

  const load = useQuery(async () => {
    if (id) {
      const r = unwrap<DesignRevision | null>(await supabase.from('design_revisions').select('*').eq('id', id).maybeSingle());
      if (!r) throw new Error('Design not found, or you do not have access to it.');
      return { rev: r, cfg: sanitizeDesign(r.config) };
    }
    return { rev: null, cfg: await loadLive() };
  }, [id]);
  useEffect(() => {
    if (load.data) { setRev(load.data.rev); setCfg(load.data.cfg); setName(load.data.rev?.name ?? 'Untitled design'); setNote(load.data.rev?.note ?? ''); setDirty(false); setReady(true); }
  }, [load.data]);
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const status: RevisionStatus | null = rev?.status ?? null;
  const editable = !rev || ['draft', 'rejected', 'revision_required'].includes(rev.status);

  const upd = (fn: (c: DesignConfig) => void) => { setCfg((p) => { const c = cloneDesign(p); fn(c); return c; }); setDirty(true); };

  const warnings = useMemo(() => {
    const c = cfg.colors, w: string[] = [];
    if (contrastRatio(c.primary, '#FFFFFF') < 4.5) w.push('Primary colour is too light for white text (needs contrast 4.5).');
    if (contrastRatio(c.footer, '#FFFFFF') < 4.5) w.push('Footer colour is too light for white text (needs contrast 4.5).');
    if (contrastRatio(c.primaryStrong, '#FFFFFF') < 4.5) w.push('Strong primary colour is too light for headings on white (needs contrast 4.5).');
    if (contrastRatio(c.ink, '#FFFFFF') < 7) w.push('Text colour needs contrast 7 against white.');
    if (contrastRatio(c.accent, c.primaryStrong) < 4.5) w.push('Accent buttons: contrast with the strong primary colour must be at least 4.5.');
    cfg.carousel.slides.forEach((s, i) => { if (!s.alt.trim()) w.push(`Slide ${i + 1} needs an image description.`); if (s.linkUrl && !isSafeLink(s.linkUrl)) w.push(`Slide ${i + 1} link must be a site page like /events or start with https://.`); });
    return w;
  }, [cfg]);

  function onPicked(a: MediaAsset) {
    setAssets((p) => ({ ...p, [a.id]: a }));
    const t = pick; setPick(null);
    if (!t) return;
    upd((c) => {
      if (t === 'logo') c.branding.logoAssetId = a.id;
      else if (t === 'favicon') c.branding.faviconAssetId = a.id;
      else if (t === 'heroImage') { c.hero.imageAssetId = a.id; c.hero.showImage = true; }
      else if (t === 'heroBg') c.hero.background.assetId = a.id;
      else if (t === 'banner') c.banner.imageAssetId = a.id;
      else if (t === 'pageBg') c.pageBackground.assetId = a.id;
      else if (t === 'newSlide') c.carousel.slides.push({ id: newId(), assetId: a.id, title: '', caption: '', alt: a.alt_text ?? '', linkUrl: null, visible: true });
      else { const s = c.carousel.slides.find((x) => x.id === t.slide); if (s) { s.assetId = a.id; if (!s.alt) s.alt = a.alt_text ?? ''; } }
    });
  }

  async function persist(submit: boolean, asNew = false): Promise<string> {
    return unwrap<string>(await supabase.rpc('save_design_draft', { p_id: asNew ? null : rev?.id ?? null, p_name: name, p_config: cfg, p_submit: submit, p_note: note || null }));
  }
  async function saveDraft() {
    setBusy(true); setError(null); setNotice(null);
    try {
      const rid = await persist(false);
      setDirty(false); setNotice('Draft saved. It is not visible to the public.');
      if (!rev) navigate(editorPath(base, rid), { replace: true }); else load.reload();
    } catch (e) { setError(errMsg(e)); } finally { setBusy(false); }
  }
  function askSubmit() {
    if (warnings.length) { setError('Fix the highlighted problems before submitting.'); return; }
    setError(null);
    setPending({
      title: 'Submit this design for approval?', message: 'An administrator will review it. It stays private, and you cannot edit it while it is under review. The public site changes only if it is approved.', confirmLabel: 'Submit for approval',
      run: async () => { await persist(true); setDirty(false); navigate(base === '/admin' ? '/admin/design' : '/designer'); },
    });
  }
  async function duplicate() {
    setBusy(true); setError(null);
    try { const rid = await persist(false, true); setDirty(false); navigate(editorPath(base, rid)); } catch (e) { setError(errMsg(e)); } finally { setBusy(false); }
  }
  async function resetLive() {
    try { setCfg(await loadLive()); setDirty(true); setNotice('Loaded the current live design into the editor (not saved yet).'); } catch (e) { setError(errMsg(e)); }
  }

  if (load.loading && !ready) return <Loading label="Loading the editor…" />;
  if (load.error) return <ErrorNotice message={load.error} onRetry={load.reload} />;

  const dis = !editable;
  const sections = cfg.layout.sections;
  const slides = cfg.carousel.slides;
  const dragProps = (list: 'sections' | 'slides', i: number, move: (from: number, to: number) => void) => ({
    draggable: editable,
    onDragStart: () => setDragFrom({ list, i }),
    onDragOver: (e: { preventDefault: () => void }) => { if (dragFrom?.list === list) e.preventDefault(); },
    onDrop: (e: { preventDefault: () => void }) => { e.preventDefault(); if (dragFrom?.list === list) move(dragFrom.i, i); setDragFrom(null); },
    onDragEnd: () => setDragFrom(null),
  });
  const moveSection = (from: number, to: number) => upd((c) => { c.layout.sections = moveItem(c.layout.sections, from, to); });
  const moveSlide = (from: number, to: number) => upd((c) => { c.carousel.slides = moveItem(c.carousel.slides, from, to); });
  const toggleHidden = (s: SectionKey) => upd((c) => { c.layout.hiddenSections = c.layout.hiddenSections.includes(s) ? c.layout.hiddenSections.filter((x) => x !== s) : [...c.layout.hiddenSections, s]; });
  const fonts = Object.keys(FONT_STACKS) as FontKey[];

  return (
    <>
      <PageHeader title="Visual editor" intro="Changes are saved as private drafts. Submit a draft for administrator approval to make it public."
        actions={<div className="flex items-center gap-2">{status && <RevisionBadge status={status} />}<Link to={base === '/admin' ? '/admin/design' : '/designer'} className="btn btn-outline btn-sm">Back</Link></div>} />
      {rev?.review_reason && ['rejected', 'revision_required'].includes(rev.status) && (
        <div className="alert alert-warning mb-4"><p className="font-semibold">{rev.status === 'rejected' ? 'Rejected' : 'Changes requested'} by an administrator</p><p className="prose-plain mt-1">{rev.review_reason}</p></div>
      )}
      {!editable && <div className="alert alert-info mb-4">This design is {rev!.status === 'pending' ? 'awaiting review' : 'approved'} and cannot be edited. You can duplicate it as a new draft.</div>}
      {error && <div role="alert" className="alert alert-error mb-4">{error}</div>}
      {notice && <div role="status" className="alert alert-success mb-4">{notice}</div>}
      {warnings.length > 0 && editable && <ul className="alert alert-warning mb-4 list-disc pl-6" role="alert">{warnings.map((w) => <li key={w}>{w}</li>)}</ul>}

      <div className="card mb-4 grid gap-3 sm:grid-cols-2">
        <div><label className="label" htmlFor="d-name">Design name</label><input id="d-name" className="input" maxLength={80} value={name} disabled={dis} onChange={(e) => { setName(e.target.value); setDirty(true); }} /></div>
        <div><label className="label" htmlFor="d-note">Note for the reviewer (optional)</label><input id="d-note" className="input" maxLength={500} value={note} disabled={dis} onChange={(e) => { setNote(e.target.value); setDirty(true); }} /></div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[26rem_1fr]">
        <section aria-label="Design controls" className="card min-w-0 self-start">
          <div role="tablist" aria-label="Design settings" className="mb-4 flex flex-wrap gap-1">
            {TABS.map((t) => <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`btn btn-sm ${tab === t ? 'btn-primary' : 'btn-outline'}`}>{t}</button>)}
          </div>
          <fieldset disabled={dis} className="space-y-4 border-0 p-0">
            {tab === 'Branding' && (
              <>
                <ImageField label="Logo" assetId={cfg.branding.logoAssetId} assets={assets} onPick={() => setPick('logo')} onClear={() => upd((c) => { c.branding.logoAssetId = null; })} />
                <ImageField label="Favicon (small square image)" assetId={cfg.branding.faviconAssetId} assets={assets} onPick={() => setPick('favicon')} onClear={() => upd((c) => { c.branding.faviconAssetId = null; })} />
                <p className="hint">Only upload logos you are authorized to use.</p>
              </>
            )}
            {tab === 'Colors' && (
              <div className="grid gap-3 sm:grid-cols-2">
                {([['primary', 'Primary'], ['primaryHover', 'Primary (hover)'], ['primaryStrong', 'Strong primary (headings)'], ['accent', 'Accent'], ['accentHover', 'Accent (hover)'], ['accentSoft', 'Soft accent'], ['footer', 'Footer'], ['ink', 'Text'], ['surface', 'Surface']] as const).map(([k, l]) => (
                  <ColorField key={k} label={l} value={cfg.colors[k]} onChange={(v) => v && upd((c) => { c.colors[k] = v; })} />
                ))}
                <button type="button" className="btn btn-outline btn-sm sm:col-span-2" onClick={() => upd((c) => { c.colors = { ...DEFAULT_DESIGN.colors }; })}>Restore original colours</button>
              </div>
            )}
            {tab === 'Typography' && (
              <>
                <p className="hint">Only built-in system fonts are available (no downloads, faster on slow connections).</p>
                {(['headingFont', 'bodyFont'] as const).map((k) => (
                  <div key={k}>
                    <label className="label" htmlFor={`t-${k}`}>{k === 'headingFont' ? 'Heading font' : 'Body font'}</label>
                    <select id={`t-${k}`} className="input" value={cfg.typography[k]} onChange={(e) => upd((c) => { c.typography[k] = e.target.value as FontKey; })}>{fonts.map((f) => <option key={f} value={f}>{FONT_STACKS[f].label}</option>)}</select>
                  </div>
                ))}
                <Range label="Base text size (px)" value={cfg.typography.baseSize} min={14} max={20} step={1} onChange={(v) => upd((c) => { c.typography.baseSize = v; })} />
              </>
            )}
            {tab === 'Layout' && (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div><label className="label" htmlFor="l-w">Page width</label><select id="l-w" className="input" value={cfg.layout.maxWidth} onChange={(e) => upd((c) => { c.layout.maxWidth = e.target.value as DesignConfig['layout']['maxWidth']; })}><option value="narrow">Narrow</option><option value="standard">Standard</option><option value="wide">Wide</option></select></div>
                  <div><label className="label" htmlFor="l-h">Header style</label><select id="l-h" className="input" value={cfg.layout.headerStyle} onChange={(e) => upd((c) => { c.layout.headerStyle = e.target.value as 'light' | 'dark'; })}><option value="light">Light</option><option value="dark">Dark</option></select></div>
                  <div><label className="label" htmlFor="l-a">Hero alignment</label><select id="l-a" className="input" value={cfg.layout.heroAlign} onChange={(e) => upd((c) => { c.layout.heroAlign = e.target.value as 'left' | 'center'; })}><option value="left">Left</option><option value="center">Centered</option></select></div>
                  <div><label className="label" htmlFor="l-r">Corner style</label><select id="l-r" className="input" value={cfg.layout.radius} onChange={(e) => upd((c) => { c.layout.radius = e.target.value as DesignConfig['layout']['radius']; })}><option value="sharp">Sharp</option><option value="soft">Soft</option><option value="round">Round</option></select></div>
                </div>
                <div>
                  <p className="label">Homepage sections (drag to reorder, or use the arrows)</p>
                  <ul className="space-y-2">
                    {sections.map((s, i) => (
                      <li key={s} {...dragProps('sections', i, moveSection)} className="flex flex-wrap items-center justify-between gap-2 rounded border border-line bg-white p-2">
                        <span className="flex items-center gap-2 text-sm"><span aria-hidden="true" className="cursor-grab select-none">⠿</span>{SECTION_LABELS[s]}</span>
                        <span className="flex items-center gap-2">
                          <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={!cfg.layout.hiddenSections.includes(s)} onChange={() => toggleHidden(s)} /> Show</label>
                          <Reorder label={SECTION_LABELS[s]} onUp={() => moveSection(i, i - 1)} onDown={() => moveSection(i, i + 1)} disabledUp={i === 0} disabledDown={i === sections.length - 1} />
                        </span>
                      </li>
                    ))}
                  </ul>
                  {sections.length < ALL_SECTIONS.length && <p className="hint">Missing sections are added automatically.</p>}
                </div>
              </>
            )}
            {tab === 'Hero' && (
              <>
                <div><label className="label" htmlFor="h-h">Headline (leave blank for the default)</label><input id="h-h" className="input" maxLength={120} value={cfg.hero.headline} onChange={(e) => upd((c) => { c.hero.headline = e.target.value; })} /></div>
                <div><label className="label" htmlFor="h-s">Subtitle</label><textarea id="h-s" className="input" rows={2} maxLength={240} value={cfg.hero.subtitle} onChange={(e) => upd((c) => { c.hero.subtitle = e.target.value; })} /></div>
                <div><label className="label" htmlFor="h-m">Hero height</label><select id="h-m" className="input" value={cfg.hero.minHeight} onChange={(e) => upd((c) => { c.hero.minHeight = e.target.value as DesignConfig['hero']['minHeight']; })}><option value="compact">Compact</option><option value="standard">Standard</option><option value="tall">Tall</option></select></div>
                <ImageField label="Hero image" assetId={cfg.hero.imageAssetId} assets={assets} onPick={() => setPick('heroImage')} onClear={() => upd((c) => { c.hero.imageAssetId = null; c.hero.showImage = false; })} />
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={cfg.hero.showImage} onChange={(e) => upd((c) => { c.hero.showImage = e.target.checked; })} /> Show the hero image</label>
                <BgEditor label="Hero background" value={cfg.hero.background} assets={assets} onChange={(v) => upd((c) => { c.hero.background = v; })} onPick={() => setPick('heroBg')} />
              </>
            )}
            {tab === 'Banner' && (
              <>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={cfg.banner.enabled} onChange={(e) => upd((c) => { c.banner.enabled = e.target.checked; })} /> Show a banner above the header</label>
                <div><label className="label" htmlFor="b-t">Banner text</label><input id="b-t" className="input" maxLength={200} value={cfg.banner.text} onChange={(e) => upd((c) => { c.banner.text = e.target.value; })} /></div>
                <div><label className="label" htmlFor="b-tone">Style</label><select id="b-tone" className="input" value={cfg.banner.tone} onChange={(e) => upd((c) => { c.banner.tone = e.target.value as DesignConfig['banner']['tone']; })}><option value="info">Information</option><option value="accent">Accent</option><option value="warning">Notice</option></select></div>
                <ImageField label="Banner image (optional)" assetId={cfg.banner.imageAssetId} assets={assets} onPick={() => setPick('banner')} onClear={() => upd((c) => { c.banner.imageAssetId = null; })} />
              </>
            )}
            {tab === 'Page background' && <BgEditor label="Page background" value={cfg.pageBackground} assets={assets} onChange={(v) => upd((c) => { c.pageBackground = v; })} onPick={() => setPick('pageBg')} />}
            {tab === 'Carousel' && (
              <>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={cfg.carousel.enabled} onChange={(e) => upd((c) => { c.carousel.enabled = e.target.checked; })} /> Show the carousel on the home page</label>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={cfg.carousel.autoplay} onChange={(e) => upd((c) => { c.carousel.autoplay = e.target.checked; })} /> Advance automatically (visitors can pause)</label>
                <Range label="Seconds per slide" value={cfg.carousel.intervalSec} min={3} max={15} step={1} onChange={(v) => upd((c) => { c.carousel.intervalSec = v; })} />
                <ul className="space-y-3">
                  {slides.map((s, i) => {
                    const bad = s.linkUrl ? !isSafeLink(s.linkUrl) : false;
                    return (
                      <li key={s.id} {...dragProps('slides', i, moveSlide)} className="space-y-2 rounded border border-line bg-white p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-2 text-sm font-semibold"><span aria-hidden="true" className="cursor-grab select-none">⠿</span>Slide {i + 1}</span>
                          <Reorder label={`slide ${i + 1}`} onUp={() => moveSlide(i, i - 1)} onDown={() => moveSlide(i, i + 1)} disabledUp={i === 0} disabledDown={i === slides.length - 1} />
                        </div>
                        <ImageField label="Image" assetId={s.assetId} assets={assets} onPick={() => setPick({ slide: s.id })} onClear={() => {}} />
                        <div><label className="label" htmlFor={`s-alt-${s.id}`}>Image description (required)</label><input id={`s-alt-${s.id}`} className="input" maxLength={300} value={s.alt} onChange={(e) => upd((c) => { c.carousel.slides[i].alt = e.target.value; })} aria-invalid={!s.alt.trim()} /></div>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <div><label className="label" htmlFor={`s-t-${s.id}`}>Title</label><input id={`s-t-${s.id}`} className="input" maxLength={100} value={s.title} onChange={(e) => upd((c) => { c.carousel.slides[i].title = e.target.value; })} /></div>
                          <div><label className="label" htmlFor={`s-l-${s.id}`}>Link (optional)</label><input id={`s-l-${s.id}`} className="input" maxLength={500} value={s.linkUrl ?? ''} placeholder="/events or https://…" onChange={(e) => upd((c) => { c.carousel.slides[i].linkUrl = e.target.value.trim() || null; })} aria-invalid={bad} />{bad && <p className="field-error">Use a site page like /events, or a link starting with https://.</p>}</div>
                        </div>
                        <div><label className="label" htmlFor={`s-c-${s.id}`}>Caption</label><input id={`s-c-${s.id}`} className="input" maxLength={240} value={s.caption} onChange={(e) => upd((c) => { c.carousel.slides[i].caption = e.target.value; })} /></div>
                        <div className="flex items-center justify-between">
                          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={s.visible} onChange={(e) => upd((c) => { c.carousel.slides[i].visible = e.target.checked; })} /> Visible</label>
                          <button type="button" className="btn btn-outline btn-sm" onClick={() => upd((c) => { c.carousel.slides.splice(i, 1); })}>Remove slide</button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
                {slides.length < 10 ? <button type="button" className="btn btn-outline" onClick={() => setPick('newSlide')}>Add slide</button> : <p className="hint">Maximum of 10 slides.</p>}
              </>
            )}
          </fieldset>
        </section>

        <section aria-label="Live preview" className="min-w-0">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-lg font-bold">Live preview</h2>
            <div role="group" aria-label="Preview size" className="flex gap-1">
              <button type="button" className={`btn btn-sm ${mode === 'desktop' ? 'btn-primary' : 'btn-outline'}`} aria-pressed={mode === 'desktop'} onClick={() => setMode('desktop')}>Desktop</button>
              <button type="button" className={`btn btn-sm ${mode === 'mobile' ? 'btn-primary' : 'btn-outline'}`} aria-pressed={mode === 'mobile'} onClick={() => setMode('mobile')}>Mobile</button>
            </div>
          </div>
          <SitePreview cfg={cfg} resolve={resolve} mode={mode} />
        </section>
      </div>

      <div className="sticky bottom-0 mt-4 flex flex-wrap items-center gap-3 border-t border-line bg-white py-3">
        {editable ? (
          <>
            <button type="button" className="btn btn-outline" onClick={saveDraft} disabled={busy}>{busy ? 'Saving…' : 'Save draft'}</button>
            <button type="button" className="btn btn-primary" onClick={askSubmit} disabled={busy}>Submit for approval</button>
            <button type="button" className="btn btn-outline" onClick={resetLive} disabled={busy}>Reset to live design</button>
          </>
        ) : <button type="button" className="btn btn-primary" onClick={duplicate} disabled={busy}>Duplicate as new draft</button>}
        {dirty && <span className="text-sm text-muted" role="status">Unsaved changes</span>}
      </div>
      {pick && <MediaPicker purpose="design" title="Choose a design image" onSelect={onPicked} onClose={() => setPick(null)} />}
      <ConfirmDialog pending={pending} onClose={() => setPending(null)} onDone={() => {}} />
    </>
  );
}
