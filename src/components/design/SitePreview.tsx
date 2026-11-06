import { designVars, HERO_HEIGHT, SECTION_LABELS, type DesignConfig, type SectionKey } from '../../lib/design';
import type { ImageRef } from '../../lib/types';
import ResponsiveImage from '../media/ResponsiveImage';
import BackgroundLayer from './BackgroundLayer';
import Carousel from './Carousel';
import Banner from './Banner';

interface Props { cfg: DesignConfig; resolve: (id: string) => ImageRef | null; mode: 'desktop' | 'mobile' }

const NAV = ['Home', 'About', 'Academics', 'Faculty & Staff', 'Announcements', 'Events'];

function Sample({ section, mobile }: { section: SectionKey; mobile: boolean }) {
  const grid = mobile ? 'grid gap-3' : 'grid gap-3 sm:grid-cols-2';
  const cards = (n: number, label: string) => (
    <div className={grid}>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="card">
          <p className="text-xs text-muted">Sample content</p>
          <h4 className="mt-1 font-serif font-bold">{label} {i + 1}</h4>
          <p className="mt-1 text-sm">Placeholder text that shows how this section will look.</p>
        </div>
      ))}
    </div>
  );
  return (
    <section className="mt-8" aria-label={SECTION_LABELS[section]}>
      <h3 className="mb-3 font-serif text-xl font-bold">{SECTION_LABELS[section]}</h3>
      {section === 'announcements' && cards(2, 'Announcement')}
      {section === 'events' && cards(2, 'Event')}
      {section === 'about' && cards(3, 'About topic')}
      {section === 'academics' && cards(2, 'Program')}
      {section === 'links' && (
        <ul className={grid}>
          {['Admissions', 'Calendar', 'Directory'].map((l) => <li key={l} className="card py-3 text-sm font-medium">{l} <span className="text-xs text-muted">(sample)</span></li>)}
        </ul>
      )}
    </section>
  );
}

/** Faux homepage used for live preview and approval review. Theme is scoped to this wrapper via CSS custom properties. */
export default function SitePreview({ cfg, resolve, mode }: Props) {
  const mobile = mode === 'mobile';
  const logo = cfg.branding.logoAssetId ? resolve(cfg.branding.logoAssetId) : null;
  const heroImg = cfg.hero.showImage && cfg.hero.imageAssetId ? resolve(cfg.hero.imageAssetId) : null;
  const dark = cfg.layout.headerStyle === 'dark';
  const center = cfg.layout.heroAlign === 'center';
  const order = cfg.layout.sections.filter((s) => !cfg.layout.hiddenSections.includes(s));
  const style = { ...designVars(cfg), ...(mobile ? { width: '390px', maxWidth: '100%' } : {}) };

  return (
    <div className="overflow-x-auto rounded border border-line bg-surface p-2">
      <div style={style} className={`relative mx-auto overflow-hidden bg-white font-sans text-ink ${mobile ? '' : 'w-full'}`} role="img" aria-label={`Preview of the home page, ${mode} view`}>
        {(cfg.pageBackground.assetId || cfg.pageBackground.color) && <BackgroundLayer cfg={cfg.pageBackground} resolve={resolve} />}
        <div className="relative">
          <Banner cfg={cfg.banner} resolve={resolve} />
          <header className={`border-b-4 border-gold ${dark ? 'on-dark bg-maroon-footer text-white' : 'bg-white'}`}>
            <div className={`flex gap-3 px-4 py-3 ${mobile ? 'items-center justify-between' : 'flex-wrap items-center justify-between'}`}>
              <div className="flex items-center gap-3">
                {logo && <ResponsiveImage image={logo} alt="" fit="contain" sizes="48px" className="h-12 w-12 shrink-0 bg-transparent" />}
                <span className="leading-tight">
                  <span className={`block text-xs ${dark ? 'text-white/80' : 'text-muted'}`}>Polytechnic University of the Philippines</span>
                  <span className={`block font-serif text-lg font-bold ${dark ? 'text-white' : 'text-maroon-strong'}`}>Unisan Campus</span>
                </span>
              </div>
              {mobile ? <span className="btn btn-outline btn-sm" aria-hidden="true">Menu</span> : (
                <ul className="flex flex-wrap gap-1 text-sm">
                  {NAV.map((n, i) => <li key={n} className={`rounded px-2 py-1 ${i === 0 ? 'bg-maroon text-white' : dark ? 'text-white' : 'text-maroon-strong'}`}>{n}</li>)}
                </ul>
              )}
            </div>
          </header>
          <section className="on-dark relative bg-maroon text-white">
            <BackgroundLayer cfg={cfg.hero.background} resolve={resolve} />
            <div className={`relative px-4 ${HERO_HEIGHT[cfg.hero.minHeight]} ${center ? 'text-center' : ''}`}>
              <div className={mobile || !heroImg ? '' : 'grid items-center gap-6 grid-cols-2'}>
                <div>
                  <h2 className={`font-serif font-bold text-white ${mobile ? 'text-2xl' : 'text-4xl'}`}>{cfg.hero.headline || 'PUP – Unisan Campus'}</h2>
                  <p className={`mt-3 text-white/90 ${center ? 'mx-auto' : ''} max-w-xl`}>{cfg.hero.subtitle || 'Welcome to the campus information website. (Sample content)'}</p>
                  <div className={`mt-5 flex flex-wrap gap-2 ${center ? 'justify-center' : ''}`}>
                    <span className="btn btn-gold">Read announcements</span>
                    <span className="btn btn-light">Academic programs</span>
                  </div>
                </div>
                {heroImg && <ResponsiveImage image={heroImg} alt="" sizes={mobile ? '390px' : '50vw'} className={`rounded-[var(--radius)] ${mobile ? 'mt-5' : ''}`} />}
              </div>
            </div>
          </section>
          <div className="px-4 pb-6">
            <div className={mobile ? '-mx-4' : '-mx-4 [&_.page]:max-w-none'}><Carousel cfg={cfg.carousel} resolve={resolve} /></div>
            {order.length === 0 && <p className="mt-6 text-sm text-muted">All homepage sections are hidden.</p>}
            {order.map((s) => <Sample key={s} section={s} mobile={mobile} />)}
          </div>
          <footer className="on-dark bg-maroon-footer px-4 py-5 text-sm text-white">
            <p className="font-serif font-bold text-gold">Contact</p>
            <p className="text-white/80">Sample footer – contact details come from Campus content.</p>
          </footer>
        </div>
      </div>
    </div>
  );
}
