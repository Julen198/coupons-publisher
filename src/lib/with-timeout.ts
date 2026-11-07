// Best-effort work on the request path: its value if it settles within `ms`, otherwise null. A failure or a timeout
// goes to `onFail` (once) and never rejects; the work itself keeps running, its late result or error is dropped.
export function orNullAfter<T>(work: Promise<T>, ms: number, onFail?: (error: unknown) => void): Promise<T | null> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: T | null, error?: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error !== undefined) onFail?.(error);
      resolve(value);
    };
    const timer = setTimeout(() => finish(null, new Error(`timed out after ${ms} ms`)), ms);
    work.then(
      (value) => finish(value),
      (error: unknown) => finish(null, error ?? new Error("rejected")),
    );
  });
}
