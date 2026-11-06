import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { unwrap, errMsg } from '../lib/util';
import { usePageTitle } from '../lib/usePageTitle';
import type { SearchHit } from '../lib/types';
import { EmptyState, ErrorNotice, Loading } from '../components/ui';

const KINDS: { kind: SearchHit['kind']; label: string }[] = [
  { kind: 'announcement', label: 'Announcements' }, { kind: 'program', label: 'Academic programs' }, { kind: 'person', label: 'Faculty & staff' },
  { kind: 'event', label: 'Events' }, { kind: 'document', label: 'Documents' }, { kind: 'link', label: 'Links' }, { kind: 'page', label: 'Pages' },
];

export default function SearchPage() {
  const [sp, setSp] = useSearchParams();
  const q = (sp.get('q') ?? '').trim();
  const [text, setText] = useState(q);
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  usePageTitle(q ? `Search: ${q}` : 'Search');

  useEffect(() => setText(q), [q]);
  useEffect(() => {
    if (q.length < 2) { setHits(null); setError(null); return; }
    let live = true;
    setLoading(true); setError(null);
    (async () => {
      try {
        const r = unwrap<SearchHit[]>(await supabase.rpc('global_search', { p_q: q, p_limit: 40 }));
        if (live) setHits(r ?? []);
      } catch (e) { if (live) setError(errMsg(e)); } finally { if (live) setLoading(false); }
    })();
    return () => { live = false; };
  }, [q, tick]);

  function submit(e: FormEvent) { e.preventDefault(); setSp(text.trim() ? { q: text.trim() } : {}); }

  return (
    <div className="page mt-10 max-w-3xl">
      <h1 className="text-3xl font-bold">Search</h1>
      <form role="search" onSubmit={submit} className="mt-4 flex gap-2">
        <label htmlFor="s-q" className="sr-only">Search announcements, programs, faculty, events, documents and links</label>
        <input id="s-q" type="search" className="input" value={text} onChange={(e) => setText(e.target.value)} maxLength={80} placeholder="Search the website…" />
        <button type="submit" className="btn btn-primary">Search</button>
      </form>
      <div aria-live="polite" className="mt-4 text-sm text-muted">
        {loading ? 'Searching…' : hits ? `${hits.length} result${hits.length === 1 ? '' : 's'} for “${q}”` : ''}
      </div>
      <div className="mt-4 space-y-6">
        {loading && <Loading label="Searching…" />}
        {error && <ErrorNotice message={error} onRetry={() => setTick((t) => t + 1)} />}
        {!q && <EmptyState title="Type something to search">Search announcements, academic programs, faculty and staff, events, documents and links.</EmptyState>}
        {q && q.length < 2 && <EmptyState title="Type at least 2 characters" />}
        {hits && hits.length === 0 && !loading && <EmptyState title="No results found">Try different or fewer words.</EmptyState>}
        {hits && KINDS.map(({ kind, label }) => {
          const list = hits.filter((h) => h.kind === kind);
          if (!list.length) return null;
          return (
            <section key={kind} aria-labelledby={`sr-${kind}`}>
              <h2 id={`sr-${kind}`} className="mb-2 text-lg font-bold">{label} ({list.length})</h2>
              <ul className="space-y-2">
                {list.map((h) => (
                  <li key={`${h.kind}-${h.id}`} className="card py-3">
                    <Link to={h.path} className="font-semibold">{h.title}</Link>
                    {h.snippet && <p className="mt-1 text-sm">{h.snippet}</p>}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
