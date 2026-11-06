import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useQuery } from '../lib/useQuery';
import { usePageTitle } from '../lib/usePageTitle';
import { CATEGORIES } from '../config/site';
import type { PublicAnnouncement } from '../lib/types';
import AnnouncementCard from '../components/AnnouncementCard';
import { EmptyState, ErrorNotice, Loading } from '../components/ui';

const PAGE_SIZE = 10;

export default function Announcements() {
  usePageTitle('Announcements');
  const [sp, setSp] = useSearchParams();
  const page = Math.max(1, parseInt(sp.get('page') ?? '1', 10) || 1);
  const cat = sp.get('category') ?? '';
  const term = sp.get('q') ?? '';
  const [draft, setDraft] = useState(term);

  const q = useQuery(async () => {
    const from = (page - 1) * PAGE_SIZE;
    let query = supabase.from('public_announcements').select('*', { count: 'exact' });
    if (cat && (CATEGORIES as readonly string[]).includes(cat)) query = query.eq('category', cat);
    if (term.trim()) query = query.ilike('title', `%${term.trim().replace(/[%_\\]/g, (c) => `\\${c}`)}%`);
    const r = await query.order('published_at', { ascending: false }).range(from, from + PAGE_SIZE - 1);
    if (r.error) throw new Error('Announcements could not be loaded.');
    return { rows: (r.data ?? []) as PublicAnnouncement[], total: r.count ?? 0 };
  }, [page, cat, term]);

  const pages = Math.max(1, Math.ceil((q.data?.total ?? 0) / PAGE_SIZE));
  const update = (patch: Record<string, string>) => {
    const next = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(patch)) { if (v) next.set(k, v); else next.delete(k); }
    setSp(next);
  };
  const go = (n: number) => { update({ page: String(n) }); window.scrollTo({ top: 0 }); };

  return (
    <div className="page mt-10 max-w-3xl">
      <h1 className="text-3xl font-bold">Announcements</h1>
      <p className="mt-2 text-sm text-muted">Newest first. Only approved announcements are published here.</p>
      <form role="search" className="mt-4 flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); update({ q: draft.trim(), page: '' }); }}>
        <div className="min-w-[12rem] flex-1">
          <label className="label" htmlFor="an-q">Search titles</label>
          <input id="an-q" className="input" value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={80} />
        </div>
        <div>
          <label className="label" htmlFor="an-cat">Category</label>
          <select id="an-cat" className="input" value={cat} onChange={(e) => update({ category: e.target.value, page: '' })}>
            <option value="">All categories</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <button type="submit" className="btn btn-primary">Search</button>
      </form>
      <div className="mt-6 space-y-4" aria-live="polite">
        {q.loading && <Loading />}
        {q.error && <ErrorNotice message={q.error} onRetry={q.reload} />}
        {q.data && q.data.rows.length === 0 && <EmptyState title="No announcements to show">Check back later, or clear the filters.</EmptyState>}
        {q.data?.rows.map((a) => <AnnouncementCard key={a.id} a={a} />)}
      </div>
      {q.data && q.data.total > PAGE_SIZE && (
        <nav aria-label="Pagination" className="mt-6 flex items-center justify-between">
          <button type="button" className="btn btn-outline" disabled={page <= 1} onClick={() => go(page - 1)}>Previous</button>
          <span className="text-sm text-muted">Page {page} of {pages}</span>
          <button type="button" className="btn btn-outline" disabled={page >= pages} onClick={() => go(page + 1)}>Next</button>
        </nav>
      )}
    </div>
  );
}
