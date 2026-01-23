/**
 * Safety Audit Trail Module
 *
 * Records all safety-related decisions and actions for compliance,
 * debugging, and analysis. Provides immutable audit entries.
 *
 * @module safety/audit/audit
 */

// ==================== Types ====================

/**
 * A safety audit entry.
 */
export interface SafetyAuditEntry {
  /** Unique identifier */
  readonly id: string;
  /** When the entry was created */
  readonly timestamp: Date;
  /** Type of audit event */
  readonly eventType: SafetyEventType;
  /** Severity level */
  readonly severity: AuditSeverity;
  /** Associated action (if applicable) */
  readonly actionType?: string;
  /** Decision made */
  readonly decision: AuditDecision;
  /** Confidence score (if applicable) */
  readonly confidenceScore?: number;
  /** Risk score (if applicable) */
  readonly riskScore?: number;
  /** Human-readable summary */
  readonly summary: string;
  /** Additional context */
  readonly context: Readonly<Record<string, unknown>>;
  /** Request context (requestId, tenantId) */
  readonly requestContext?: SafetyRequestContext;
}

/**
 * Minimal request context for audit entries.
 */
export interface SafetyRequestContext {
  readonly requestId: string;
  readonly tenantId: string;
  readonly actor?: string;
}

/**
 * Types of safety events.
 */
export type SafetyEventType =
  | "action_proposed"
  | "action_approved"
  | "action_blocked"
  | "action_executed"
  | "confidence_check"
  | "injection_detected"
  | "hallucination_detected"
  | "restriction_applied"
  | "restriction_overridden"
  | "sanitization_applied"
  | "risk_assessment";

/**
 * Audit entry severity levels.
 */
export type AuditSeverity = "info" | "warning" | "error" | "critical";

/**
 * Decision recorded in audit.
 */
export type AuditDecision =
  | "allowed"
  | "blocked"
  | "requires_approval"
  | "auto_approved"
  | "sanitized"
  | "flagged";

/**
 * Input for creating an audit entry.
 */
export interface CreateAuditEntryInput {
  readonly eventType: SafetyEventType;
  readonly severity: AuditSeverity;
  readonly decision: AuditDecision;
  readonly summary: string;
  readonly actionType?: string;
  readonly confidenceScore?: number;
  readonly riskScore?: number;
  readonly context?: Record<string, unknown>;
  readonly requestContext?: SafetyRequestContext;
}

/**
 * Query options for retrieving audit entries.
 */
export interface AuditQueryOptions {
  /** Filter by event types */
  readonly eventTypes?: readonly SafetyEventType[];
  /** Filter by severity levels */
  readonly severities?: readonly AuditSeverity[];
  /** Filter by decisions */
  readonly decisions?: readonly AuditDecision[];
  /** Filter by tenant */
  readonly tenantId?: string;
  /** Filter by request */
  readonly requestId?: string;
  /** Start of time range */
  readonly fromDate?: Date;
  /** End of time range */
  readonly toDate?: Date;
  /** Maximum entries to return */
  readonly limit?: number;
  /** Offset for pagination */
  readonly offset?: number;
}

/**
 * Audit store interface for pluggable backends.
 */
export interface AuditStore {
  /** Appends an entry to the audit log */
  append(entry: SafetyAuditEntry): Promise<void>;
  /** Queries entries based on options */
  query(options: AuditQueryOptions): Promise<readonly SafetyAuditEntry[]>;
  /** Gets entry count matching options */
  count(options: AuditQueryOptions): Promise<number>;
}

// ==================== Constants ====================

/**
 * Default limit for queries.
 */
const DEFAULT_QUERY_LIMIT = 100;

/**
 * Maximum in-memory entries (for default store).
 */
const MAX_IN_MEMORY_ENTRIES = 10000;

// ==================== In-Memory Store ====================

/**
 * Simple in-memory audit store for development/testing.
 * In production, use a persistent store implementation.
 */
class InMemoryAuditStore implements AuditStore {
  private entries: SafetyAuditEntry[] = [];

  async append(entry: SafetyAuditEntry): Promise<void> {
    this.entries.push(entry);

    // Trim old entries if over limit
    if (this.entries.length > MAX_IN_MEMORY_ENTRIES) {
      this.entries = this.entries.slice(-MAX_IN_MEMORY_ENTRIES);
    }
  }

  async query(options: AuditQueryOptions): Promise<readonly SafetyAuditEntry[]> {
    let filtered = this.entries;

    // Apply filters
    if (options.eventTypes && options.eventTypes.length > 0) {
      const eventTypeSet = new Set(options.eventTypes);
      filtered = filtered.filter((entry) => eventTypeSet.has(entry.eventType));
    }

    if (options.severities && options.severities.length > 0) {
      const severitySet = new Set(options.severities);
      filtered = filtered.filter((entry) => severitySet.has(entry.severity));
    }

    if (options.decisions && options.decisions.length > 0) {
      const decisionSet = new Set(options.decisions);
      filtered = filtered.filter((entry) => decisionSet.has(entry.decision));
    }

    if (options.tenantId) {
      filtered = filtered.filter((entry) => entry.requestContext?.tenantId === options.tenantId);
    }

    if (options.requestId) {
      filtered = filtered.filter((entry) => entry.requestContext?.requestId === options.requestId);
    }

    if (options.fromDate) {
      const { fromDate } = options;
      filtered = filtered.filter((entry) => entry.timestamp >= fromDate);
    }

    if (options.toDate) {
      const { toDate } = options;
      filtered = filtered.filter((entry) => entry.timestamp <= toDate);
    }

    // Sort by timestamp descending (newest first)
    filtered = [...filtered].sort(
      (entryA, entryB) => entryB.timestamp.getTime() - entryA.timestamp.getTime()
    );

    // Apply pagination
    const offset = options.offset ?? 0;
    const limit = options.limit ?? DEFAULT_QUERY_LIMIT;

    return filtered.slice(offset, offset + limit);
  }

  async count(options: AuditQueryOptions): Promise<number> {
    const results = await this.query({ ...options, limit: undefined, offset: undefined });
    return results.length;
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

/**
 * Counter for generating unique IDs.
 */
let idCounter = 0;

// ==================== Core Functions ====================

/**
 * Generates a unique audit entry ID.
 *
 * @returns Unique ID string
 */
const generateId = (): string => {
  idCounter++;
  const timestamp = Date.now().toString(36);
  const counter = idCounter.toString(36).padStart(4, "0");
  const random = Math.random().toString(36).substring(2, 6);
  return `audit_${timestamp}_${counter}_${random}`;
};

// ==================== Exports ====================

/**
 * Creates and records an audit entry.
 *
 * @param input - Entry input data
 * @returns The created audit entry
 */
export const recordAuditEntry = async (input: CreateAuditEntryInput): Promise<SafetyAuditEntry> => {
  const entry: SafetyAuditEntry = {
    id: generateId(),
    timestamp: new Date(),
    eventType: input.eventType,
    severity: input.severity,
    decision: input.decision,
    summary: input.summary,
    actionType: input.actionType,
    confidenceScore: input.confidenceScore,
    riskScore: input.riskScore,
    context: Object.freeze(input.context ?? {}),
    requestContext: input.requestContext,
  };

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
): Promise<SafetyAuditEntry> =>
  recordAuditEntry({
    eventType: "injection_detected",
    severity: blocked ? "error" : "warning",
    decision: blocked ? "blocked" : "flagged",
    summary: `Injection attempt detected (risk: ${(riskScore * 100).toFixed(0)}%, patterns: ${patterns.join(", ")})`,
    riskScore,
    context: { patterns },
    requestContext,
  });

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
  idCounter = 0;
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
