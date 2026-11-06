import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useQuery } from '../../lib/useQuery';
import { assetToRef } from '../../lib/media';
import { sanitizeDesign } from '../../lib/design';
import { check, formatDateTime, unwrap } from '../../lib/util';
import type { DesignRevision, ImageRef, MediaAsset } from '../../lib/types';
import SitePreview from '../../components/design/SitePreview';
import { ConfirmDialog, EmptyState, ErrorNotice, Loading, PageHeader, RevisionBadge, StatusBadge, type Pending } from '../../components/ui';

type Row = DesignRevision & { author: { full_name: string; email: string } | null };

/** Administrators review designer submissions here, publish them, and restore earlier approved designs. */
export default function AdminDesign() {
  const [tab, setTab] = useState<'pending' | 'history'>('pending');
  const [mode, setMode] = useState<'desktop' | 'mobile'>('desktop');
  const [openId, setOpenId] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);

  const q = useQuery(async () => {
    const revs = unwrap<DesignRevision[]>(await supabase.from('design_revisions').select('*').order('updated_at', { ascending: false }).limit(200));
    const ids = [...new Set(revs.map((r) => r.author_id))];
    const people = ids.length ? unwrap<{ id: string; full_name: string; email: string }[]>(await supabase.rpc('admin_list_users')).filter((u) => ids.includes(u.id)) : [];
    const state = unwrap<{ live_revision_id: string | null }[]>(await supabase.from('site_design_state').select('live_revision_id'));
    const assets = unwrap<MediaAsset[]>(await supabase.from('media_assets').select('*').eq('purpose', 'design').eq('status', 'ready').limit(500));
    const rows: Row[] = revs.map((r) => ({ ...r, author: people.find((p) => p.id === r.author_id) ?? null }));
    return { rows, live: state[0]?.live_revision_id ?? null, assets };
  }, []);

  const resolve = useMemo(() => {
    const m = new Map<string, ImageRef>((q.data?.assets ?? []).map((a) => [a.id, assetToRef(a)]));
    return (id: string) => m.get(id) ?? null;
  }, [q.data]);

  const waiting = (q.data?.rows ?? []).filter((r) => r.status === 'pending');
  const history = (q.data?.rows ?? []).filter((r) => r.status !== 'draft');

  function decide(r: Row, decision: 'approved' | 'revision_required' | 'rejected') {
    const label = { approved: 'Approve and publish', revision_required: 'Request changes', rejected: 'Reject' }[decision];
    setPending({
      title: `${label}: "${r.name}"?`,
      message: decision === 'approved' ? 'This design becomes the live public website immediately. You can restore the previous design from the History tab.' : 'The designer sees your reason and can revise it.',
      confirmLabel: label, danger: decision === 'rejected', requireReason: decision !== 'approved', reasonLabel: 'Reason (shown to the designer)',
      run: async (reason) => check(await supabase.rpc('review_design', { p_id: r.id, p_decision: decision, p_reason: reason || null })),
    });
  }
  function restore(r: Row | null) {
    setPending({
      title: r ? `Restore "${r.name}" (version ${r.version})?` : 'Reset to the original look?',
      message: r ? 'This approved design becomes the live website again.' : 'The built-in original design is shown to visitors. Saved designs are kept.',
      confirmLabel: 'Restore', run: async () => check(await supabase.rpc('rollback_design', { p_id: r?.id ?? null })),
    });
  }

  return (
    <>
      <PageHeader title="Design approvals" intro="Only designs approved here can go live. Review the preview in desktop and mobile size before deciding."
        actions={<Link to="/admin/design/editor" className="btn btn-outline">Create my own design draft</Link>} />
      <div role="tablist" aria-label="Design views" className="mb-4 flex gap-2">
        <button type="button" role="tab" aria-selected={tab === 'pending'} className={`btn btn-sm ${tab === 'pending' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setTab('pending')}>Awaiting approval ({waiting.length})</button>
        <button type="button" role="tab" aria-selected={tab === 'history'} className={`btn btn-sm ${tab === 'history' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setTab('history')}>History and rollback</button>
      </div>
      {q.loading && <Loading />}
      {q.error && <ErrorNotice message={q.error} onRetry={q.reload} />}
      {q.data && tab === 'pending' && (
        <>
          {waiting.length === 0 && <EmptyState title="Nothing is waiting for approval" />}
          <ul className="space-y-4">
            {waiting.map((r) => (
              <li key={r.id} className="card">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 className="text-lg font-bold">{r.name}</h2>
                    <p className="text-xs text-muted">By {r.author?.full_name || r.author?.email || 'Unknown'} · submitted {formatDateTime(r.submitted_at)}</p>
                    {r.note && <p className="mt-1 text-sm">Note: {r.note}</p>}
                  </div>
                  <RevisionBadge status={r.status} />
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" className="btn btn-outline btn-sm" aria-expanded={openId === r.id} onClick={() => setOpenId(openId === r.id ? null : r.id)}>{openId === r.id ? 'Hide preview' : 'Show preview'}</button>
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => decide(r, 'approved')}>Approve and publish</button>
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => decide(r, 'revision_required')}>Request changes</button>
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => decide(r, 'rejected')}>Reject</button>
                </div>
                {openId === r.id && (
                  <div className="mt-4">
                    <div className="mb-2 flex gap-2" role="group" aria-label="Preview size">
                      <button type="button" aria-pressed={mode === 'desktop'} className={`btn btn-sm ${mode === 'desktop' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setMode('desktop')}>Desktop</button>
                      <button type="button" aria-pressed={mode === 'mobile'} className={`btn btn-sm ${mode === 'mobile' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setMode('mobile')}>Mobile</button>
                    </div>
                    <div className="overflow-auto rounded border border-line bg-surface p-2">
                      <SitePreview cfg={sanitizeDesign(r.config)} resolve={resolve} mode={mode} />
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      {q.data && tab === 'history' && (
        <>
          <p className="mb-3 flex flex-wrap items-center gap-3 text-sm">
            {q.data.live ? 'A designer-made design is live.' : 'The original built-in look is live.'}
            {q.data.live && <button type="button" className="btn btn-outline btn-sm" onClick={() => restore(null)}>Reset to the original look</button>}
          </p>
          {history.length === 0 && <EmptyState title="No design history yet" />}
          <ul className="space-y-3">
            {history.map((r) => (
              <li key={r.id} className="card">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 className="text-base font-bold">{r.name} <span className="text-xs font-normal text-muted">v{r.version}</span></h2>
                    <p className="text-xs text-muted">By {r.author?.full_name || r.author?.email || 'Unknown'} · {r.approved_at ? `approved ${formatDateTime(r.approved_at)}` : `updated ${formatDateTime(r.updated_at)}`}</p>
                    {r.review_reason && <p className="mt-1 text-sm">Reason: {r.review_reason}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    {q.data!.live === r.id && <StatusBadge label="Live now" tone="success" />}
                    <RevisionBadge status={r.status} />
                  </div>
                </div>
                {r.status === 'approved' && q.data!.live !== r.id && (
                  <p className="mt-3"><button type="button" className="btn btn-outline btn-sm" onClick={() => restore(r)}>Restore this version</button></p>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      <ConfirmDialog pending={pending} onClose={() => setPending(null)} onDone={q.reload} />
    </>
  );
}
