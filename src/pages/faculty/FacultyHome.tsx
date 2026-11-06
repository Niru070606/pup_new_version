import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { useQuery } from '../../lib/useQuery';
import { announcementStatusInfo, formatDate, unwrap } from '../../lib/util';
import type { AnnouncementOverview, PublicAnnouncement } from '../../lib/types';
import { EmptyState, ErrorNotice, Loading, PageHeader, StatusBadge } from '../../components/ui';

export default function FacultyHome() {
  const { profile } = useAuth();
  const mine = useQuery(
    async () => unwrap<AnnouncementOverview[]>(await supabase.from('announcement_overview').select('*').eq('author_id', profile!.id).order('updated_at', { ascending: false })),
    [profile?.id],
  );
  const notices = useQuery(
    async () => unwrap<PublicAnnouncement[]>(await supabase.from('public_announcements').select('*').eq('category', 'Official Notices').order('published_at', { ascending: false }).limit(5)),
    [],
  );

  const rows = mine.data ?? [];
  const stats = [
    { label: 'Drafts', n: rows.filter((r) => r.latest_status === 'draft').length },
    { label: 'Pending approval', n: rows.filter((r) => r.latest_status === 'pending').length },
    { label: 'Published', n: rows.filter((r) => r.status === 'published').length },
    { label: 'Need changes', n: rows.filter((r) => r.latest_status === 'rejected' || r.latest_status === 'revision_required').length },
  ];
  const attention = rows.filter((r) => r.latest_status === 'rejected' || r.latest_status === 'revision_required');

  return (
    <>
      <PageHeader
        title={`Welcome, ${profile?.full_name || 'colleague'}`}
        intro="Submit announcements for administrator review and track their status. Nothing you submit is public until an administrator approves it."
        actions={<Link to="/dashboard/announcements/new" className="btn btn-primary">Create announcement</Link>}
      />
      {mine.loading && <Loading />}
      {mine.error && <ErrorNotice message={mine.error} onRetry={mine.reload} />}
      {mine.data && (
        <>
          <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {stats.map((s) => (
              <li key={s.label} className="card py-4">
                <p className="text-2xl font-bold text-maroon-strong">{s.n}</p>
                <p className="text-sm text-muted">{s.label}</p>
              </li>
            ))}
          </ul>

          <section className="mt-8" aria-labelledby="att-h">
            <h2 id="att-h" className="mb-3 text-xl font-bold">Needs your attention</h2>
            {attention.length === 0 ? (
              <EmptyState title="Nothing needs changes right now" />
            ) : (
              <ul className="space-y-2">
                {attention.map((a) => {
                  const s = announcementStatusInfo(a);
                  return (
                    <li key={a.id} className="card flex flex-wrap items-center justify-between gap-2 py-3">
                      <span className="font-medium">{a.title}</span>
                      <span className="flex items-center gap-3">
                        <StatusBadge {...s} />
                        <Link to={`/dashboard/announcements/${a.id}/edit`}>Review feedback</Link>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}

      <section className="mt-8" aria-labelledby="not-h">
        <h2 id="not-h" className="mb-3 text-xl font-bold">Campus notices</h2>
        {notices.data && notices.data.length === 0 && <EmptyState title="No official notices published yet" />}
        <ul className="space-y-2">
          {notices.data?.map((n) => (
            <li key={n.id} className="card py-3">
              <Link to={`/announcements/${n.id}`} className="font-medium">{n.title}</Link>
              <span className="ml-2 text-xs text-muted">{formatDate(n.published_at)}</span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
