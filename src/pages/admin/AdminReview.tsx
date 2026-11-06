import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useQuery } from '../../lib/useQuery';
import { check, formatDateTime, unwrap } from '../../lib/util';
import type { AnnouncementImage, AnnouncementOverview } from '../../lib/types';
import { Thumb } from '../../components/media/MediaPicker';
import { ConfirmDialog, EmptyState, ErrorNotice, Loading, PageHeader, StatusBadge, type Pending } from '../../components/ui';

export default function AdminReview() {
  const q = useQuery(async () => {
    const rows = unwrap<AnnouncementOverview[]>(await supabase.from('announcement_overview').select('*').eq('latest_status', 'pending').order('submitted_at', { ascending: true }));
    const ids = rows.map((r) => r.latest_revision_id);
    const imgs = ids.length ? unwrap<AnnouncementImage[]>(await supabase.from('announcement_images').select('*, media:media_assets(*)').in('revision_id', ids).order('position')) : [];
    return { rows, imgs };
  }, []);
  const [pending, setPending] = useState<Pending | null>(null);

  function decide(a: AnnouncementOverview, decision: 'approved' | 'rejected' | 'revision_required') {
    const live = a.status === 'published';
    const copy = {
      approved: { title: 'Approve and publish?', message: live ? 'The new revision replaces the current public version immediately.' : 'The announcement becomes public immediately.', label: 'Approve and publish', danger: false, reason: false },
      rejected: { title: 'Reject this submission?', message: 'It stays private. The submitter will see your reason.', label: 'Reject', danger: true, reason: true },
      revision_required: { title: 'Request a revision?', message: 'It stays private. The submitter will see what to change and can resubmit.', label: 'Request revision', danger: false, reason: true },
    }[decision];
    setPending({
      title: copy.title,
      message: `"${a.title}" — ${copy.message}`,
      confirmLabel: copy.label,
      danger: copy.danger,
      requireReason: copy.reason,
      reasonLabel: 'Reason for the submitter',
      run: async (reason) => check(await supabase.rpc('review_announcement', { p_revision_id: a.latest_revision_id, p_decision: decision, p_reason: reason || null })),
    });
  }

  return (
    <>
      <PageHeader title="Announcement review queue" intro="Oldest submissions first. Read the full content before deciding. Approval publishes immediately." />
      {q.loading && <Loading />}
      {q.error && <ErrorNotice message={q.error} onRetry={q.reload} />}
      {q.data && q.data.rows.length === 0 && <EmptyState title="Nothing is waiting for review" />}
      <ul className="space-y-4">
        {q.data?.rows.map((a) => (
          <li key={a.latest_revision_id} className="card">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="text-lg font-bold">{a.title}</h2>
                <p className="text-xs text-muted">
                  By {a.author_name || 'Unknown'}{a.author_department ? `, ${a.author_department}` : ''} · Submitted {formatDateTime(a.submitted_at)} · Version {a.latest_version}
                </p>
              </div>
              <div className="flex gap-2">
                {a.category && <StatusBadge label={a.category} tone="neutral" />}
                {a.status === 'published' && <StatusBadge label="Revision of live announcement" tone="info" />}
              </div>
            </div>
            <p className="mt-2 text-sm text-muted">Issuing office: {a.issuing_office}</p>
            {(a.publish_at || a.expires_at) && (
              <p className="mt-1 text-sm text-muted">
                {a.publish_at ? `Requested publication: ${formatDateTime(a.publish_at)}` : 'Publish on approval'}{a.expires_at ? ` · Expires: ${formatDateTime(a.expires_at)}` : ''}
              </p>
            )}
            <div className="prose-plain mt-3 max-h-80 overflow-y-auto rounded border border-line bg-surface p-3 text-sm">{a.body}</div>
            {(() => {
              const imgs = (q.data?.imgs ?? []).filter((i) => i.revision_id === a.latest_revision_id);
              return imgs.length > 0 && (
                <div className="mt-3">
                  <p className="text-sm font-semibold">Images ({imgs.length})</p>
                  <ul className="mt-1 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {imgs.map((i) => (
                      <li key={i.id} className="text-xs">
                        <span className="block aspect-[4/3] overflow-hidden rounded border border-line bg-surface">{i.media && <Thumb asset={i.media} />}</span>
                        <span className="mt-1 block font-medium">{i.role === 'cover' ? 'Cover' : `Inline ${i.position}`}</span>
                        <span className="block text-muted">Alt: {i.alt_text || '(missing)'}</span>
                        {i.caption && <span className="block text-muted">Caption: {i.caption}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })()}
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" className="btn btn-primary btn-sm" onClick={() => decide(a, 'approved')}>Approve and publish</button>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => decide(a, 'revision_required')}>Request revision</button>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => decide(a, 'rejected')}>Reject</button>
            </div>
          </li>
        ))}
      </ul>
      <ConfirmDialog pending={pending} onClose={() => setPending(null)} onDone={q.reload} />
    </>
  );
}
