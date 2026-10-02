import { liveQuery } from 'dexie';
import { useEffect, useState } from 'preact/hooks';

/** Subscribes to a Dexie live query; re-renders whenever the underlying tables change. */
export function useLive<T>(query: () => Promise<T>, deps: unknown[], initial: T): T {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    const sub = liveQuery(query).subscribe({
      next: (v) => setValue(() => v),
      error: (e) => console.error(e),
    });
    return () => sub.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return value;
}
