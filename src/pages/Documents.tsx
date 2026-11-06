import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useQuery } from '../lib/useQuery';
import { downloadUrl, formatBytes } from '../lib/media';
import { errMsg, formatDate, unwrap } from '../lib/util';
import { usePageTitle } from '../lib/usePageTitle';
import type { PublicDocument } from '../lib/types';
import { EmptyState, ErrorNotice, Loading, StatusBadge } from '../components/ui';

const CATS = ['Forms', 'Guides', 'Downloads', 'Policies'] as const;
const typeLabel = (name: string) => (name.split('.').pop() ?? '').toUpperCase();

export default function Documents() {
  usePageTitle('Forms & Downloads');
  const [sp, setSp] = useSearchParams();
  const [term, setTerm] = useState(sp.get('q') ?? '');
  const [cat, setCat] = useState<string>('all');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const q = useQuery(async () => unwrap<PublicDocument[]>(await supabase.from('public_documents').select('*').order('category').order('display_order').order('title')), []);

  const rows = useMemo(() => (q.data ?? []).filter((d) => {
    if (cat !== 'all' && d.category !== cat) return false;
    const t = term.trim().toLowerCase();
    return !t || d.title.toLowerCase().includes(t) || (d.description ?? '').toLowerCase().includes(t);
  }), [q.data, cat, term]);

  async function download(d: PublicDocument) {
    setBusyId(d.id); setError(null);
    try {
      const url = await downloadUrl(d.path_original, d.original_filename);
      if (!url) throw new Error('The file could not be prepared for download. Please try again.');
      const a = document.createElement('a');
      a.href = url; a.rel = 'noopener'; a.download = d.original_filename;
      document.body.appendChild(a); a.click(); a.remove();
    } catch (e) { setError(errMsg(e)); } finally { setBusyId(null); }
  }

  return (
    <div className="page mt-10">
      <h1 className="text-3xl font-bold">Forms &amp; Downloads</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted">Official campus forms, guides and documents. Only files approved for publication are listed.</p>
      <form role="search" className="mt-6 flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); setSp(term.trim() ? { q: term.trim() } : {}); }}>
        <div className="min-w-[14rem] flex-1">
          <label className="label" htmlFor="doc-q">Search documents</label>
          <input id="doc-q" type="search" className="input" value={term} onChange={(e) => setTerm(e.target.value)} maxLength={80} />
        </div>
      </form>
      <div role="tablist" aria-label="Document category" className="mt-4 flex flex-wrap gap-2">
        {['all', ...CATS].map((c) => (
          <button key={c} type="button" role="tab" aria-selected={cat === c} onClick={() => setCat(c)} className={`btn btn-sm ${cat === c ? 'btn-primary' : 'btn-outline'}`}>{c === 'all' ? 'All' : c}</button>
        ))}
      </div>
      <div className="mt-6 space-y-8">
        {q.loading && <Loading />}
        {q.error && <ErrorNotice message="The documents could not be loaded." onRetry={q.reload} />}
        {error && <ErrorNotice message={error} />}
        {q.data && rows.length === 0 && <EmptyState title="No documents found">{q.data.length === 0 ? 'Documents will appear here once they are published.' : 'Try a different search or category.'}</EmptyState>}
        {CATS.map((c) => {
          const list = rows.filter((d) => d.category === c);
          if (!list.length) return null;
          return (
            <section key={c} aria-labelledby={`cat-${c}`}>
              <h2 id={`cat-${c}`} className="mb-3 text-xl font-bold">{c}</h2>
              <ul className="space-y-3">
                {list.map((d) => (
                  <li key={d.id} className="card flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-base font-bold">{d.title}</h3>
                      {d.description && <p className="mt-1 text-sm">{d.description}</p>}
                      <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
                        <StatusBadge label={typeLabel(d.original_filename)} tone="neutral" /> {formatBytes(d.size_bytes)} · Added {formatDate(d.created_at)}
                      </p>
                    </div>
                    <button type="button" className="btn btn-primary" disabled={busyId === d.id} onClick={() => download(d)} aria-label={`Download ${d.title}`}>
                      {busyId === d.id ? 'Preparing…' : 'Download'}
                    </button>
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
