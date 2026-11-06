import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useQuery } from '../../lib/useQuery';
import { formatDateTime } from '../../lib/util';
import type { AuditLog } from '../../lib/types';
import { EmptyState, ErrorNotice, Loading, PageHeader } from '../../components/ui';

const PAGE = 50;

const label = (a: string) => a.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

export default function AdminLogs() {
  const [page, setPage] = useState(1);
  const q = useQuery(async () => {
    const from = (page - 1) * PAGE;
    const r = await supabase.from('audit_logs').select('*, actor:profiles(full_name,email)', { count: 'exact' }).order('created_at', { ascending: false }).range(from, from + PAGE - 1);
    if (r.error) throw new Error('The activity log could not be loaded.');
    return { rows: (r.data ?? []) as unknown as AuditLog[], total: r.count ?? 0 };
  }, [page]);
  const pages = Math.max(1, Math.ceil((q.data?.total ?? 0) / PAGE));

  return (
    <>
      <PageHeader title="Activity logs" intro="A read-only record of important actions, written by the server. Entries cannot be edited or deleted from the website." />
      {q.loading && <Loading />}
      {q.error && <ErrorNotice message={q.error} onRetry={q.reload} />}
      {q.data && q.data.rows.length === 0 && <EmptyState title="No activity recorded yet" />}
      {q.data && q.data.rows.length > 0 && (
        <>
          <div className="card overflow-x-auto p-0">
            <table className="tbl">
              <caption className="sr-only">Activity log</caption>
              <thead><tr><th scope="col">When</th><th scope="col">Who</th><th scope="col">Action</th><th scope="col">Details</th></tr></thead>
              <tbody>
                {q.data.rows.map((r) => {
                  const d = r.details && Object.keys(r.details).length ? Object.entries(r.details).map(([k, v]) => `${k}: ${String(v)}`).join(', ') : '';
                  return (
                    <tr key={r.id}>
                      <td className="whitespace-nowrap">{formatDateTime(r.created_at)}</td>
                      <td>{r.actor ? r.actor.full_name || r.actor.email : 'System'}</td>
                      <td>{label(r.action)}</td>
                      <td className="max-w-md break-words text-xs text-muted">{r.resource_type ? `${r.resource_type}${d ? ' — ' : ''}` : ''}{d}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <nav aria-label="Pagination" className="mt-4 flex items-center justify-between">
            <button type="button" className="btn btn-outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Newer</button>
            <span className="text-sm text-muted">Page {page} of {pages}</span>
            <button type="button" className="btn btn-outline" disabled={page >= pages} onClick={() => setPage(page + 1)}>Older</button>
          </nav>
        </>
      )}
    </>
  );
}
