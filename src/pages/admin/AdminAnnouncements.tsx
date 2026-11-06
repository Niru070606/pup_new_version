import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useQuery } from '../../lib/useQuery';
import { announcementStatusInfo, check, formatDateTime, unwrap } from '../../lib/util';
import type { AnnouncementOverview, AnnouncementStatus } from '../../lib/types';
import { ConfirmDialog, EmptyState, ErrorNotice, Loading, PageHeader, StatusBadge, type Pending } from '../../components/ui';

const TABS: { key: AnnouncementStatus; label: string }[] = [
  { key: 'published', label: 'Published' },
  { key: 'unpublished', label: 'Unpublished' },
  { key: 'archived', label: 'Archived' },
];

export default function AdminAnnouncements() {
  const [tab, setTab] = useState<AnnouncementStatus>('published');
  const q = useQuery(
    async () => unwrap<AnnouncementOverview[]>(await supabase.from('announcement_overview').select('*').eq('status', tab).order('published_at', { ascending: false, nullsFirst: false })),
    [tab],
  );
  const [pending, setPending] = useState<Pending | null>(null);

  function act(a: AnnouncementOverview, action: 'unpublish' | 'archive' | 'republish') {
    const text = {
      unpublish: { t: 'Unpublish this announcement?', m: 'It is removed from the public site immediately. You can republish it later.', l: 'Unpublish', d: true },
      archive: { t: 'Archive this announcement?', m: 'It is removed from the public site and kept for records.', l: 'Archive', d: true },
      republish: { t: 'Republish this announcement?', m: 'It returns to the public site with a new publication time.', l: 'Republish', d: false },
    }[action];
    setPending({
      title: text.t,
      message: `"${a.live_title ?? a.title}" — ${text.m}`,
      confirmLabel: text.l,
      danger: text.d,
      run: async () => check(await supabase.rpc('set_announcement_status', { p_id: a.id, p_action: action })),
    });
  }

  return (
    <>
      <PageHeader
        title="Announcements"
        intro="Manage live announcements. New or edited content still goes through the review queue."
        actions={<Link to="/admin/announcements/new" className="btn btn-primary">Create announcement</Link>}
      />
      <div role="tablist" aria-label="Announcement status" className="mb-4 flex gap-2">
        {TABS.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
            className={`btn btn-sm ${tab === t.key ? 'btn-primary' : 'btn-outline'}`}>{t.label}</button>
        ))}
      </div>
      {q.loading && <Loading />}
      {q.error && <ErrorNotice message={q.error} onRetry={q.reload} />}
      {q.data && q.data.length === 0 && <EmptyState title={`No ${tab} announcements`} />}
      <ul className="space-y-3">
        {q.data?.map((a) => (
          <li key={a.id} className="card">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="text-lg font-bold">{a.live_title ?? a.title}</h2>
                <p className="text-xs text-muted">By {a.author_name || 'Unknown'} · Published {formatDateTime(a.published_at)}</p>
                {(a.publish_at || a.expires_at) && (
                  <p className="text-xs text-muted">
                    {a.published_at && new Date(a.published_at) > new Date() ? `Scheduled: goes live ${formatDateTime(a.published_at)}` : ''}
                    {a.expires_at ? `${a.published_at && new Date(a.published_at) > new Date() ? ' · ' : ''}${new Date(a.expires_at) < new Date() ? 'Expired' : 'Expires'} ${formatDateTime(a.expires_at)}` : ''}
                  </p>
                )}
              </div>
              <StatusBadge {...announcementStatusInfo(a)} />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {a.status === 'published' && (
                <>
                  <Link to={`/announcements/${a.id}`} className="btn btn-outline btn-sm">View public page</Link>
                  <Link to={`/admin/announcements/${a.id}/edit`} className="btn btn-outline btn-sm">Edit (new revision)</Link>
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => act(a, 'unpublish')}>Unpublish</button>
                </>
              )}
              {a.status === 'unpublished' && <button type="button" className="btn btn-primary btn-sm" onClick={() => act(a, 'republish')}>Republish</button>}
              {(a.status === 'published' || a.status === 'unpublished') && <button type="button" className="btn btn-outline btn-sm" onClick={() => act(a, 'archive')}>Archive</button>}
            </div>
          </li>
        ))}
      </ul>
      <ConfirmDialog pending={pending} onClose={() => setPending(null)} onDone={q.reload} />
    </>
  );
}
