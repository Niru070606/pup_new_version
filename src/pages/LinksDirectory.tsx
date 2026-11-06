import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useQuery } from '../lib/useQuery';
import { usePageTitle } from '../lib/usePageTitle';
import { isSafeHref, unwrap } from '../lib/util';
import type { LinkIcon, LiveLinks } from '../lib/types';
import { EmptyState, ErrorNotice, Loading } from '../components/ui';

const PATHS: Record<LinkIcon, string> = {
  globe: 'M12 3a9 9 0 100 18 9 9 0 000-18zm0 0c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9m0-18C9.5 5.5 8.5 8.5 8.5 12s1 6.5 3.5 9M3 12h18',
  document: 'M7 3h7l5 5v13H7zM14 3v5h5M9.5 13h6M9.5 17h6',
  people: 'M9 11a3 3 0 100-6 3 3 0 000 6zm7 1a2.5 2.5 0 100-5M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5M16 14.5c2.7 0 5 1.8 5 4.5',
  book: 'M4 5c3-1 6-1 8 1v14c-2-2-5-2-8-1zM20 5c-3-1-6-1-8 1v14c2-2 5-2 8-1z',
  mail: 'M3 6h18v12H3zM3 7l9 6 9-6',
  building: 'M5 21V4h9v17M14 9h5v12M3 21h18M8 8h3M8 12h3M8 16h3',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  school: 'M2 9l10-5 10 5-10 5zM6 11.5V16c3 2.5 9 2.5 12 0v-4.5',
  download: 'M12 4v11m0 0l-4-4m4 4l4-4M5 20h14',
  star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z',
};
export function LinkIconSvg({ icon }: { icon: LinkIcon | null }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-maroon" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={PATHS[icon ?? 'globe'] ?? PATHS.globe} />
    </svg>
  );
}

export interface AccLink { id: string; title: string; url: string; description: string | null; icon: LinkIcon | null; hidden?: boolean }
export interface AccGroup { id: string; title: string; description: string | null; hidden?: boolean; links: AccLink[] }

export function LinkRow({ l, copyable = true }: { l: AccLink; copyable?: boolean }) {
  const [msg, setMsg] = useState('');
  const safe = isSafeHref(l.url);
  const external = /^https?:/i.test(l.url);
  async function copy() {
    try { await navigator.clipboard.writeText(l.url); setMsg('Link copied'); } catch { setMsg('Copy failed'); }
    window.setTimeout(() => setMsg(''), 2500);
  }
  return (
    <li className="flex flex-wrap items-start justify-between gap-2 py-3">
      <div className="flex min-w-0 gap-3">
        <LinkIconSvg icon={l.icon} />
        <div className="min-w-0">
          {safe ? (
            <a href={l.url} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})} className="break-words font-medium">
              {l.title}{external && <span className="sr-only"> (opens in a new tab)</span>}
            </a>
          ) : <span className="font-medium">{l.title} <span className="text-xs text-muted">(link unavailable)</span></span>}
          {l.hidden && <span className="ml-2 badge badge-neutral">Hidden</span>}
          {l.description && <p className="text-sm text-muted">{l.description}</p>}
        </div>
      </div>
      {copyable && safe && (
        <div className="flex items-center gap-2">
          <button type="button" className="btn btn-outline btn-sm" onClick={copy}>Copy link</button>
          <span role="status" className="text-xs text-[#1F6030]">{msg}</span>
        </div>
      )}
    </li>
  );
}

/** Accordion shared by the public page, the designer editor preview and admin approvals. */
export function LinksAccordion({ groups, open, setOpen, copyable = true, idPrefix = 'lg' }: { groups: AccGroup[]; open: Set<string>; setOpen: (s: Set<string>) => void; copyable?: boolean; idPrefix?: string }) {
  const toggle = (id: string) => { const n = new Set(open); if (n.has(id)) n.delete(id); else n.add(id); setOpen(n); };
  return (
    <div className="space-y-3">
      {groups.map((g) => {
        const isOpen = open.has(g.id);
        return (
          <section key={g.id} className="card p-0">
            <h2 className="text-lg font-bold">
              <button type="button" className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left font-serif" aria-expanded={isOpen} aria-controls={`${idPrefix}-${g.id}`} onClick={() => toggle(g.id)}>
                <span>{g.title}{g.hidden && <span className="ml-2 badge badge-neutral">Hidden</span>} <span className="text-sm font-normal text-muted">({g.links.length})</span></span>
                <span aria-hidden="true" className="text-xl">{isOpen ? '−' : '+'}</span>
              </button>
            </h2>
            <div id={`${idPrefix}-${g.id}`} hidden={!isOpen} className="border-t border-line px-5 pb-2">
              {g.description && <p className="pt-3 text-sm text-muted">{g.description}</p>}
              {g.links.length === 0 ? <p className="py-3 text-sm text-muted">No links in this group yet.</p>
                : <ul className="divide-y divide-line">{g.links.map((l) => <LinkRow key={l.id} l={l} copyable={copyable} />)}</ul>}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export default function LinksDirectory() {
  usePageTitle('Links directory');
  const [sp] = useSearchParams();
  const [term, setTerm] = useState(sp.get('q') ?? '');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const q = useQuery(async () => unwrap<LiveLinks | null>(await supabase.rpc('get_live_links')), []);
  const groups = q.data?.groups ?? [];

  const filtered = useMemo(() => {
    const t = term.trim().toLowerCase();
    if (!t) return groups.map((g) => ({ ...g, hidden: false }));
    return groups.map((g) => ({ ...g, hidden: false, links: g.links.filter((l) => `${l.title} ${l.description ?? ''} ${l.url}`.toLowerCase().includes(t)) })).filter((g) => g.links.length > 0 || g.title.toLowerCase().includes(t));
  }, [groups, term]);

  // Matching groups open automatically while searching.
  useEffect(() => { if (term.trim()) setOpen(new Set(filtered.map((g) => g.id))); }, [term]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="page mt-10 max-w-3xl">
      <h1 className="text-3xl font-bold">Links directory</h1>
      <p className="mt-2 text-sm text-muted">Student organizations, government and SK links, academic resources, PUP system links and forms. Only approved links are listed.</p>
      {q.loading && <Loading />}
      {q.error && <ErrorNotice message="The links could not be loaded." onRetry={q.reload} />}
      {q.data === null && !q.loading && !q.error && <div className="mt-6"><EmptyState title="No links published yet">Approved links will appear here.</EmptyState></div>}
      {q.data && (
        <>
          <form role="search" className="mt-6 flex flex-wrap items-end gap-3" onSubmit={(e) => e.preventDefault()}>
            <div className="min-w-[14rem] flex-1">
              <label className="label" htmlFor="lk-q">Search links</label>
              <input id="lk-q" type="search" className="input" value={term} onChange={(e) => setTerm(e.target.value)} />
            </div>
            <button type="button" className="btn btn-outline" onClick={() => setOpen(new Set(filtered.map((g) => g.id)))}>Expand all</button>
            <button type="button" className="btn btn-outline" onClick={() => setOpen(new Set())}>Collapse all</button>
          </form>
          <div className="mt-4">
            {filtered.length === 0 ? <EmptyState title="No links match your search" /> : <LinksAccordion groups={filtered} open={open} setOpen={setOpen} />}
          </div>
        </>
      )}
    </div>
  );
}
