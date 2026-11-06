import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useQuery } from '../lib/useQuery';
import { usePageTitle } from '../lib/usePageTitle';
import { formatDateTime, PH_MONTHS, unwrap } from '../lib/util';
import type { PublicEvent } from '../lib/types';
import { EmptyState, ErrorNotice, Loading } from '../components/ui';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const key = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

export default function Events() {
  usePageTitle('Events calendar');
  const today = new Date();
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [cat, setCat] = useState('');
  const q = useQuery(async () => unwrap<PublicEvent[]>(await supabase.from('public_events').select('*').order('starts_at')), []);

  const cats = useMemo(() => [...new Set((q.data ?? []).map((e) => e.category).filter((c): c is string => Boolean(c)))].sort(), [q.data]);
  const rows = (q.data ?? []).filter((e) => !cat || e.category === cat);
  const byDay = useMemo(() => {
    const m = new Map<string, PublicEvent[]>();
    for (const e of rows) {
      const start = new Date(e.starts_at);
      const end = e.ends_at ? new Date(e.ends_at) : start;
      for (let d = new Date(start.getFullYear(), start.getMonth(), start.getDate()); d <= end && m.size < 5000; d.setDate(d.getDate() + 1)) {
        const k = key(d);
        m.set(k, [...(m.get(k) ?? []), e]);
      }
    }
    return m;
  }, [rows]);

  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const days = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = [...Array(first.getDay()).fill(null), ...Array.from({ length: days }, (_, i) => new Date(cursor.getFullYear(), cursor.getMonth(), i + 1))];
  while (cells.length % 7) cells.push(null);
  const monthEvents = rows.filter((e) => { const d = new Date(e.starts_at); return d.getFullYear() === cursor.getFullYear() && d.getMonth() === cursor.getMonth(); });
  const upcoming = rows.filter((e) => new Date(e.ends_at ?? e.starts_at) >= today).slice(0, 10);
  const shift = (n: number) => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + n, 1));

  return (
    <div className="page mt-10">
      <h1 className="text-3xl font-bold">Events calendar</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted">Campus events and activities. Times are shown in Philippine time.</p>
      {q.loading && <Loading />}
      {q.error && <ErrorNotice message="Events could not be loaded." onRetry={q.reload} />}
      {q.data && (
        <>
          <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
            <div className="flex items-center gap-2">
              <button type="button" className="btn btn-outline btn-sm" onClick={() => shift(-1)} aria-label="Previous month">‹</button>
              <h2 className="min-w-[10rem] text-center text-xl font-bold" aria-live="polite">{PH_MONTHS[cursor.getMonth()]} {cursor.getFullYear()}</h2>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => shift(1)} aria-label="Next month">›</button>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setCursor(new Date(today.getFullYear(), today.getMonth(), 1))}>Today</button>
            </div>
            {cats.length > 0 && (
              <div>
                <label className="label" htmlFor="ev-cat">Category</label>
                <select id="ev-cat" className="input" value={cat} onChange={(e) => setCat(e.target.value)}>
                  <option value="">All categories</option>
                  {cats.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            )}
          </div>

          <table className="mt-4 hidden w-full table-fixed border-collapse md:table">
            <caption className="sr-only">Events in {PH_MONTHS[cursor.getMonth()]} {cursor.getFullYear()}</caption>
            <thead><tr>{DOW.map((d) => <th key={d} scope="col" className="border border-line bg-surface p-1 text-xs">{d}</th>)}</tr></thead>
            <tbody>
              {Array.from({ length: cells.length / 7 }, (_, w) => (
                <tr key={w}>
                  {cells.slice(w * 7, w * 7 + 7).map((d, i) => {
                    const list = d ? byDay.get(key(d)) ?? [] : [];
                    const isToday = d && key(d) === key(today);
                    return (
                      <td key={i} className={`h-24 border border-line p-1 align-top text-xs ${d ? '' : 'bg-surface'} ${isToday ? 'bg-gold-soft' : ''}`}>
                        {d && <span className={`block font-semibold ${isToday ? 'text-maroon-strong' : ''}`}>{d.getDate()}{isToday && <span className="sr-only"> (today)</span>}</span>}
                        <ul className="mt-1 space-y-0.5">
                          {list.slice(0, 3).map((e) => <li key={e.id}><Link to={`/events/${e.id}`} className="block truncate rounded bg-maroon px-1 text-white no-underline hover:bg-maroon-hover" title={e.title}>{e.title}</Link></li>)}
                          {list.length > 3 && <li className="text-muted">+{list.length - 3} more</li>}
                        </ul>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>

          <section aria-labelledby="agenda-h" className="mt-6 md:hidden">
            <h2 id="agenda-h" className="mb-2 text-lg font-bold">This month</h2>
            {monthEvents.length === 0 ? <p className="text-sm text-muted">No events this month.</p> : (
              <ul className="space-y-2">{monthEvents.map((e) => <li key={e.id} className="card py-3"><p className="text-xs text-muted">{formatDateTime(e.starts_at)}</p><Link to={`/events/${e.id}`} className="font-semibold">{e.title}</Link></li>)}</ul>
            )}
          </section>

          <section aria-labelledby="up-h" className="mt-10">
            <h2 id="up-h" className="mb-3 text-2xl font-bold">Upcoming events</h2>
            {upcoming.length === 0 && <EmptyState title="No upcoming events">Check back later.</EmptyState>}
            <ul className="grid gap-3 md:grid-cols-2">
              {upcoming.map((e) => (
                <li key={e.id} className="card">
                  <p className="text-xs text-muted">{formatDateTime(e.starts_at)}{e.category ? ` · ${e.category}` : ''}</p>
                  <h3 className="mt-1 text-lg font-bold"><Link to={`/events/${e.id}`}>{e.title}</Link></h3>
                  {e.location && <p className="text-sm text-muted">{e.location}</p>}
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
