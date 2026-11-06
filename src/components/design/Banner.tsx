import type { DesignConfig } from '../../lib/design';
import type { ImageRef } from '../../lib/types';
import ResponsiveImage from '../media/ResponsiveImage';

const TONE = { info: 'bg-[#E3F2F8] text-[#064E6D]', accent: 'bg-gold-soft text-maroon-strong', warning: 'bg-[#FFF4D6] text-[#6B4B00]' } as const;

export default function Banner({ cfg, resolve }: { cfg: DesignConfig['banner']; resolve: (id: string) => ImageRef | null }) {
  if (!cfg.enabled || (!cfg.text && !cfg.imageAssetId)) return null;
  const img = cfg.imageAssetId ? resolve(cfg.imageAssetId) : null;
  return (
    <div role="region" aria-label="Site banner" className={TONE[cfg.tone]}>
      <div className="page flex items-center justify-center gap-3 py-2 text-center text-sm">
        {img && <ResponsiveImage image={img} alt="" className="h-10 w-24 shrink-0" sizes="96px" />}
        {cfg.text && <p>{cfg.text}</p>}
      </div>
    </div>
  );
}
