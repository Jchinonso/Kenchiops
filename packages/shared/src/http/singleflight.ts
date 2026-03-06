/**
 * Singleflight — deduplicates concurrent requests for the same key.
 *
 * While a request is in-flight, subsequent callers with the same key
 * receive the same Promise instead of starting a new request.
 * Once the in-flight request settles (resolve or reject), the key is
 * removed so future callers trigger a fresh request.
 *
 * @module http/singleflight
 */

const inflightRequests = new Map<string, Promise<unknown>>();

/**
 * Coalesce concurrent calls for the same cache key into a single
 * in-flight request. The first caller executes the fetcher; subsequent
 * callers with the same key share the same Promise until it settles.
 *
 * @param key   - Stable, unique string identifying the logical request
 * @param fetcher - Async function that performs the actual work
 * @returns The result of the (shared) fetcher invocation
 */
export const coalesce = async <T>(key: string, fetcher: () => Promise<T>): Promise<T> => {
  const existing = inflightRequests.get(key);
  if (existing) {
    return existing as Promise<T>;
  }

  const promise = fetcher().finally(() => {
    inflightRequests.delete(key);
  });

  inflightRequests.set(key, promise);
  return promise;
};
