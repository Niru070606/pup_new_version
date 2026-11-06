import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { DesignConfig } from '../../lib/design';
import type { ImageRef } from '../../lib/types';
import ResponsiveImage from '../media/ResponsiveImage';

/** Accessible carousel: pause button, previous/next, dots, respects reduced motion, never auto-advances while focused/hovered. */
export default function Carousel({ cfg, resolve }: { cfg: DesignConfig['carousel']; resolve: (id: string) => ImageRef | null }) {
  const slides = cfg.slides.filter((s) => s.visible && resolve(s.assetId));
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hold, setHold] = useState(false);
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const n = slides.length;

  useEffect(() => { if (i >= n) setI(0); }, [i, n]);
  useEffect(() => {
    if (!cfg.autoplay || paused || hold || reduce || n < 2) return;
    const t = window.setInterval(() => setI((x) => (x + 1) % n), cfg.intervalSec * 1000);
    return () => window.clearInterval(t);
  }, [cfg.autoplay, cfg.intervalSec, paused, hold, reduce, n]);

  if (!cfg.enabled || n === 0) return null;
  const s = slides[Math.min(i, n - 1)];
  const ref = resolve(s.assetId);
  const caption = (
    <>
      {s.title && <span className="block font-serif text-lg font-bold sm:text-2xl">{s.title}</span>}
      {s.caption && <span className="mt-1 block text-sm sm:text-base">{s.caption}</span>}
    </>
  );
  const external = s.linkUrl?.startsWith('https://');

  return (
    <section aria-roledescription="carousel" aria-label="Campus highlights" className="page mt-8"
      onMouseEnter={() => setHold(true)} onMouseLeave={() => setHold(false)} onFocus={() => setHold(true)} onBlur={() => setHold(false)}>
      <div className="relative overflow-hidden rounded-[var(--radius)] border border-line bg-surface">
        <div role="group" aria-roledescription="slide" aria-label={`${i + 1} of ${n}`} aria-live={cfg.autoplay && !paused ? 'off' : 'polite'}>
          <ResponsiveImage image={ref} alt={s.alt} eager={i === 0} sizes="(min-width: 1152px) 1100px, 100vw" className="max-h-[28rem]" />
          {(s.title || s.caption) && (
            <div className="on-dark absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent p-4 pt-10 text-white sm:p-6">
              {s.linkUrl ? (
                external
                  ? <a href={s.linkUrl} target="_blank" rel="noopener noreferrer" className="text-white no-underline hover:underline">{caption}</a>
                  : <Link to={s.linkUrl} className="text-white no-underline hover:underline">{caption}</Link>
              ) : caption}
            </div>
          )}
        </div>
        {n > 1 && (
          <div className="on-dark absolute right-2 top-2 flex gap-1">
            <button type="button" className="btn btn-sm bg-black/60 text-white hover:bg-black/80" onClick={() => setI((i - 1 + n) % n)} aria-label="Previous slide">‹</button>
            <button type="button" className="btn btn-sm bg-black/60 text-white hover:bg-black/80" onClick={() => setI((i + 1) % n)} aria-label="Next slide">›</button>
            {cfg.autoplay && <button type="button" className="btn btn-sm bg-black/60 text-white hover:bg-black/80" onClick={() => setPaused((p) => !p)} aria-pressed={paused}>{paused ? 'Play' : 'Pause'}</button>}
          </div>
        )}
      </div>
      {n > 1 && (
        <div className="mt-2 flex justify-center gap-2" role="tablist" aria-label="Choose slide">
          {slides.map((x, k) => (
            <button key={x.id} type="button" role="tab" aria-selected={k === i} aria-label={`Slide ${k + 1}`} onClick={() => setI(k)}
              className={`h-3 w-3 rounded-full border border-maroon ${k === i ? 'bg-maroon' : 'bg-white'}`} />
          ))}
        </div>
      )}
    </section>
  );
}
