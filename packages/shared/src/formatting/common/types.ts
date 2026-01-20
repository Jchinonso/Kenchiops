/**
 * Common Types
 *
 * Shared types used across common formatting utilities.
 *
 * @module formatting/common/types
 */

// ==================== UI Helper Types ====================

/**
 * Threshold-based lookup entry for confidence score mappings.
 * Sorted in descending order by threshold for efficient linear scan.
 */
export interface ThresholdEntry<T> {
  readonly threshold: number;
  readonly value: T;
}

/**
 * Time unit configuration for relative time formatting.
 */
export interface TimeUnit {
  readonly threshold: number;
  readonly divisor: number;
  readonly singular: string;
  readonly plural: string;
}

// ==================== Action Review Types ====================

/**
 * Options for building review action text.
 */
export interface ReviewActionOptions {
  readonly titleMaxLength?: number;
  readonly detailMaxLength?: number;
}

/**
 * Formatted review action text with service prefix.
 */
export interface ReviewActionText {
  readonly servicePrefix: string;
  readonly title: string;
  readonly detail: string;
}

// ==================== Dependency Types ====================

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
