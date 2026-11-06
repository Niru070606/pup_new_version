import { Link } from 'react-router-dom';
import type { ImageRef, PublicAnnouncement } from '../lib/types';
import { excerpt, formatDate } from '../lib/util';
import { StatusBadge } from './ui';
import ResponsiveImage from './media/ResponsiveImage';

/** Cover image of a public announcement as a displayable reference (null when there is none or it is not public). */
export function coverRef(a: PublicAnnouncement): ImageRef | null {
  if (!a.cover_path_medium && !a.cover_path_original && !a.cover_path_thumb) return null;
  return {
    id: a.cover_asset_id, path_original: a.cover_path_original ?? null, path_medium: a.cover_path_medium ?? null, path_thumb: a.cover_path_thumb ?? null,
    width: a.cover_width ?? null, height: a.cover_height ?? null, width_medium: a.cover_width_medium ?? null, width_thumb: a.cover_width_thumb ?? null,
  };
}

export default function AnnouncementCard({ a }: { a: PublicAnnouncement }) {
  const cover = coverRef(a);
  return (
    <article className="card overflow-hidden">
      {cover && (
        <Link to={`/announcements/${a.id}`} tabIndex={-1} aria-hidden="true" className="-mx-5 -mt-5 mb-3 block">
          <ResponsiveImage image={cover} alt="" sizes="(min-width: 768px) 40vw, 100vw" className="max-h-44" />
        </Link>
      )}
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <time dateTime={a.published_at}>{formatDate(a.published_at)}</time>
        {a.category && <StatusBadge label={a.category} tone="neutral" />}
      </div>
      <h3 className="mt-2 text-lg font-bold">
        <Link to={`/announcements/${a.id}`}>{a.title}</Link>
      </h3>
      <p className="mt-1 text-sm">{excerpt(a.body.replace(/\{\{image:\d+\}\}/g, ''))}</p>
      <p className="mt-2 text-xs text-muted">Issued by {a.issuing_office}</p>
    </article>
  );
}
