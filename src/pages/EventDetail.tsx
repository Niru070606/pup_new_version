import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useQuery } from '../lib/useQuery';
import { usePageTitle } from '../lib/usePageTitle';
import { formatDate, formatDateTime, isUuid, unwrap } from '../lib/util';
import type { PublicEvent } from '../lib/types';
import ResponsiveImage from '../components/media/ResponsiveImage';
import { EmptyState, ErrorNotice, Loading, StatusBadge } from '../components/ui';

const icsDate = (iso: string) => iso.replace(/[-:]/g, '').replace(/\.\d+/, '');
const icsText = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

function icsFile(e: PublicEvent): string {
  const s = new Date(e.starts_at);
  const end = new Date(e.ends_at ?? new Date(s.getTime() + 3600_000).toISOString());
  const day = (d: Date) => `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
  const when = e.all_day
    ? [`DTSTART;VALUE=DATE:${day(new Date(s.getTime() + 8 * 3600_000))}`, `DTEND;VALUE=DATE:${day(new Date(end.getTime() + 8 * 3600_000 + 86400_000))}`]
    : [`DTSTART:${icsDate(s.toISOString())}`, `DTEND:${icsDate(end.toISOString())}`];
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//PUP Unisan//Events//EN', 'BEGIN:VEVENT', `UID:${e.id}@pup-unisan`, `DTSTAMP:${icsDate(new Date().toISOString())}`, ...when,
    `SUMMARY:${icsText(e.title)}`, ...(e.location ? [`LOCATION:${icsText(e.location)}`] : []), ...(e.description ? [`DESCRIPTION:${icsText(e.description)}`] : []), 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
}

export default function EventDetail() {
  const { id = '' } = useParams();
  const [msg, setMsg] = useState<string | null>(null);
  const q = useQuery(async () => (isUuid(id) ? unwrap<PublicEvent | null>(await supabase.from('public_events').select('*').eq('id', id).maybeSingle()) : null), [id]);
  usePageTitle(q.data?.title ?? 'Event');
  const e = q.data;

  function download() {
    if (!e) return;
    const url = URL.createObjectURL(new Blob([icsFile(e)], { type: 'text/calendar;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'event.ics';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function copy() {
    try { await navigator.clipboard.writeText(window.location.href); setMsg('Link copied.'); } catch { setMsg('Copy failed. Copy the address from your browser.'); }
  }

  return (
    <div className="page mt-10 max-w-3xl">
      <p className="mb-4 text-sm"><Link to="/events">← Back to events calendar</Link></p>
      {q.loading && <Loading />}
      {q.error && <ErrorNotice message="This event could not be loaded." onRetry={q.reload} />}
      {!q.loading && !q.error && !e && <EmptyState title="Event not found">It may have been removed or is not public.</EmptyState>}
      {e && (
        <article>
          <h1 className="text-3xl font-bold">{e.title}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-muted">
            <span>{e.all_day ? formatDate(e.starts_at) : formatDateTime(e.starts_at)}{e.ends_at ? ` – ${e.all_day ? formatDate(e.ends_at) : formatDateTime(e.ends_at)}` : ''}</span>
            {e.category && <StatusBadge label={e.category} tone="neutral" />}
          </div>
          {e.location && <p className="mt-1 text-sm">Location: {e.location}</p>}
          {e.cover_path_medium && (
            <ResponsiveImage className="mt-5 rounded-[var(--radius)]" alt={e.cover_alt ?? ''} eager sizes="(min-width: 768px) 700px, 100vw"
              image={{ path_original: null, path_medium: e.cover_path_medium, path_thumb: e.cover_path_thumb ?? null, width: null, height: null, width_medium: e.cover_width_medium ?? null, width_thumb: null }} />
          )}
          {e.description && <div className="prose-plain mt-6 text-base">{e.description}</div>}
          <div className="no-print mt-6 flex flex-wrap items-center gap-2">
            <button type="button" className="btn btn-primary btn-sm" onClick={download}>Add to calendar (.ics)</button>
            <button type="button" className="btn btn-outline btn-sm" onClick={copy}>Copy link</button>
            <span role="status" className="text-sm text-muted">{msg}</span>
          </div>
        </article>
      )}
    </div>
  );
}
