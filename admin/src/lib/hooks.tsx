import { type DependencyList, type ReactNode, useEffect, useRef, useState } from "react";

interface ResourceState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
  setData: (updater: T | ((current: T | null) => T | null)) => void;
}

export function useResource<T>(
  loader: () => Promise<T>,
  deps: DependencyList,
  options?: { enabled?: boolean; initial?: T | null },
): ResourceState<T> {
  const [data, setDataState] = useState<T | null>(options?.initial ?? null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(options?.enabled ?? true));
  const [tick, setTick] = useState(0);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  const enabled = options?.enabled ?? true;

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    loaderRef
      .current()
      .then((result) => {
        if (!cancelled) setDataState(result);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Unable to load this view.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick, enabled]);

  const setData = (updater: T | ((current: T | null) => T | null)) => {
    setDataState((current) => (typeof updater === "function" ? (updater as (value: T | null) => T | null)(current) : updater));
  };

  return { data, error, loading, reload: () => setTick((value) => value + 1), setData };
}

export function useDebounced<T>(value: T, delay = 280): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function Skeleton({ width, height = 14, className }: { width?: string; height?: number; className?: string }): ReactNode {
  return <span className={`sk sk-line ${className ?? ""}`} style={{ width, height }} aria-hidden="true" />;
}
