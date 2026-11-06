import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { SITE } from '../config/site';

export interface DashLink { to: string; label: string; end?: boolean }

export default function DashboardLayout({ title, links }: { title: string; links: DashLink[] }) {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();

  async function out() {
    await signOut();
    navigate('/', { replace: true });
  }

  return (
    <div className="min-h-screen bg-surface">
      <a href="#main" className="skip-link">Skip to main content</a>
      <header className="on-dark border-b-4 border-gold bg-maroon-footer text-white">
        <div className="page flex flex-wrap items-center justify-between gap-3 py-3">
          <div>
            <p className="text-xs text-gold">{title}</p>
            <p className="font-serif text-lg font-bold">{SITE.shortName}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span>{profile?.full_name || profile?.email}</span>
            <Link to="/" className="text-white">View public site</Link>
            <button type="button" className="btn btn-gold btn-sm" onClick={out}>Sign out</button>
          </div>
        </div>
      </header>
      <div className="page flex flex-col gap-6 py-6 md:flex-row">
        <nav aria-label={`${title} sections`} className="md:w-56 md:shrink-0">
          <ul className="flex gap-1 overflow-x-auto pb-1 md:flex-col md:overflow-visible">
            {links.map((l) => (
              <li key={l.to}>
                <NavLink
                  to={l.to}
                  end={l.end}
                  className={({ isActive }) =>
                    `block whitespace-nowrap rounded px-3 py-2 text-sm font-medium no-underline ${isActive ? 'bg-maroon text-white' : 'bg-white text-maroon-strong hover:bg-gold-soft'}`
                  }
                >
                  {l.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <main id="main" className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
