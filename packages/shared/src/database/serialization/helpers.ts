/**
 * Database Serialization Helpers
 *
 * Shared JSON serialization functions for database repository modules.
 *
 * @module database/serialization/helpers
 */

/**
 * Serializes an optional JSON field for database storage.
 * Returns null for undefined values, JSON string otherwise.
 *
 * @param value - Value to serialize, or undefined
 * @returns JSON string or null
 */
export const serializeOptionalJson = (
  value: Record<string, unknown> | readonly unknown[] | undefined
): string | null => (value === undefined ? null : JSON.stringify(value));

/**
 * Serializes a required JSON field for database storage.
 *
 * @param value - Value to serialize
 * @returns JSON string
 */
export const serializeRequiredJson = (value: Record<string, unknown>): string =>
  JSON.stringify(value);
