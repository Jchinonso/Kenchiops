/**
 * CI Failure Formatting Utilities
 *
 * Simplified formatting functions for CI failure analysis.
 * Complex test failure extraction and clustering removed - LLM handles this now.
 */

import { DEPENDENCY_EMOJI_MAP } from "../constants/index.js";

// ==================== Re-exports from pathUtils ====================
export {
  normalizeTestFilePath,
  normalizeEvidencePath,
  extractValidFileLocation,
  extractServiceFromPath,
  formatServiceNameKebab,
  formatServiceNameTitle,
  groupByServicePath,
  formatGroupedItems,
  getPathBasename,
  buildCanonicalPathMap,
  resolveCanonicalPath,
  canonicalizeEvidencePaths,
  stripAbsolutePaths,
} from "./pathUtils.js";

// ==================== Dependency Formatting ====================

/**
 * Dependency change type.
 */
export type DependencyChangeType = "added" | "removed" | "updated";

/**
 * Dependency change information.
 */
export interface DependencyChange {
  readonly name: string;
  readonly type: DependencyChangeType;
  readonly oldVersion?: string;
  readonly newVersion?: string;
}

/**
 * Formatters for each dependency change type.
 */
const DEPENDENCY_FORMATTERS: Readonly<
  Record<DependencyChangeType, (dep: DependencyChange) => string>
> = {
  added: (dep) => `${DEPENDENCY_EMOJI_MAP.added} Added: \`${dep.name}@${dep.newVersion}\``,
  removed: (dep) => `${DEPENDENCY_EMOJI_MAP.removed} Removed: \`${dep.name}@${dep.oldVersion}\``,
  updated: (dep) =>
    `${DEPENDENCY_EMOJI_MAP.updated} Updated: \`${dep.name}\` ${dep.oldVersion} → ${dep.newVersion}`,
};

/**
 * Formats a dependency change into a display string.
 *
 * @param dep - The dependency change to format
 * @returns Formatted dependency string with emoji
 *
 * @example
 * formatDependencyChange({ name: 'lodash', type: 'added', newVersion: '4.0.0' });
 * // '➕ Added: `lodash@4.0.0`'
 */
export const formatDependencyChange = (dep: DependencyChange): string => {
  const formatter = DEPENDENCY_FORMATTERS[dep.type];
  return formatter ? formatter(dep) : DEPENDENCY_FORMATTERS.updated(dep);
};

/**
 * Formats multiple dependency changes into a newline-separated string.
 *
 * @param deps - Array of dependency changes
 * @returns Formatted string with all changes
 */
export const formatDependencyChanges = (deps: readonly DependencyChange[]): string =>
  deps.map(formatDependencyChange).join("\n");
