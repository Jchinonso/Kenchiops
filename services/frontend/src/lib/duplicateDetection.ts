/**
 * Cross-Source Duplicate Detection
 *
 * Pure utility for detecting potential duplicate incidents across monitoring sources.
 * Uses normalized title similarity + close time windows to group likely duplicates.
 */

// ==================== Types ====================

interface IncidentLike {
  readonly id: string;
  readonly title: string;
  readonly receivedAt: string;
  readonly source: string;
}

// ==================== Constants ====================

/** Minimum similarity ratio (0-1) to consider two titles as potential duplicates */
const SIMILARITY_THRESHOLD = 0.7;

/** Maximum time difference (ms) between incidents to consider them related */
const TIME_WINDOW_MS = 5 * 60 * 1000;

// ==================== Helpers ====================

/** Normalizes a title for comparison: lowercase, strip punctuation/whitespace */
const normalize = (title: string): string =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Computes the longest common substring ratio between two strings.
 * Returns a value between 0 and 1 (length of LCS / length of longer string).
 */
const lcsRatio = (a: string, b: string): number => {
  const { length: aLen } = a;
  const { length: bLen } = b;
  if (aLen === 0 || bLen === 0) {
    return 0;
  }

  // Space-optimized LCS: only need two rows
  const prev = new Array<number>(bLen + 1).fill(0);
  const curr = new Array<number>(bLen + 1).fill(0);
  // let: tracks best LCS length found so far across all matrix positions
  let maxLen = 0; // let: iteratively updated as we scan the DP matrix

  for (let i = 1; i <= aLen; i++) {
    // let: loop counter for DP matrix row
    for (let j = 1; j <= bLen; j++) {
      // let: loop counter for DP matrix column
      if (a[i - 1] === b[j - 1]) {
        curr[j] = prev[j - 1] + 1;
        if (curr[j] > maxLen) {
          maxLen = curr[j];
        }
      } else {
        curr[j] = 0;
      }
    }
    // Copy curr to prev for next iteration
    for (let k = 0; k <= bLen; k++) {
      // let: loop counter for array copy
      prev[k] = curr[k];
      curr[k] = 0;
    }
  }

  return maxLen / Math.max(aLen, bLen);
};

// ==================== Public API ====================

/**
 * Finds groups of potential duplicate incidents.
 * Two incidents are considered potential duplicates when:
 * 1. They come from different sources
 * 2. Their normalized titles have LCS ratio >= threshold
 * 3. Their timestamps are within the time window
 *
 * @returns Set of incident IDs that are potential duplicates
 */
export const findDuplicateIds = (incidents: readonly IncidentLike[]): ReadonlySet<string> => {
  const duplicateIds = new Set<string>();
  const { length: count } = incidents;

  for (let i = 0; i < count; i++) {
    // let: outer loop counter for pairwise comparison
    for (let j = i + 1; j < count; j++) {
      // let: inner loop counter for pairwise comparison
      const a = incidents[i];
      const b = incidents[j];

      // Only cross-source duplicates
      if (a.source === b.source) {
        continue;
      }

      // Time window check (fast, do first)
      const timeDiff = Math.abs(
        new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime()
      );
      if (timeDiff > TIME_WINDOW_MS) {
        continue;
      }

      // Title similarity check
      const normA = normalize(a.title);
      const normB = normalize(b.title);
      if (lcsRatio(normA, normB) >= SIMILARITY_THRESHOLD) {
        duplicateIds.add(a.id);
        duplicateIds.add(b.id);
      }
    }
  }

  return duplicateIds;
};
