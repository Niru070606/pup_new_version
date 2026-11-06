import { useEffect, useState, type FormEvent } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useContent } from '../context/ContentContext';
import { useDesign } from '../context/DesignContext';
import { SITE } from '../config/site';
import { supabase } from '../lib/supabase';
import { homeFor } from '../lib/util';
import ResponsiveImage from './media/ResponsiveImage';
import BackgroundLayer from './design/BackgroundLayer';
import Banner from './design/Banner';

const NAV = [
  { to: '/', label: 'Home', end: true },
  { to: '/about', label: 'About' },
  { to: '/academics', label: 'Academics' },
  { to: '/faculty', label: 'Faculty & Staff' },
  { to: '/announcements', label: 'Announcements' },
  { to: '/events', label: 'Events' },
  { to: '/links', label: 'Links' },
  { to: '/documents', label: 'Forms & Downloads' },
  { to: '/contact', label: 'Contact' },
];

function Brand({ dark = false }: { dark?: boolean }) {
  const { design, resolve } = useDesign();
  const logo = design.branding.logoAssetId ? resolve(design.branding.logoAssetId) : null;
  return (
    <Link to="/" className="flex items-center gap-3 no-underline">
      {logo ? <ResponsiveImage image={logo} alt="" eager sizes="48px" fit="contain" className="h-12 w-12 shrink-0 bg-transparent" />
        : SITE.logoSrc && <img src={SITE.logoSrc} alt="" className="h-12 w-12 object-contain" />}
      <span className="leading-tight">
        <span className={`block text-xs ${dark ? 'text-white/80' : 'text-muted'}`}>{SITE.universityName}</span>
        <span className={`block font-serif text-xl font-bold ${dark ? 'text-white' : 'text-maroon-strong'}`}>Unisan Campus</span>
      </span>
    </Link>
  );
}

/** Counts page visits anonymously (no cookies, no personal data). Skipped when the browser sends Do Not Track. */
function usePageViewCounter() {
  const loc = useLocation();
  useEffect(() => {
    if (navigator.doNotTrack === '1') return;
    const path = loc.pathname.replace(/\/+$/, '') || '/';
    void supabase.rpc('record_page_view', { p_path: path });
  }, [loc.pathname]);
}

export default function PublicLayout() {
  const { session, profile } = useAuth();
  const { content } = useContent();
  const { design, resolve } = useDesign();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const loc = useLocation();
  const navigate = useNavigate();
  useEffect(() => setOpen(false), [loc.pathname]);
  usePageViewCounter();
  // Move keyboard/screen-reader focus to the new page after navigation.
  useEffect(() => { document.getElementById('main')?.focus({ preventScroll: true }); }, [loc.pathname]);
  const year = new Date().getFullYear();
  const dark = design.layout.headerStyle === 'dark';

  const linkCls = ({ isActive }: { isActive: boolean }) =>
    `block rounded px-2.5 py-2 text-sm font-medium no-underline ${isActive ? 'bg-maroon text-white' : dark ? 'text-white hover:bg-white/10' : 'text-maroon-strong hover:bg-surface'}`;

  function search(e: FormEvent) {
    e.preventDefault();
    if (q.trim().length >= 2) { navigate(`/search?q=${encodeURIComponent(q.trim())}`); setOpen(false); }
  }

  return (
    <div className="relative flex min-h-screen flex-col">
      {(design.pageBackground.assetId || design.pageBackground.color) && (
        <div className="fixed inset-0 -z-10"><BackgroundLayer cfg={design.pageBackground} resolve={resolve} /></div>
      )}
      <a href="#main" className="skip-link">Skip to main content</a>
      {content.site_notice && (
        <div role="status" className="bg-gold-soft px-4 py-2 text-center text-sm text-maroon-strong">{content.site_notice}</div>
      )}
      <Banner cfg={design.banner} resolve={resolve} />
      <header className={`relative border-b-4 border-gold ${dark ? 'on-dark bg-maroon-footer text-white' : 'bg-white'}`}>
        <div className="page flex items-center justify-between gap-4 py-3">
          <Brand dark={dark} />
          <button type="button" className={`btn md:hidden ${dark ? 'btn-light' : 'btn-outline'}`} aria-expanded={open} aria-controls="site-nav" onClick={() => setOpen((o) => !o)}>
            {open ? 'Close menu' : 'Menu'}
          </button>
          <nav id="site-nav" aria-label="Main" className={`${open ? 'block' : 'hidden'} absolute left-0 right-0 top-full z-40 border-b border-line ${dark ? 'bg-maroon-footer' : 'bg-white'} p-3 md:static md:block md:border-0 md:bg-transparent md:p-0`}>
            <ul className="flex flex-col gap-1 md:flex-row md:flex-wrap md:items-center md:justify-end">
              {NAV.map((n) => (
                <li key={n.to}><NavLink to={n.to} end={n.end} className={linkCls}>{n.label}</NavLink></li>
              ))}
              <li>
                <form role="search" onSubmit={search} className="flex gap-1">
                  <label htmlFor="site-search" className="sr-only">Search the website</label>
                  <input id="site-search" type="search" className="input w-36 py-1.5" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} maxLength={80} />
                  <button type="submit" className="btn btn-outline btn-sm bg-white">Search</button>
                </form>
              </li>
              <li>
                <Link to={session && profile ? homeFor(profile.role) : '/login'} className="btn btn-gold mt-1 md:ml-1 md:mt-0">
                  {session && profile ? 'Dashboard' : 'Staff login'}
                </Link>
              </li>
            </ul>
          </nav>
        </div>
      </header>

      <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">
        <Outlet />
      </main>

      <footer className="on-dark mt-12 bg-maroon-footer text-white">
        <div className="page grid gap-8 py-10 md:grid-cols-3">
          <div>
            <Brand dark />
            <p className="mt-3 text-sm text-white/80">{SITE.attribution}</p>
          </div>
          <div className="text-sm">
            <h2 className="mb-2 font-serif text-base font-bold text-gold">Contact</h2>
            {content.contact_address || content.contact_phone || content.contact_email ? (
              <ul className="space-y-1">
                {content.contact_address && <li>{content.contact_address}</li>}
                {content.contact_phone && <li>{content.contact_phone}</li>}
                {content.contact_email && <li><a className="text-white" href={`mailto:${content.contact_email}`}>{content.contact_email}</a></li>}
              </ul>
            ) : (
              <p className="text-white/80">Contact details have not been added yet.</p>
            )}
          </div>
          <nav aria-label="Footer" className="text-sm">
            <h2 className="mb-2 font-serif text-base font-bold text-gold">Explore</h2>
            <ul className="space-y-1">
              {NAV.slice(1).map((n) => (
                <li key={n.to}><Link className="text-white" to={n.to}>{n.label}</Link></li>
              ))}
              <li><Link className="text-white" to="/search">Search</Link></li>
            </ul>
          </nav>
        </div>
        <div className="border-t border-white/20 py-3 text-center text-xs text-white/70">© {year} {SITE.campusName}</div>
      </footer>
    </div>
  );
}
