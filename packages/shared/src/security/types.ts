/**
 * Security Module Types
 *
 * @module security/types
 */

/**
 * Compiled regex pattern with name for tracking.
 */
export interface CompiledPattern {
  readonly name: string;
  readonly regex: RegExp;
}

/**
 * Internal accumulator for pattern reduction.
 */
export interface RedactionAccumulator {
  readonly text: string;
  readonly redactedCount: number;
  readonly redactedTypes: readonly string[];
  readonly redactedTypeCounts: Record<string, number>;
}

/**
 * Result of a redaction operation, including statistics.
 */
export interface RedactionResult {
  readonly text: string;
  readonly redactedCount: number;
  readonly redactedTypes: readonly string[];
  readonly redactedTypeCounts: Readonly<Record<string, number>>;
}

/**
 * Options for redaction operations.
 */
export interface RedactionOptions {
  readonly logRedactions?: boolean;
  readonly maxInputSize?: number;
}

/**
 * Options for object redaction.
 */
export interface ObjectRedactionOptions extends RedactionOptions {
  readonly maxDepth?: number;
}

/**
 * Result type for custom redactor with stats.
 */
export interface CustomRedactionResult extends RedactionResult {}

/**
 * Custom redactor function type.
 */
export interface CustomRedactor {
  (text: string): string;
  withStats: (text: string) => CustomRedactionResult;
}

/**
 * Options passed to value handlers during recursive redaction.
 */
export interface ValueHandlerOptions {
  readonly logRedactions: boolean;
  readonly maxInputSize: number;
}

/**
 * Handler function for recursive value redaction.
 */
export type ValueHandler = (
  value: unknown,
  recurse: (nestedValue: unknown) => unknown,
  options: ValueHandlerOptions
) => unknown;

/**
 * Entry in the value type handler lookup table.
 */
export interface ValueTypeHandlerEntry {
  readonly guard: (value: unknown) => boolean;
  readonly handler: ValueHandler;
}

/**
 * Result of applying a pattern to text.
 */
export interface PatternMatchResult {
  readonly redacted: string;
  readonly matchCount: number;
}
