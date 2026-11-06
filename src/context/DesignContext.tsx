import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { applyDesignVars, clearDesignVars, DEFAULT_DESIGN, sanitizeDesign, setFavicon, type DesignConfig } from '../lib/design';
import { signPaths } from '../lib/media';
import type { ImageRef, LiveDesign } from '../lib/types';

interface DesignValue {
  design: DesignConfig;
  /** Resolve an uploaded image used by the LIVE design (only approved, public images are ever returned). */
  resolve: (id: string) => ImageRef | null;
  loaded: boolean;
}
const Ctx = createContext<DesignValue>({ design: DEFAULT_DESIGN, resolve: () => null, loaded: false });

/**
 * Loads the approved live design once. If anything is missing or invalid the original look is used,
 * so the public website always works. Drafts are never loaded here.
 */
export function DesignProvider({ children }: { children: ReactNode }) {
  const [live, setLive] = useState<LiveDesign | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let on = true;
    supabase.rpc('get_live_design').then(({ data, error }) => {
      if (!on) return;
      if (!error && data && typeof data === 'object') setLive(data as LiveDesign);
      setLoaded(true);
    });
    return () => { on = false; };
  }, []);

  const design = useMemo(() => (live ? sanitizeDesign(live.config) : DEFAULT_DESIGN), [live]);
  const resolve = useMemo(() => (id: string): ImageRef | null => {
    const a = live?.assets?.[id];
    return a ? { id, ...a } : null;
  }, [live]);

  useEffect(() => {
    const root = document.documentElement;
    applyDesignVars(root, design);
    return () => clearDesignVars(root);
  }, [design]);

  useEffect(() => {
    const ref = design.branding.faviconAssetId ? resolve(design.branding.faviconAssetId) : null;
    const path = ref?.path_thumb ?? null;
    if (!path) { setFavicon(null); return; }
    let on = true;
    signPaths([path]).then(async () => {
      const { data } = await supabase.storage.from('site-media').createSignedUrl(path, 3600);
      if (on && data?.signedUrl) setFavicon(data.signedUrl);
    });
    return () => { on = false; };
  }, [design, resolve]);

  return <Ctx.Provider value={{ design, resolve, loaded }}>{children}</Ctx.Provider>;
}

export const useDesign = () => useContext(Ctx);
