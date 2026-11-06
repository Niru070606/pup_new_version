import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useQuery } from '../lib/useQuery';
import { usePageTitle } from '../lib/usePageTitle';
import { formatDateTime, isUuid, unwrap } from '../lib/util';
import type { PublicAnnouncement, PublicAnnouncementImage } from '../lib/types';
import AnnouncementCard, { coverRef } from '../components/AnnouncementCard';
import ResponsiveImage from '../components/media/ResponsiveImage';
import { EmptyState, ErrorNotice, Loading, StatusBadge } from '../components/ui';

function Figure({ img }: { img: PublicAnnouncementImage }) {
  return (
    <figure className="my-5">
      <ResponsiveImage image={img} alt={img.alt_text} sizes="(min-width: 768px) 700px, 100vw" className="rounded-[var(--radius)]" />
      {img.caption && <figcaption className="mt-1 text-sm text-muted">{img.caption}</figcaption>}
    </figure>
  );
}

/** Plain-text body (React escapes everything). {{image:N}} places the N-th inline image; unplaced images follow the text. */
function Body({ text, images }: { text: string; images: PublicAnnouncementImage[] }) {
  const used = new Set<number>();
  const out: ReactNode[] = [];
  text.split(/(\{\{image:\d+\}\})/g).forEach((part, i) => {
    const m = part.match(/^\{\{image:(\d+)\}\}$/);
    if (!m) { if (part) out.push(<span key={i} className="prose-plain">{part}</span>); return; }
    const n = parseInt(m[1], 10);
    const img = images[n - 1];
    if (img && !used.has(n)) { used.add(n); out.push(<Figure key={i} img={img} />); }
  });
  const rest = images.filter((_, k) => !used.has(k + 1));
  return (
    <div className="mt-6 text-base">
      <div>{out}</div>
      {rest.length > 0 && <div className="mt-4">{rest.map((img) => <Figure key={img.asset_id} img={img} />)}</div>}
    </div>
  );
}

export default function AnnouncementDetail() {
  const { id = '' } = useParams();
  const [copied, setCopied] = useState<string | null>(null);
  const q = useQuery(async () => {
    if (!isUuid(id)) return null;
    const a = unwrap<PublicAnnouncement | null>(await supabase.from('public_announcements').select('*').eq('id', id).maybeSingle());
    if (!a) return null;
    const imgs = unwrap<PublicAnnouncementImage[]>(await supabase.from('public_announcement_images').select('*').eq('announcement_id', id).order('position'));
    const rel = await supabase.rpc('get_related_announcements', { p_id: id, p_limit: 3 });
    return { a, inline: imgs.filter((i) => i.role === 'inline'), related: (rel.data ?? []) as PublicAnnouncement[] };
  }, [id]);
  usePageTitle(q.data?.a.title ?? 'Announcement');

  const url = typeof window !== 'undefined' ? window.location.href : '';
  async function copy() {
    try { await navigator.clipboard.writeText(url); setCopied('Link copied.'); } catch { setCopied('Copy failed. Select the address bar to copy the link.'); }
  }
  async function share() {
    try { await navigator.share({ title: q.data?.a.title, url }); } catch { /* cancelled */ }
  }

  const a = q.data?.a;
  const cover = a ? coverRef(a) : null;
  return (
    <div className="page mt-10 max-w-3xl">
      <p className="mb-4 text-sm"><Link to="/announcements">← Back to announcements</Link></p>
      {q.loading && <Loading />}
      {q.error && <ErrorNotice message="This announcement could not be loaded." onRetry={q.reload} />}
      {!q.loading && !q.error && !a && <EmptyState title="Announcement not found">It may have been removed, expired or is not publicly available.</EmptyState>}
      {a && q.data && (
        <>
          <article>
            <h1 className="text-3xl font-bold">{a.title}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-muted">
              <time dateTime={a.published_at}>Published {formatDateTime(a.published_at)}</time>
              {a.category && <StatusBadge label={a.category} tone="neutral" />}
            </div>
            <p className="mt-1 text-sm text-muted">Issued by {a.issuing_office}{a.author_name ? ` · Posted by ${a.author_name}` : ''}</p>
            {a.expires_at && <p className="mt-1 text-sm text-muted">Valid until {formatDateTime(a.expires_at)}</p>}
            {cover && (
              <figure className="mt-5">
                <ResponsiveImage image={cover} alt={a.cover_alt ?? ''} eager sizes="(min-width: 768px) 700px, 100vw" className="rounded-[var(--radius)]" />
                {a.cover_caption && <figcaption className="mt-1 text-sm text-muted">{a.cover_caption}</figcaption>}
              </figure>
            )}
            <Body text={a.body} images={q.data.inline} />
          </article>
          <section aria-labelledby="share-h" className="no-print mt-8 border-t border-line pt-4">
            <h2 id="share-h" className="text-lg font-bold">Share this announcement</h2>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button type="button" className="btn btn-outline btn-sm" onClick={copy}>Copy link</button>
              {typeof navigator !== 'undefined' && 'share' in navigator && <button type="button" className="btn btn-outline btn-sm" onClick={share}>Share…</button>}
              <span role="status" className="text-sm text-muted">{copied}</span>
            </div>
          </section>
          {q.data.related.length > 0 && (
            <section aria-labelledby="rel-h" className="no-print mt-8">
              <h2 id="rel-h" className="mb-3 text-xl font-bold">Related announcements</h2>
              <div className="space-y-4">{q.data.related.map((r) => <AnnouncementCard key={r.id} a={r} />)}</div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
