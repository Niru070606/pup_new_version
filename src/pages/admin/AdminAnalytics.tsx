import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useQuery } from '../../lib/useQuery';
import { unwrap } from '../../lib/util';
import type { Analytics } from '../../lib/types';
import { EmptyState, ErrorNotice, Loading, PageHeader } from '../../components/ui';

export default function AdminAnalytics() {
  const [days, setDays] = useState(30);
  const q = useQuery(async () => unwrap<Analytics>(await supabase.rpc('admin_analytics', { p_days: days })), [days]);
  const d = q.data;
  const max = Math.max(1, ...(d?.by_day.map((x) => x.views) ?? [1]));

  const table = (title: string, rows: Analytics['top_pages'], id: string) => (
    <section aria-labelledby={id} className="mt-8">
      <h2 id={id} className="mb-2 text-lg font-bold">{title}</h2>
      {rows.length === 0 ? <EmptyState title="No views recorded yet" /> : (
        <div className="card overflow-x-auto p-0">
          <table className="tbl"><caption className="sr-only">{title}</caption>
            <thead><tr><th scope="col">Page</th><th scope="col">Address</th><th scope="col">Views</th></tr></thead>
            <tbody>{rows.map((r) => <tr key={r.path}><td>{r.title ?? r.path}</td><td className="text-xs text-muted">{r.path}</td><td>{r.views}</td></tr>)}</tbody>
          </table>
        </div>
      )}
    </section>
  );

  return (
    <>
      <PageHeader title="Website analytics" intro="Aggregate page views only. No visitor identity, IP address, cookie or device information is stored."
        actions={(
          <div><label className="label" htmlFor="an-days">Period</label>
            <select id="an-days" className="input" value={days} onChange={(e) => setDays(Number(e.target.value))}>
              <option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option>
            </select></div>
        )} />
      {q.loading && <Loading />}
      {q.error && <ErrorNotice message={q.error} onRetry={q.reload} />}
      {d && (
        <>
          <div className="card"><p className="text-3xl font-bold text-maroon-strong">{d.total}</p><p className="text-sm">page views in the last {d.days} days</p></div>
          <section aria-labelledby="an-chart" className="mt-8">
            <h2 id="an-chart" className="mb-2 text-lg font-bold">Views per day</h2>
            <div className="card">
              <div role="img" aria-label={`Bar chart of daily page views, highest day ${max} views`} className="flex h-40 items-end gap-px">
                {d.by_day.map((x) => (
                  <div key={x.day} title={`${x.day}: ${x.views}`} className="min-w-[2px] flex-1 bg-maroon" style={{ height: `${Math.max(2, (x.views / max) * 100)}%` }} />
                ))}
              </div>
              <div className="mt-1 flex justify-between text-xs text-muted"><span>{d.by_day[0]?.day}</span><span>{d.by_day[d.by_day.length - 1]?.day}</span></div>
              <details className="mt-3"><summary className="cursor-pointer text-sm font-medium">Show data table</summary>
                <div className="mt-2 max-h-64 overflow-auto"><table className="tbl"><caption className="sr-only">Daily views</caption>
                  <thead><tr><th scope="col">Day</th><th scope="col">Views</th></tr></thead>
                  <tbody>{d.by_day.map((x) => <tr key={x.day}><td>{x.day}</td><td>{x.views}</td></tr>)}</tbody></table></div>
              </details>
            </div>
          </section>
          {table('Most visited pages', d.top_pages, 'an-pages')}
          {table('Most read announcements', d.top_announcements, 'an-ann')}
        </>
      )}
    </>
  );
}
