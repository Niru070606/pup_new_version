import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { useQuery } from '../../lib/useQuery';
import { announcementStatusInfo, formatDateTime, isEditable, unwrap } from '../../lib/util';
import type { AnnouncementOverview, Review } from '../../lib/types';
import { EmptyState, ErrorNotice, Loading, PageHeader, StatusBadge } from '../../components/ui';

export default function MyAnnouncements() {
  const { profile } = useAuth();
  const notice = ((useLocation().state ?? {}) as { notice?: string }).notice;

  const q = useQuery(async () => {
    const rows = unwrap<AnnouncementOverview[]>(
      await supabase.from('announcement_overview').select('*').eq('author_id', profile!.id).order('updated_at', { ascending: false }),
    );
    const ids = rows.filter((r) => r.latest_status === 'rejected' || r.latest_status === 'revision_required').map((r) => r.latest_revision_id);
    let reviews: Review[] = [];
    if (ids.length) {
      reviews = unwrap<Review[]>(await supabase.from('announcement_reviews').select('revision_id,decision,reason,created_at').in('revision_id', ids).order('created_at', { ascending: false }));
    }
    return { rows, reviews };
  }, [profile?.id]);

  return (
    <>
      <PageHeader
        title="My announcements"
        intro="Drafts, submissions and their status. Rejected or revision-required items show the administrator's reason."
        actions={<Link to="/dashboard/announcements/new" className="btn btn-primary">Create announcement</Link>}
      />
      {notice && <div role="status" className="alert alert-success mb-4">{notice}</div>}
      {q.loading && <Loading />}
      {q.error && <ErrorNotice message={q.error} onRetry={q.reload} />}
      {q.data && q.data.rows.length === 0 && <EmptyState title="You have not created any announcements yet">Create one and submit it for administrator review.</EmptyState>}
      <ul className="space-y-3">
        {q.data?.rows.map((a) => {
          const s = announcementStatusInfo(a);
          const review = q.data!.reviews.find((r) => r.revision_id === a.latest_revision_id);
          const editable = isEditable(a);
          return (
            <li key={a.id} className="card">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="text-lg font-bold">{a.title}</h2>
                  <p className="text-xs text-muted">
                    {a.category ?? 'No category'} · Last updated {formatDateTime(a.updated_at)}
                    {a.latest_version > 1 ? ` · Version ${a.latest_version}` : ''}
                  </p>
                </div>
                <StatusBadge {...s} />
              </div>
              {(a.publish_at || a.expires_at) && (
                <p className="mt-2 text-xs text-muted">
                  {a.publish_at ? `Scheduled to publish ${formatDateTime(a.publish_at)}` : ''}{a.publish_at && a.expires_at ? ' · ' : ''}{a.expires_at ? `Expires ${formatDateTime(a.expires_at)}` : ''}
                </p>
              )}
              {review && (
                <div className="alert alert-warning mt-3">
                  <p className="font-semibold">{review.decision === 'rejected' ? 'Rejected' : 'Revision requested'} on {formatDateTime(review.created_at)}</p>
                  <p className="prose-plain mt-1">{review.reason}</p>
                </div>
              )}
              {a.latest_status === 'pending' && <p className="mt-3 text-sm text-muted">Awaiting administrator review. You cannot edit it until a decision is made.</p>}
              <div className="mt-3 flex flex-wrap gap-3 text-sm">
                {editable && (
                  <Link to={`/dashboard/announcements/${a.id}/edit`} className="btn btn-outline btn-sm">
                    {a.status === 'published' ? 'Edit (creates a revision)' : a.latest_status === 'draft' ? 'Edit draft' : 'Revise and resubmit'}
                  </Link>
                )}
                {a.status === 'published' && <Link to={`/announcements/${a.id}`}>View public page</Link>}
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
