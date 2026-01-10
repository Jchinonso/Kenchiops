/**
 * CI Failure Formatting Utilities
 *
 * Barrel export for CI failure formatting functions.
 * Re-exports from focused modules for backwards compatibility.
 */

import { DEPENDENCY_EMOJI_MAP } from "../constants/index.js";

// ==================== Re-exports from pathUtils ====================
export {
  normalizeTestFilePath,
  normalizeEvidencePath,
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

// ==================== Re-exports from testFailureUtils ====================
export type { CIAnnotation, CITestFailure, CollectErrorsOptions } from "./testFailureUtils.js";
export {
  normalizeTestFailure,
  collectCIErrors,
  isTestFile,
  countUniqueSuites,
  countUniqueFiles,
} from "./testFailureUtils.js";

// ==================== Re-exports from causeExtraction ====================
export {
  isCauseUseless,
  scoreCause,
  isLowSignalCause,
  extractMeaningfulCause,
  sanitizeTestFailureMessage,
} from "./causeExtraction.js";

// ==================== Re-exports from evidenceIds ====================
export {
  generateTestEvidenceId,
  generateAnnoEvidenceId,
  generateCheckEvidenceId,
  generateLogEvidenceId,
  generateDiffEvidenceId,
  formatWithEvidenceId,
  formatEvidenceLocation,
} from "./evidenceIds.js";

// ==================== Re-exports from failureClassification ====================
export type { FailureClassificationType, PartitionedFailures } from "./failureClassification.js";
export { classifyTestFailure, partitionByFailureType } from "./failureClassification.js";

// ==================== Re-exports from failureClustering ====================
export type {
  FailureCluster,
  RootCauseSummaryEntry,
  RootCauseSummary,
  ClusterableFailure,
} from "./failureClustering.js";
export {
  isEvidenceBackedCluster,
  selectBestClusterCause,
  scoreClusterSignal,
  clusterFailuresByService,
  summarizeRootCauses,
} from "./failureClustering.js";

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
