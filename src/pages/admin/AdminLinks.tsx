import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useQuery } from '../../lib/useQuery';
import { check, formatDateTime, unwrap } from '../../lib/util';
import type { LinkRevision } from '../../lib/types';
import { ConfirmDialog, EmptyState, ErrorNotice, Loading, PageHeader, RevisionBadge, StatusBadge, type Pending } from '../../components/ui';

type Snap = LinkRevision['snapshot'];
const flat = (s: Snap | undefined) => new Map((s?.groups ?? []).flatMap((g) => g.links.map((l) => [l.id, `${l.title}|${l.url}|${l.hidden}|${l.description ?? ''}`] as const)));

function diff(next: Snap, live: Snap | undefined) {
  const a = flat(live), b = flat(next);
  let added = 0, removed = 0, changed = 0;
  for (const [id, v] of b) { if (!a.has(id)) added++; else if (a.get(id) !== v) changed++; }
  for (const id of a.keys()) if (!b.has(id)) removed++;
  return { added, removed, changed };
}

export default function AdminLinks() {
  const [tab, setTab] = useState<'pending' | 'history'>('pending');
  const [openId, setOpenId] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const q = useQuery(async () => {
    const revs = unwrap<LinkRevision[]>(await supabase.from('link_revisions').select('*').order('submitted_at', { ascending: false }).limit(100));
    const users = unwrap<{ id: string; full_name: string; email: string }[]>(await supabase.rpc('admin_list_users'));
    const st = unwrap<{ live_revision_id: string | null }[]>(await supabase.from('site_links_state').select('live_revision_id'));
    return { revs: revs.map((r) => ({ ...r, author: users.find((u) => u.id === r.author_id) ?? null })), live: st[0]?.live_revision_id ?? null };
  }, []);
  const liveSnap = q.data?.revs.find((r) => r.id === q.data?.live)?.snapshot;
  const waiting = (q.data?.revs ?? []).filter((r) => r.status === 'pending');

  function decide(r: LinkRevision, d: 'approved' | 'revision_required' | 'rejected') {
    const label = { approved: 'Approve and publish', revision_required: 'Request changes', rejected: 'Reject' }[d];
    setPending({
      title: `${label}?`, message: d === 'approved' ? 'This version of the links directory becomes public immediately.' : 'The designer sees your reason.', confirmLabel: label,
      danger: d === 'rejected', requireReason: d !== 'approved', reasonLabel: 'Reason (shown to the designer)',
      run: async (reason) => check(await supabase.rpc('review_link_revision', { p_id: r.id, p_decision: d, p_reason: reason || null })),
    });
  }
  const restore = (id: string | null, v?: number) => setPending({
    title: id ? `Restore links version ${v}?` : 'Unpublish the whole links directory?', message: id ? 'That approved version becomes public again.' : 'Visitors will see no links until a new version is approved.',
    confirmLabel: id ? 'Restore' : 'Unpublish', danger: !id, run: async () => check(await supabase.rpc('rollback_links', { p_id: id })),
  });

  const Preview = ({ s }: { s: Snap }) => (
    <div className="mt-3 space-y-3">
      {s.groups.map((g) => (
        <div key={g.id} className="rounded border border-line p-3">
          <p className="font-serif font-bold">{g.title} {g.hidden && <StatusBadge label="Hidden" tone="neutral" />}</p>
          {g.links.length === 0 ? <p className="text-xs text-muted">No links</p> : (
            <ul className="mt-1 space-y-1 text-sm">{g.links.map((l) => <li key={l.id}><span className="font-medium">{l.title}</span> <span className="break-all text-xs text-muted">{l.url}</span> {l.hidden && <StatusBadge label="Hidden" tone="neutral" />}</li>)}</ul>
          )}
        </div>
      ))}
    </div>
  );

  return (
    <>
      <PageHeader title="Links approvals" intro="Review designers’ link changes. Only approved versions are shown on the public Links page."
        actions={<Link to="/admin/links/edit" className="btn btn-outline">Edit links draft</Link>} />
      <div role="tablist" aria-label="Links views" className="mb-4 flex gap-2">
        <button type="button" role="tab" aria-selected={tab === 'pending'} className={`btn btn-sm ${tab === 'pending' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setTab('pending')}>Awaiting approval ({waiting.length})</button>
        <button type="button" role="tab" aria-selected={tab === 'history'} className={`btn btn-sm ${tab === 'history' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setTab('history')}>History and rollback</button>
      </div>
      {q.loading && <Loading />}
      {q.error && <ErrorNotice message={q.error} onRetry={q.reload} />}
      {q.data && tab === 'pending' && waiting.length === 0 && <EmptyState title="Nothing is waiting for approval" />}
      {q.data && tab === 'pending' && (
        <ul className="space-y-4">
          {waiting.map((r) => {
            const d = diff(r.snapshot, liveSnap);
            return (
              <li key={r.id} className="card">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 className="text-lg font-bold">Version {r.version}</h2>
                    <p className="text-xs text-muted">By {r.author?.full_name || r.author?.email || 'Unknown'} · {formatDateTime(r.submitted_at)}</p>
                    <p className="mt-1 text-sm">Compared with live: {d.added} added, {d.changed} changed, {d.removed} removed.</p>
                    {r.note && <p className="text-sm">Note: {r.note}</p>}
                  </div>
                  <RevisionBadge status={r.status} />
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" className="btn btn-outline btn-sm" aria-expanded={openId === r.id} onClick={() => setOpenId(openId === r.id ? null : r.id)}>{openId === r.id ? 'Hide contents' : 'Show contents'}</button>
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => decide(r, 'approved')}>Approve and publish</button>
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => decide(r, 'revision_required')}>Request changes</button>
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => decide(r, 'rejected')}>Reject</button>
                </div>
                {openId === r.id && <Preview s={r.snapshot} />}
              </li>
            );
          })}
        </ul>
      )}
      {q.data && tab === 'history' && (
        <>
          {q.data.live && <p className="mb-3"><button type="button" className="btn btn-outline btn-sm" onClick={() => restore(null)}>Unpublish all links</button></p>}
          {q.data.revs.length === 0 && <EmptyState title="No history yet" />}
          <ul className="space-y-3">
            {q.data.revs.map((r) => (
              <li key={r.id} className="card">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div><h2 className="text-base font-bold">Version {r.version}</h2><p className="text-xs text-muted">{r.author?.full_name || r.author?.email} · {formatDateTime(r.submitted_at)}</p>{r.review_reason && <p className="text-sm">Reason: {r.review_reason}</p>}</div>
                  <div className="flex items-center gap-2">{q.data!.live === r.id && <StatusBadge label="Live now" tone="success" />}<RevisionBadge status={r.status} /></div>
                </div>
                {r.status === 'approved' && q.data!.live !== r.id && <p className="mt-3"><button type="button" className="btn btn-outline btn-sm" onClick={() => restore(r.id, r.version)}>Restore this version</button></p>}
              </li>
            ))}
          </ul>
        </>
      )}
      <ConfirmDialog pending={pending} onClose={() => setPending(null)} onDone={q.reload} />
    </>
  );
}
