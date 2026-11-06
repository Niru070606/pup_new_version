import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useQuery } from '../../lib/useQuery';
import { check, formatDateTime, unwrap } from '../../lib/util';
import type { ContentHistoryRow } from '../../lib/types';
import { ConfirmDialog, EmptyState, ErrorNotice, Loading, PageHeader, type Pending } from '../../components/ui';

const PAGE = 30;

function Val({ label, text }: { label: string; text: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 160;
  return (
    <div className="min-w-0">
      <p className="text-xs font-semibold text-muted">{label}</p>
      <p className="prose-plain text-sm">{text === '' ? <em className="text-muted">(empty)</em> : open || !long ? text : `${text.slice(0, 160)}…`}</p>
      {long && <button type="button" className="text-xs underline" onClick={() => setOpen(!open)}>{open ? 'Show less' : 'Show all'}</button>}
    </div>
  );
}

export default function AdminHistory() {
  const [page, setPage] = useState(1);
  const [pending, setPending] = useState<Pending | null>(null);
  const q = useQuery(async () => {
    const from = (page - 1) * PAGE;
    const r = await supabase.from('campus_content_history').select('*', { count: 'exact' }).order('changed_at', { ascending: false }).range(from, from + PAGE - 1);
    if (r.error) throw new Error('The history could not be loaded.');
    const rows = (r.data ?? []) as ContentHistoryRow[];
    const keys = [...new Set(rows.map((x) => x.key))];
    const labels: Record<string, string> = {};
    if (keys.length) for (const c of unwrap<{ key: string; label: string }[]>(await supabase.from('campus_content').select('key,label').in('key', keys))) labels[c.key] = c.label;
    return { rows, labels, total: r.count ?? 0 };
  }, [page]);
  const pages = Math.max(1, Math.ceil((q.data?.total ?? 0) / PAGE));

  function restore(h: ContentHistoryRow, label: string) {
    setPending({
      title: 'Restore this version?', message: `“${label}” returns to the earlier text shown. The current text stays in the history.`, confirmLabel: 'Restore',
      run: async () => check(await supabase.rpc('restore_content_value', { p_history_id: h.id })),
    });
  }

  return (
    <>
      <PageHeader title="Content history" intro="Every change to campus content (history, mission, contact details, settings) is kept. Restore an earlier version if a change was a mistake." />
      <div className="alert alert-info mb-4 text-sm">
        Other histories: <Link to="/admin/design">design versions and rollback</Link>, <Link to="/admin/links">links directory versions</Link>, and announcement revisions in the <Link to="/admin/announcements">announcements</Link> list.
      </div>
      {q.loading && <Loading />}
      {q.error && <ErrorNotice message={q.error} onRetry={q.reload} />}
      {q.data && q.data.rows.length === 0 && <EmptyState title="No changes recorded yet">Edits made in Campus content will be listed here.</EmptyState>}
      <ul className="space-y-3">
        {q.data?.rows.map((h) => {
          const label = q.data!.labels[h.key] ?? h.key;
          return (
            <li key={h.id} className="card">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div><h2 className="text-base font-bold">{label}</h2><p className="text-xs text-muted">{formatDateTime(h.changed_at)}</p></div>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => restore(h, label)}>Restore this version</button>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2"><Val label="Before" text={h.old_value} /><Val label="After" text={h.new_value} /></div>
            </li>
          );
        })}
      </ul>
      {q.data && q.data.total > PAGE && (
        <nav aria-label="Pagination" className="mt-4 flex items-center justify-between">
          <button type="button" className="btn btn-outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Newer</button>
          <span className="text-sm text-muted">Page {page} of {pages}</span>
          <button type="button" className="btn btn-outline" disabled={page >= pages} onClick={() => setPage(page + 1)}>Older</button>
        </nav>
      )}
      <ConfirmDialog pending={pending} onClose={() => setPending(null)} onDone={q.reload} />
    </>
  );
}
