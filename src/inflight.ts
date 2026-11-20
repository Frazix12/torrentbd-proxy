// src/inflight.ts
// Single-flight helper: collapses concurrent identical async operations.
// Used so N simultaneous Prowlarr searches only cause one upstream request.

const inFlight = new Map<string, Promise<unknown>>();

export async function singleFlight<T>(
  key: string,
  fn: () => Promise<T>,
): Promise<T> {
  const existing = inFlight.get(key);
  if (existing) return existing as Promise<T>;

  const promise = (async () => {
    try {
      return await fn();
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, promise);
  return promise;
}

export function inFlightSize(): number {
  return inFlight.size;
}
