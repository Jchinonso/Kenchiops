/**
 * Safety Audit Trail Module
 *
 * Records all safety-related decisions and actions for compliance,
 * debugging, and analysis. Provides immutable audit entries.
 *
 * @module safety/audit/audit
 */

import crypto from "crypto";
import type {
  SafetyAuditEntry,
  SafetyRequestContext,
  AuditDecision,
  CreateAuditEntryInput,
  AuditQueryOptions,
  AuditStore,
} from "../types.js";
import {
  AUDIT_DEFAULT_QUERY_LIMIT,
  AUDIT_MAX_IN_MEMORY_ENTRIES,
  AUDIT_MAX_PATTERNS_IN_SUMMARY,
} from "../../constants/safety.js";

// ==================== Filter Configuration ====================

/**
 * Filter configuration for query options.
 * Maps option keys to their filter predicates.
 */
const QUERY_FILTERS: ReadonlyArray<{
  readonly shouldApply: (options: AuditQueryOptions) => boolean;
  readonly createPredicate: (options: AuditQueryOptions) => (entry: SafetyAuditEntry) => boolean;
}> = [
  // Array-based filters (eventTypes, severities, decisions)
  {
    shouldApply: (options) => Boolean(options.eventTypes?.length),
    createPredicate: (options) => {
      const set = new Set(options.eventTypes);
      return (entry) => set.has(entry.eventType);
    },
  },
  {
    shouldApply: (options) => Boolean(options.severities?.length),
    createPredicate: (options) => {
      const set = new Set(options.severities);
      return (entry) => set.has(entry.severity);
    },
  },
  {
    shouldApply: (options) => Boolean(options.decisions?.length),
    createPredicate: (options) => {
      const set = new Set(options.decisions);
      return (entry) => set.has(entry.decision);
    },
  },
  // Request context filters
  {
    shouldApply: (options) => Boolean(options.tenantId),
    createPredicate: (options) => (entry) => entry.requestContext?.tenantId === options.tenantId,
  },
  {
    shouldApply: (options) => Boolean(options.requestId),
    createPredicate: (options) => (entry) => entry.requestContext?.requestId === options.requestId,
  },
  // Date range filters (parse once in createPredicate, return no-op if invalid)
  {
    shouldApply: (options) => options.fromDate !== undefined,
    createPredicate: (options) => {
      const fromDate = toDate(options.fromDate);
      if (!fromDate) {
        return () => true;
      }
      return (entry) => entry.timestamp >= fromDate;
    },
  },
  {
    shouldApply: (options) => options.toDate !== undefined,
    createPredicate: (options) => {
      const endDate = toDate(options.toDate);
      if (!endDate) {
        return () => true;
      }
      return (entry) => entry.timestamp <= endDate;
    },
  },
];

/**
 * Defensively converts a value to a Date.
 * Returns null for invalid or unparseable values (safer than defaulting to "now").
 */
const toDate = (value: unknown): Date | null => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
};

// ==================== In-Memory Store ====================

/**
 * Simple in-memory audit store for development/testing.
 * In production, use a persistent store implementation.
 *
 * Note: Entries are stored in chronological order (oldest first).
 * For "newest first" queries, we iterate from the end.
 */
class InMemoryAuditStore implements AuditStore {
  private entries: SafetyAuditEntry[] = [];

  async append(entry: SafetyAuditEntry): Promise<void> {
    this.entries.push(entry);

    // Trim old entries if over limit
    if (this.entries.length > AUDIT_MAX_IN_MEMORY_ENTRIES) {
      this.entries = this.entries.slice(-AUDIT_MAX_IN_MEMORY_ENTRIES);
    }
  }

  /**
   * Filters entries based on query options.
   * Returns entries directly when no predicates (private method, safe to share reference).
   */
  private filterEntries(options: AuditQueryOptions): readonly SafetyAuditEntry[] {
    // Build predicates from filter configuration
    const predicates = QUERY_FILTERS.filter((filter) => filter.shouldApply(options)).map((filter) =>
      filter.createPredicate(options)
    );

    // No filters = return entries directly (private method, safe)
    if (predicates.length === 0) {
      return this.entries;
    }

    // Apply all filters in a single pass
    return this.entries.filter((entry) => predicates.every((predicate) => predicate(entry)));
  }

  async query(options: AuditQueryOptions): Promise<readonly SafetyAuditEntry[]> {
    const filtered = this.filterEntries(options);
    // Clamp offset/limit to avoid odd behavior with negative values
    const offset = Math.max(0, options.offset ?? 0);
    const limit = Math.max(0, options.limit ?? AUDIT_DEFAULT_QUERY_LIMIT);

    // Iterate backwards (newest first) and collect until offset + limit
    // This avoids copying the entire array with slice().reverse()
    const result: SafetyAuditEntry[] = [];
    let skipped = 0;

    for (let i = filtered.length - 1; i >= 0; i--) {
      if (skipped < offset) {
        skipped++;
        continue;
      }
      result.push(filtered[i]);
      if (result.length >= limit) {
        break;
      }
    }

    return result;
  }

  async count(options: AuditQueryOptions): Promise<number> {
    // Use filterEntries directly - no pagination, no sorting
    return this.filterEntries(options).length;
  }

  /** Clears all entries (for testing) */
  clear(): void {
    this.entries = [];
  }

  /** Gets all entries (for testing) */
  getAll(): readonly SafetyAuditEntry[] {
    return [...this.entries];
  }
}

// ==================== State ====================

/**
 * Active audit store instance.
 */
let auditStore: AuditStore = new InMemoryAuditStore();

// ==================== Core Functions ====================

/**
 * Generates a unique audit entry ID using crypto.randomUUID().
 * Prefixed with "audit_" for easy identification.
 *
 * @returns Unique ID string
 */
const generateId = (): string => `audit_${crypto.randomUUID()}`;

/**
 * Deep freezes an object for immutability.
 * Uses WeakSet to handle cyclic references safely.
 * Skips Date objects (freezing them is unnecessary and can cause issues).
 */
const deepFreeze = <T extends object>(
  obj: T,
  seen: WeakSet<object> = new WeakSet()
): Readonly<T> => {
  if (seen.has(obj)) {
    return obj;
  }
  seen.add(obj);

  Object.freeze(obj);

  for (const value of Object.values(obj)) {
    if (!value || typeof value !== "object") {
      continue;
    }
    if (value instanceof Date) {
      continue;
    } // Skip Dates
    if (Object.isFrozen(value)) {
      continue;
    }
    deepFreeze(value as object, seen);
  }

  return obj;
};

// ==================== Exports ====================

/**
 * Creates and records an immutable audit entry.
 * Entry and all nested objects are frozen to prevent mutation.
 *
 * @param input - Entry input data
 * @returns The created audit entry (frozen)
 */
export const recordAuditEntry = async (input: CreateAuditEntryInput): Promise<SafetyAuditEntry> => {
  // Defensive copy and freeze requestContext
  const frozenRequestContext = input.requestContext
    ? Object.freeze({ ...input.requestContext })
    : undefined;

  // Defensive copy and deep freeze context (freeze empty object too for consistency)
  const frozenContext = input.context ? deepFreeze({ ...input.context }) : Object.freeze({});

  // Create and freeze the entire entry
  const entry: SafetyAuditEntry = Object.freeze({
    id: generateId(),
    timestamp: new Date(),
    eventType: input.eventType,
    severity: input.severity,
    decision: input.decision,
    summary: input.summary,
    actionType: input.actionType,
    confidenceScore: input.confidenceScore,
    riskScore: input.riskScore,
    context: frozenContext,
    requestContext: frozenRequestContext,
  });

  await auditStore.append(entry);
  return entry;
};

/**
 * Records an action proposal event.
 *
 * @param actionType - Type of action proposed
 * @param confidenceScore - Confidence score
 * @param decision - Gating decision
 * @param requestContext - Request context
 * @returns The created audit entry
 */
export const recordActionProposal = async (
  actionType: string,
  confidenceScore: number,
  decision: AuditDecision,
  requestContext?: SafetyRequestContext
): Promise<SafetyAuditEntry> =>
  recordAuditEntry({
    eventType: "action_proposed",
    severity: decision === "blocked" ? "warning" : "info",
    decision,
    summary: `Action "${actionType}" proposed with confidence ${(confidenceScore * 100).toFixed(0)}%`,
    actionType,
    confidenceScore,
    requestContext,
  });

/**
 * Records an injection detection event.
 *
 * @param riskScore - Injection risk score
 * @param patterns - Detected pattern types
 * @param blocked - Whether input was blocked
 * @param requestContext - Request context
 * @returns The created audit entry
 */
export const recordInjectionDetection = async (
  riskScore: number,
  patterns: readonly string[],
  blocked: boolean,
  requestContext?: SafetyRequestContext
): Promise<SafetyAuditEntry> => {
  // Truncate patterns in summary to prevent huge log entries
  const displayPatterns = patterns.slice(0, AUDIT_MAX_PATTERNS_IN_SUMMARY);
  const patternsSummary =
    patterns.length > AUDIT_MAX_PATTERNS_IN_SUMMARY
      ? `${displayPatterns.join(", ")} (+${patterns.length - AUDIT_MAX_PATTERNS_IN_SUMMARY} more)`
      : patterns.join(", ");

  return recordAuditEntry({
    eventType: "injection_detected",
    severity: blocked ? "error" : "warning",
    decision: blocked ? "blocked" : "flagged",
    summary: `Injection attempt detected (risk: ${(riskScore * 100).toFixed(0)}%, patterns: ${patternsSummary})`,
    riskScore,
    context: { patterns: [...patterns] }, // Copy array for immutability
    requestContext,
  });
};

/**
 * Records a hallucination detection event.
 *
 * @param riskScore - Hallucination risk score
 * @param indicatorCount - Number of indicators found
 * @param requestContext - Request context
 * @returns The created audit entry
 */
export const recordHallucinationDetection = async (
  riskScore: number,
  indicatorCount: number,
  requestContext?: SafetyRequestContext
): Promise<SafetyAuditEntry> =>
  recordAuditEntry({
    eventType: "hallucination_detected",
    severity: riskScore >= 0.6 ? "warning" : "info",
    decision: "flagged",
    summary: `Potential hallucination detected (risk: ${(riskScore * 100).toFixed(0)}%, indicators: ${indicatorCount})`,
    riskScore,
    context: { indicatorCount },
    requestContext,
  });

/**
 * Records a restriction application event.
 *
 * @param restrictionType - Type of restriction
 * @param restrictionName - Name of restriction
 * @param actionType - Action that was restricted
 * @param requestContext - Request context
 * @returns The created audit entry
 */
export const recordRestrictionApplied = async (
  restrictionType: string,
  restrictionName: string,
  actionType: string,
  requestContext?: SafetyRequestContext
): Promise<SafetyAuditEntry> =>
  recordAuditEntry({
    eventType: "restriction_applied",
    severity: "warning",
    decision: "blocked",
    summary: `Action "${actionType}" blocked by restriction: ${restrictionName}`,
    actionType,
    context: { restrictionType, restrictionName },
    requestContext,
  });

/**
 * Records a risk assessment event.
 *
 * @param actionType - Action assessed
 * @param riskScore - Calculated risk score
 * @param riskSummary - Risk summary text
 * @param requestContext - Request context
 * @returns The created audit entry
 */
export const recordRiskAssessment = async (
  actionType: string,
  riskScore: number,
  riskSummary: string,
  requestContext?: SafetyRequestContext
): Promise<SafetyAuditEntry> =>
  recordAuditEntry({
    eventType: "risk_assessment",
    severity: riskScore >= 0.7 ? "warning" : "info",
    decision: riskScore >= 0.7 ? "flagged" : "allowed",
    summary: `Risk assessment for "${actionType}": ${riskSummary}`,
    actionType,
    riskScore,
    requestContext,
  });

/**
 * Queries audit entries.
 *
 * @param options - Query options
 * @returns Matching audit entries
 */
export const queryAuditEntries = async (
  options: AuditQueryOptions = {}
): Promise<readonly SafetyAuditEntry[]> => auditStore.query(options);

/**
 * Counts audit entries matching criteria.
 *
 * @param options - Query options
 * @returns Count of matching entries
 */
export const countAuditEntries = async (options: AuditQueryOptions = {}): Promise<number> =>
  auditStore.count(options);

/**
 * Gets recent audit entries.
 *
 * @param limit - Maximum entries to return (default: 50)
 * @returns Recent audit entries
 */
export const getRecentAuditEntries = async (
  limit: number = 50
): Promise<readonly SafetyAuditEntry[]> => auditStore.query({ limit });

/**
 * Gets audit entries for a specific request.
 *
 * @param requestId - Request ID to filter by
 * @returns Audit entries for the request
 */
export const getAuditEntriesForRequest = async (
  requestId: string
): Promise<readonly SafetyAuditEntry[]> => auditStore.query({ requestId });

/**
 * Gets blocked action audit entries.
 *
 * @param options - Additional query options
 * @returns Blocked action entries
 */
export const getBlockedActions = async (
  options: Omit<AuditQueryOptions, "decisions"> = {}
): Promise<readonly SafetyAuditEntry[]> => auditStore.query({ ...options, decisions: ["blocked"] });

/**
 * Sets the audit store implementation.
 * Use for production backends (database, cloud logging, etc.)
 *
 * @param store - Audit store implementation
 */
export const setAuditStore = (store: AuditStore): void => {
  auditStore = store;
};

/**
 * Gets the current audit store (for testing).
 *
 * @returns Current audit store
 */
export const getAuditStore = (): AuditStore => auditStore;

/**
 * Resets to in-memory store (for testing).
 */
export const resetAuditStore = (): void => {
  auditStore = new InMemoryAuditStore();
};

/**
 * Creates an in-memory audit store instance.
 *
 * @returns New in-memory store
 */
export const createInMemoryAuditStore = (): AuditStore & {
  clear(): void;
  getAll(): readonly SafetyAuditEntry[];
} => new InMemoryAuditStore();

// Re-export types for consumers that import from this module directly
export type {
  SafetyAuditEntry,
  SafetyRequestContext,
  AuditDecision,
  CreateAuditEntryInput,
  AuditQueryOptions,
  AuditStore,
} from "../types.js";
