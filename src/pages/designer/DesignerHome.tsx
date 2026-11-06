import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { useQuery } from '../../lib/useQuery';
import { check, formatDateTime, unwrap } from '../../lib/util';
import type { DesignRevision, LinkRevision } from '../../lib/types';
import { ConfirmDialog, EmptyState, ErrorNotice, Loading, PageHeader, RevisionBadge, type Pending } from '../../components/ui';

export default function DesignerHome() {
  const { profile } = useAuth();
  const [pending, setPending] = useState<Pending | null>(null);
  const q = useQuery(async () => {
    const designs = unwrap<DesignRevision[]>(
      await supabase
        .from("design_revisions")
        .select(
          "id,version,name,author_id,config,status,based_on,note,submitted_at,reviewed_at,review_reason,approved_at,created_at,updated_at",
        )
        .eq("author_id", profile!.id)
        .order("updated_at", { ascending: false })
        .limit(50),
    );
    const links = unwrap<LinkRevision[]>(
      await supabase
        .from("link_revisions")
        .select(
          "id,version,author_id,status,note,submitted_at,reviewed_at,review_reason,approved_at,snapshot",
        )
        .order("submitted_at", { ascending: false })
        .limit(1),
    );
    return { designs, link: links[0] ?? null };
  }, [profile?.id]);

  function askDelete(d: DesignRevision) {
    setPending({ title: `Delete "${d.name}"?`, message: 'This unfinished design is removed permanently.', confirmLabel: 'Delete', danger: true, run: async () => check(await supabase.rpc('delete_design_draft', { p_id: d.id })) });
  }

  return (
    <>
      <PageHeader title="Designer dashboard" intro="Prepare design and link changes here. Only an administrator can approve and publish them: nothing you save goes live on its own."
        actions={<Link to="/designer/editor" className="btn btn-primary">New design from live site</Link>} />
      <ul className="mb-8 grid gap-3 sm:grid-cols-3">
        <li className="card"><Link to="/designer/editor">Visual editor</Link><p className="text-xs text-muted">Colours, fonts, layout, hero, carousel.</p></li>
        <li className="card"><Link to="/designer/media">Media library</Link><p className="text-xs text-muted">Upload and organize design images.</p></li>
        <li className="card"><Link to="/designer/links">Links directory</Link><p className="text-xs text-muted">Edit link groups and submit them.</p></li>
      </ul>
      {q.loading && <Loading />}
      {q.error && <ErrorNotice message={q.error} onRetry={q.reload} />}
      {q.data && (
        <>
          <section aria-labelledby="my-designs" className="mb-8">
            <h2 id="my-designs" className="mb-3 text-xl font-bold">My designs</h2>
            {q.data.designs.length === 0 && <EmptyState title="No designs yet">Start one from the current live site.</EmptyState>}
            <ul className="space-y-3">
              {q.data.designs.map((d) => {
                const editable = ['draft', 'rejected', 'revision_required'].includes(d.status);
                return (
                  <li key={d.id} className="card">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div><h3 className="text-lg font-bold">{d.name}</h3><p className="text-xs text-muted">Version {d.version} · Updated {formatDateTime(d.updated_at)}</p></div>
                      <RevisionBadge status={d.status} />
                    </div>
                    {d.review_reason && ['rejected', 'revision_required'].includes(d.status) && (
                      <div className="alert alert-warning mt-3"><p className="font-semibold">Administrator feedback</p><p className="prose-plain mt-1">{d.review_reason}</p></div>
                    )}
                    {d.status === 'pending' && <p className="mt-3 text-sm text-muted">Waiting for an administrator.</p>}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Link to={`/designer/editor/${d.id}`} className="btn btn-outline btn-sm">{editable ? 'Edit' : 'View'}</Link>
                      {editable && <button type="button" className="btn btn-outline btn-sm" onClick={() => askDelete(d)}>Delete</button>}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
          <section aria-labelledby="my-links">
            <h2 id="my-links" className="mb-3 text-xl font-bold">Links directory</h2>
            {q.data.link ? (
              <div className="card flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm">Latest submission #{q.data.link.version} · {formatDateTime(q.data.link.submitted_at)}</p>
                <RevisionBadge status={q.data.link.status} />
                {q.data.link.review_reason && <p className="w-full text-sm">{q.data.link.review_reason}</p>}
              </div>
            ) : <EmptyState title="No link submissions yet" />}
          </section>
        </>
      )}
      <ConfirmDialog pending={pending} onClose={() => setPending(null)} onDone={q.reload} />
    </>
  );
}
