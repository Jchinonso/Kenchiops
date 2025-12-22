/**
 * Array and Collection Utilities
 *
 * Provides reusable functions for array manipulation,
 * deduplication, and collection operations.
 */

/**
 * Deduplicates an array by a key function, returning unique items.
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
  const result: T[] = [];

  for (const item of items) {
    const key = keyFn(item);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(item);
      if (maxItems !== undefined && result.length >= maxItems) {
        break;
      }
    }
  }

  return result;
};

/**
 * Checks if a string contains any of the given patterns.
 * More efficient than array.some() with includes() for repeated checks.
 *
 * @param text - The text to check
 * @param patterns - Array of patterns to match against
 * @returns True if any pattern is found in text
 *
 * @example
 * containsAny('node_modules/foo', ['node_modules', '.test.']); // true
 */
export const containsAny = (text: string, patterns: readonly string[]): boolean => {
  for (const pattern of patterns) {
    if (text.includes(pattern)) {
      return true;
    }
  }
  return false;
};

/**
 * Checks if a string starts with any of the given prefixes.
 *
 * @param text - The text to check
 * @param prefixes - Array of prefixes to match against
 * @returns True if text starts with any prefix
 */
export const startsWithAny = (text: string, prefixes: readonly string[]): boolean => {
  for (const prefix of prefixes) {
    if (text.startsWith(prefix)) {
      return true;
    }
  }
  return false;
};

/**
 * Checks if a path should be excluded based on patterns.
 * Matches if path contains OR starts with any pattern.
 *
 * @param path - The file path to check
 * @param patterns - Array of exclusion patterns
 * @returns True if path should be excluded
 */
export const shouldExcludePath = (path: string, patterns: readonly string[]): boolean => {
  return containsAny(path, patterns) || startsWithAny(path, patterns);
};

/**
 * Groups array items by a key function.
 *
 * @param items - Array of items to group
 * @param keyFn - Function to extract the group key from each item
 * @returns Map of keys to arrays of items
 *
 * @example
 * const items = [{ type: 'a', v: 1 }, { type: 'b', v: 2 }, { type: 'a', v: 3 }];
 * groupBy(items, i => i.type); // Map { 'a' => [{...}, {...}], 'b' => [{...}] }
 */
export const groupBy = <T, K>(items: readonly T[], keyFn: (item: T) => K): Map<K, T[]> => {
  const groups = new Map<K, T[]>();

  for (const item of items) {
    const key = keyFn(item);
    const group = groups.get(key);
    if (group) {
      group.push(item);
    } else {
      groups.set(key, [item]);
    }
  }

  return groups;
};

/**
 * Takes the first N items from an array that match a predicate.
 *
 * @param items - Array of items
 * @param predicate - Filter function
 * @param limit - Maximum number of items to return
 * @returns Array of matching items up to limit
 *
 * @example
 * takeWhile([1,2,3,4,5], n => n % 2 === 0, 2); // [2, 4]
 */
export const takeMatching = <T>(
  items: readonly T[],
  predicate: (item: T) => boolean,
  limit: number
): T[] => {
  const result: T[] = [];

  for (const item of items) {
    if (predicate(item)) {
      result.push(item);
      if (result.length >= limit) {
        break;
      }
    }
  }

  return result;
};
