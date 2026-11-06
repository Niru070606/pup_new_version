import { useSignedUrls } from '../../lib/media';
import type { ImageRef } from '../../lib/types';

interface Props {
  image: ImageRef | null | undefined;
  /** Description for screen readers. Pass '' ONLY for purely decorative images. */
  alt: string;
  sizes?: string;
  className?: string;
  /** Above-the-fold images load eagerly; everything else is lazy (saves mobile data). */
  eager?: boolean;
  /** Keep the box stable while the image loads (avoids layout jumps). */
  fit?: 'cover' | 'contain';
}

/** Private-bucket image with responsive srcset (320w / 1024w / original), lazy loading and a calm placeholder. */
export default function ResponsiveImage({ image, alt, sizes = '(min-width: 768px) 50vw, 100vw', className = '', eager = false, fit }: Props) {
  const urls = useSignedUrls([image?.path_thumb, image?.path_medium, image?.path_original]);
  if (!image) return null;
  const thumb = image.path_thumb ? urls[image.path_thumb] : undefined;
  const med = image.path_medium ? urls[image.path_medium] : undefined;
  const orig = image.path_original ? urls[image.path_original] : undefined;
  const src = med ?? orig ?? thumb;
  const set = [
    thumb && image.width_thumb ? `${thumb} ${image.width_thumb}w` : null,
    med && image.width_medium ? `${med} ${image.width_medium}w` : null,
    orig && image.width ? `${orig} ${image.width}w` : null,
  ].filter(Boolean).join(', ');
  const ratio = image.width && image.height ? image.width / image.height : undefined;
  return (
    <span className={`block overflow-hidden bg-surface ${className}`} style={ratio && !fit ? { aspectRatio: String(ratio) } : undefined}>
      {src ? (
        <img
          src={src}
          srcSet={set || undefined}
          sizes={set ? sizes : undefined}
          alt={alt}
          width={image.width ?? undefined}
          height={image.height ?? undefined}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          className={`h-full w-full ${fit === 'contain' ? 'object-contain' : 'object-cover'}`}
        />
      ) : (
        <span role="status" className="flex h-full min-h-[4rem] w-full items-center justify-center text-xs text-muted">Loading image…</span>
      )}
    </span>
  );
}
