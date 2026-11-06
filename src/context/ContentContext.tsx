import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';

interface ContentValue {
  content: Record<string, string>;
  reload: () => void;
}
const Ctx = createContext<ContentValue>({ content: {}, reload: () => {} });

/** Loads the editable campus content once and shares it, so pages do not repeat the request. */
export function ContentProvider({ children }: { children: ReactNode }) {
  const [content, setContent] = useState<Record<string, string>>({});
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let live = true;
    supabase.from('campus_content').select('key,value').then(({ data }) => {
      if (!live || !data) return;
      const map: Record<string, string> = {};
      for (const r of data as { key: string; value: string }[]) map[r.key] = (r.value ?? '').trim();
      setContent(map);
    });
    return () => { live = false; };
  }, [tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return <Ctx.Provider value={{ content, reload }}>{children}</Ctx.Provider>;
}

export const useContent = () => useContext(Ctx);
