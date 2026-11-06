import { useSignedUrls } from '../../lib/media';
import type { BackgroundCfg } from '../../lib/design';
import type { ImageRef } from '../../lib/types';

/** Decorative layered background: colour, image (position/opacity), overlay with blend mode. All via CSS properties, no markup injection. */
export default function BackgroundLayer({ cfg, resolve }: { cfg: BackgroundCfg; resolve: (id: string) => ImageRef | null }) {
  const ref = cfg.assetId ? resolve(cfg.assetId) : null;
  const path = ref?.path_original ?? ref?.path_medium ?? null;
  const urls = useSignedUrls([path]);
  const url = path ? urls[path] : undefined;
  if (!cfg.color && !url && !cfg.overlayColor) return null;
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {cfg.color && <div className="absolute inset-0" style={{ backgroundColor: cfg.color }} />}
      {url && (
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `url("${url.replace(/"/g, '%22')}")`, backgroundSize: cfg.size, backgroundRepeat: 'no-repeat',
            backgroundPosition: `${cfg.positionX}% ${cfg.positionY}%`, opacity: cfg.opacity,
          }}
        />
      )}
      {cfg.overlayColor && <div className="absolute inset-0" style={{ backgroundColor: cfg.overlayColor, opacity: cfg.overlayOpacity, mixBlendMode: cfg.blendMode }} />}
    </div>
  );
}
