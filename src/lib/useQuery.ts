import { useCallback, useEffect, useRef, useState } from 'react';
import { errMsg } from './util';

/** Small data-loading hook: { data, loading, error, reload }. */
export function useQuery<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError(null);
    fnRef.current()
      .then((d) => { if (live) { setData(d); setLoading(false); } })
      .catch((e) => { if (live) { setError(errMsg(e)); setLoading(false); } });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, loading, error, reload };
}
