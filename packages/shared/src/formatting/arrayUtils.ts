/**
 * Array and Collection Utilities
 *
 * Provides reusable functions for array manipulation,
 * deduplication, and collection operations.
 */

/**
 * Deduplicates an array by a key function, returning unique items.
 * Uses reduce with early termination via slice.
 *
 * @param items - Array of items to deduplicate
 * @param keyFn - Function to extract the unique key from each item
 * @param maxItems - Optional maximum number of items to return
 * @returns Array of unique items (first occurrence kept)
 *
 * @example
 * const files = [{ path: 'a.ts' }, { path: 'b.ts' }, { path: 'a.ts' }];
 * deduplicateByKey(files, f => f.path); // [{ path: 'a.ts' }, { path: 'b.ts' }]
 */
export const deduplicateByKey = <T, K>(
  items: readonly T[],
  keyFn: (item: T) => K,
  maxItems?: number
): T[] => {
  const seen = new Set<K>();

  const unique = items.reduce<T[]>((result, item) => {
    const key = keyFn(item);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
    return result;
  }, []);

  if (maxItems === undefined) {
    return unique;
  }
  return unique.slice(0, maxItems);
};

/**
 * Checks if a string contains any of the given patterns.
 * Uses .some() for functional iteration.
 *
 * @param text - The text to check
 * @param patterns - Array of patterns to match against
 * @returns True if any pattern is found in text
 *
 * @example
 * containsAny('node_modules/foo', ['node_modules', '.test.']); // true
 */
export const containsAny = (text: string, patterns: readonly string[]): boolean =>
  patterns.some((pattern) => text.includes(pattern));

/**
 * Checks if a string starts with any of the given prefixes.
 * Uses .some() for functional iteration.
 *
 * @param text - The text to check
 * @param prefixes - Array of prefixes to match against
 * @returns True if text starts with any prefix
 */
export const startsWithAny = (text: string, prefixes: readonly string[]): boolean =>
  prefixes.some((prefix) => text.startsWith(prefix));

/**
 * Checks if a path should be excluded based on patterns.
 * Matches if path contains OR starts with any pattern.
 *
 * @param path - The file path to check
 * @param patterns - Array of exclusion patterns
 * @returns True if path should be excluded
 */
export const shouldExcludePath = (path: string, patterns: readonly string[]): boolean =>
  containsAny(path, patterns) || startsWithAny(path, patterns);

/**
 * Groups array items by a key function.
 * Uses reduce for functional iteration.
 *
 * @param items - Array of items to group
 * @param keyFn - Function to extract the group key from each item
 * @returns Map of keys to arrays of items
 *
 * @example
 * const items = [{ type: 'a', v: 1 }, { type: 'b', v: 2 }, { type: 'a', v: 3 }];
 * groupBy(items, i => i.type); // Map { 'a' => [{...}, {...}], 'b' => [{...}] }
 */
export const groupBy = <T, K>(items: readonly T[], keyFn: (item: T) => K): Map<K, T[]> =>
  items.reduce((groups, item) => {
    const key = keyFn(item);
    const group = groups.get(key);
    if (group) {
      group.push(item);
    } else {
      groups.set(key, [item]);
    }
    return groups;
  }, new Map<K, T[]>());

/**
 * Takes the first N items from an array that match a predicate.
 * Uses filter with slice for functional approach.
 *
 * @param items - Array of items
 * @param predicate - Filter function
 * @param limit - Maximum number of items to return
 * @returns Array of matching items up to limit
 *
 * @example
 * takeMatching([1,2,3,4,5], n => n % 2 === 0, 2); // [2, 4]
 */
export const takeMatching = <T>(
  items: readonly T[],
  predicate: (item: T) => boolean,
  limit: number
): T[] => items.filter(predicate).slice(0, limit);
