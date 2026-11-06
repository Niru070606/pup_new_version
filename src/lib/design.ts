/**
 * Design configuration = DATA only (colours, built-in font stacks, layout switches, uploaded image ids).
 * The database validates it (validate_design_config); this file validates it AGAIN on the client and falls back to the
 * built-in look for anything invalid, so a bad or half-finished configuration can never break the public site.
 * Nothing here ever injects HTML, <style> or script.
 */
export type FontKey = 'serif-classic' | 'sans-system' | 'humanist' | 'rounded' | 'mono';
export type BlendMode = 'normal' | 'multiply' | 'overlay' | 'soft-light' | 'screen' | 'darken' | 'lighten';
export type SectionKey = 'announcements' | 'events' | 'about' | 'academics' | 'links';

export interface BackgroundCfg {
  assetId: string | null;
  color: string | null;
  positionX: number;
  positionY: number;
  size: 'cover' | 'contain' | 'auto';
  opacity: number;
  overlayColor: string | null;
  overlayOpacity: number;
  blendMode: BlendMode;
}
export interface Slide { id: string; assetId: string; title: string; caption: string; alt: string; linkUrl: string | null; visible: boolean }
export interface DesignConfig {
  version: 1;
  branding: { logoAssetId: string | null; faviconAssetId: string | null };
  colors: { primary: string; primaryHover: string; primaryStrong: string; accent: string; accentHover: string; accentSoft: string; footer: string; ink: string; surface: string };
  typography: { headingFont: FontKey; bodyFont: FontKey; baseSize: number };
  layout: { maxWidth: 'narrow' | 'standard' | 'wide'; headerStyle: 'light' | 'dark'; heroAlign: 'left' | 'center'; radius: 'sharp' | 'soft' | 'round'; sections: SectionKey[]; hiddenSections: SectionKey[] };
  hero: { headline: string; subtitle: string; imageAssetId: string | null; showImage: boolean; minHeight: 'compact' | 'standard' | 'tall'; background: BackgroundCfg };
  banner: { enabled: boolean; text: string; tone: 'info' | 'accent' | 'warning'; imageAssetId: string | null };
  pageBackground: BackgroundCfg;
  carousel: { enabled: boolean; autoplay: boolean; intervalSec: number; slides: Slide[] };
}

export const FONT_STACKS: Record<FontKey, { label: string; stack: string }> = {
  'serif-classic': { label: 'Classic serif (Georgia)', stack: 'Georgia, Cambria, "Times New Roman", serif' },
  'sans-system': { label: 'Clean sans-serif (system)', stack: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' },
  humanist: { label: 'Friendly humanist', stack: 'Seravek, "Gill Sans Nova", Ubuntu, Calibri, "DejaVu Sans", source-sans-pro, sans-serif' },
  rounded: { label: 'Rounded', stack: 'ui-rounded, "Hiragino Maru Gothic ProN", Quicksand, Comfortaa, Manjari, "Arial Rounded MT", "Arial Rounded MT Bold", Calibri, source-sans-pro, sans-serif' },
  mono: { label: 'Monospace', stack: 'ui-monospace, "Cascadia Code", "Source Code Pro", Menlo, Consolas, "DejaVu Sans Mono", monospace' },
};
export const SECTION_LABELS: Record<SectionKey, string> = {
  announcements: 'Latest announcements', events: 'Upcoming events', about: 'About the campus', academics: 'Academic information', links: 'Quick links',
};
export const BLEND_MODES: BlendMode[] = ['normal', 'multiply', 'overlay', 'soft-light', 'screen', 'darken', 'lighten'];
export const ALL_SECTIONS: SectionKey[] = ['announcements', 'events', 'about', 'academics', 'links'];

export const DEFAULT_BACKGROUND: BackgroundCfg = {
  assetId: null, color: null, positionX: 50, positionY: 50, size: 'cover', opacity: 1, overlayColor: null, overlayOpacity: 0.4, blendMode: 'normal',
};

/** The original look of the site (brand colours from the project specification). */
export const DEFAULT_DESIGN: DesignConfig = {
  version: 1,
  branding: { logoAssetId: null, faviconAssetId: null },
  colors: { primary: '#9C2836', primaryHover: '#89232F', primaryStrong: '#721D27', accent: '#F9C242', accentHover: '#E5AE2E', accentSoft: '#FEF3D8', footer: '#5B171F', ink: '#1F2328', surface: '#F6F6F7' },
  typography: { headingFont: 'serif-classic', bodyFont: 'sans-system', baseSize: 16 },
  layout: { maxWidth: 'standard', headerStyle: 'light', heroAlign: 'left', radius: 'soft', sections: [...ALL_SECTIONS], hiddenSections: [] },
  hero: { headline: '', subtitle: '', imageAssetId: null, showImage: false, minHeight: 'standard', background: { ...DEFAULT_BACKGROUND } },
  banner: { enabled: false, text: '', tone: 'info', imageAssetId: null },
  pageBackground: { ...DEFAULT_BACKGROUND },
  carousel: { enabled: false, autoplay: true, intervalSec: 6, slides: [] },
};

export const cloneDesign = (d: DesignConfig): DesignConfig => JSON.parse(JSON.stringify(d)) as DesignConfig;

// ------------------------------------------------------------------ sanitizing (never throws)
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX = /^#[0-9A-Fa-f]{6}$/;
const str = (v: unknown, max: number, d: string): string => (typeof v === 'string' && v.length <= max && !/[<>\u0000-\u001f]/.test(v) ? v : d);
const hex = (v: unknown, d: string): string => (typeof v === 'string' && HEX.test(v) ? v.toUpperCase() : d);
const hexOrNull = (v: unknown): string | null => (typeof v === 'string' && HEX.test(v) ? v.toUpperCase() : null);
const uuid = (v: unknown): string | null => (typeof v === 'string' && UUID.test(v) ? v : null);
const num = (v: unknown, lo: number, hi: number, d: number): number => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : d);
const oneOf = <T extends string>(v: unknown, allowed: readonly T[], d: T): T => (typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : d);
const bool = (v: unknown, d: boolean): boolean => (typeof v === 'boolean' ? v : d);
export const isSafeLink = (s: string): boolean => /^\/([A-Za-z0-9_?=&#.%~+-][A-Za-z0-9/_?=&#.%~+-]*)?$/.test(s) || /^https:\/\/[^\s<>"']+$/.test(s);

export function relativeLuminance(h: string): number {
  const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a), lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function bg(raw: unknown): BackgroundCfg {
  const o = isObj(raw) ? raw : {};
  const d = DEFAULT_BACKGROUND;
  return {
    assetId: uuid(o.assetId), color: hexOrNull(o.color), positionX: num(o.positionX, 0, 100, d.positionX), positionY: num(o.positionY, 0, 100, d.positionY),
    size: oneOf(o.size, ['cover', 'contain', 'auto'] as const, d.size), opacity: num(o.opacity, 0, 1, d.opacity), overlayColor: hexOrNull(o.overlayColor),
    overlayOpacity: num(o.overlayOpacity, 0, 1, d.overlayOpacity), blendMode: oneOf(o.blendMode, BLEND_MODES, d.blendMode),
  };
}

export function sanitizeDesign(raw: unknown): DesignConfig {
  const D = DEFAULT_DESIGN;
  if (!isObj(raw) || raw.version !== 1) return cloneDesign(D);
  const br = isObj(raw.branding) ? raw.branding : {};
  const co = isObj(raw.colors) ? raw.colors : {};
  const ty = isObj(raw.typography) ? raw.typography : {};
  const la = isObj(raw.layout) ? raw.layout : {};
  const he = isObj(raw.hero) ? raw.hero : {};
  const ba = isObj(raw.banner) ? raw.banner : {};
  const ca = isObj(raw.carousel) ? raw.carousel : {};

  const colors = {
    primary: hex(co.primary, D.colors.primary), primaryHover: hex(co.primaryHover, D.colors.primaryHover), primaryStrong: hex(co.primaryStrong, D.colors.primaryStrong),
    accent: hex(co.accent, D.colors.accent), accentHover: hex(co.accentHover, D.colors.accentHover), accentSoft: hex(co.accentSoft, D.colors.accentSoft),
    footer: hex(co.footer, D.colors.footer), ink: hex(co.ink, D.colors.ink), surface: hex(co.surface, D.colors.surface),
  };
  // Readability guard: unreadable combinations fall back to the safe defaults.
  if (contrastRatio(colors.primary, '#FFFFFF') < 4.5) { colors.primary = D.colors.primary; colors.primaryHover = D.colors.primaryHover; }
  if (contrastRatio(colors.footer, '#FFFFFF') < 4.5) colors.footer = D.colors.footer;
  if (contrastRatio(colors.primaryStrong, '#FFFFFF') < 4.5) colors.primaryStrong = D.colors.primaryStrong;
  if (contrastRatio(colors.ink, '#FFFFFF') < 7) colors.ink = D.colors.ink;
  if (contrastRatio(colors.accent, colors.primaryStrong) < 4.5) { colors.accent = D.colors.accent; colors.primaryStrong = D.colors.primaryStrong; }

  const secList = (v: unknown): SectionKey[] => {
    if (!Array.isArray(v)) return [];
    const out: SectionKey[] = [];
    for (const s of v) if (typeof s === 'string' && (ALL_SECTIONS as string[]).includes(s) && !out.includes(s as SectionKey)) out.push(s as SectionKey);
    return out;
  };
  let sections = secList(la.sections);
  for (const s of ALL_SECTIONS) if (!sections.includes(s)) sections.push(s); // new sections always appear, never vanish
  if (!sections.length) sections = [...ALL_SECTIONS];

  const slides: Slide[] = [];
  if (Array.isArray(ca.slides)) {
    for (const s of ca.slides.slice(0, 10)) {
      if (!isObj(s)) continue;
      const assetId = uuid(s.assetId);
      const alt = str(s.alt, 300, '');
      const id = typeof s.id === 'string' && /^[a-z0-9-]{1,40}$/.test(s.id) ? s.id : null;
      if (!assetId || !alt.trim() || !id || slides.some((x) => x.id === id)) continue; // incomplete slides are skipped, not fatal
      const link = typeof s.linkUrl === 'string' && isSafeLink(s.linkUrl) && s.linkUrl.length <= 500 ? s.linkUrl : null;
      slides.push({ id, assetId, alt, title: str(s.title, 100, ''), caption: str(s.caption, 240, ''), linkUrl: link, visible: bool(s.visible, true) });
    }
  }

  return {
    version: 1,
    branding: { logoAssetId: uuid(br.logoAssetId), faviconAssetId: uuid(br.faviconAssetId) },
    colors,
    typography: {
      headingFont: oneOf(ty.headingFont, Object.keys(FONT_STACKS) as FontKey[], D.typography.headingFont),
      bodyFont: oneOf(ty.bodyFont, Object.keys(FONT_STACKS) as FontKey[], D.typography.bodyFont),
      baseSize: num(ty.baseSize, 14, 20, D.typography.baseSize),
    },
    layout: {
      maxWidth: oneOf(la.maxWidth, ['narrow', 'standard', 'wide'] as const, D.layout.maxWidth),
      headerStyle: oneOf(la.headerStyle, ['light', 'dark'] as const, D.layout.headerStyle),
      heroAlign: oneOf(la.heroAlign, ['left', 'center'] as const, D.layout.heroAlign),
      radius: oneOf(la.radius, ['sharp', 'soft', 'round'] as const, D.layout.radius),
      sections,
      hiddenSections: secList(la.hiddenSections),
    },
    hero: {
      headline: str(he.headline, 120, ''), subtitle: str(he.subtitle, 240, ''), imageAssetId: uuid(he.imageAssetId), showImage: bool(he.showImage, false),
      minHeight: oneOf(he.minHeight, ['compact', 'standard', 'tall'] as const, D.hero.minHeight), background: bg(he.background),
    },
    banner: { enabled: bool(ba.enabled, false), text: str(ba.text, 200, ''), tone: oneOf(ba.tone, ['info', 'accent', 'warning'] as const, 'info'), imageAssetId: uuid(ba.imageAssetId) },
    pageBackground: bg(raw.pageBackground),
    carousel: { enabled: bool(ca.enabled, false), autoplay: bool(ca.autoplay, true), intervalSec: num(ca.intervalSec, 3, 15, 6), slides },
  };
}

// ------------------------------------------------------------------ applying a design
const rgb = (h: string): string => `${parseInt(h.slice(1, 3), 16)} ${parseInt(h.slice(3, 5), 16)} ${parseInt(h.slice(5, 7), 16)}`;
const RADIUS = { sharp: '0px', soft: '0.375rem', round: '0.9rem' } as const;
const WIDTH = { narrow: '56rem', standard: '72rem', wide: '84rem' } as const;

/** CSS custom properties consumed by tailwind.config.js and index.css. Set through the CSSOM (allowed by the site's CSP). */
export function designVars(d: DesignConfig): Record<string, string> {
  const c = d.colors;
  return {
    '--c-maroon': rgb(c.primary), '--c-maroon-hover': rgb(c.primaryHover), '--c-maroon-strong': rgb(c.primaryStrong), '--c-maroon-footer': rgb(c.footer),
    '--c-gold': rgb(c.accent), '--c-gold-hover': rgb(c.accentHover), '--c-gold-soft': rgb(c.accentSoft), '--c-ink': rgb(c.ink), '--c-surface': rgb(c.surface),
    '--font-sans': FONT_STACKS[d.typography.bodyFont].stack, '--font-serif': FONT_STACKS[d.typography.headingFont].stack,
    '--base-size': `${d.typography.baseSize}px`, '--radius': RADIUS[d.layout.radius], '--page-max': WIDTH[d.layout.maxWidth],
  };
}

export function applyDesignVars(el: HTMLElement, d: DesignConfig): void {
  for (const [k, v] of Object.entries(designVars(d))) el.style.setProperty(k, v);
}
export function clearDesignVars(el: HTMLElement): void {
  for (const k of Object.keys(designVars(DEFAULT_DESIGN))) el.style.removeProperty(k);
}

export function setFavicon(url: string | null): void {
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.href = url ?? 'data:,';
}

/** All uploaded images the design refers to (used to resolve them in one request). */
export function designAssetIds(d: DesignConfig): string[] {
  const ids = [d.branding.logoAssetId, d.branding.faviconAssetId, d.hero.imageAssetId, d.hero.background.assetId, d.banner.imageAssetId, d.pageBackground.assetId, ...d.carousel.slides.map((s) => s.assetId)];
  return [...new Set(ids.filter((x): x is string => Boolean(x)))];
}

export const HERO_HEIGHT = { compact: 'py-8 sm:py-12', standard: 'py-14 sm:py-20', tall: 'py-24 sm:py-36' } as const;
