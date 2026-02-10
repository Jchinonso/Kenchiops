/**
 * API Service Type Definitions
 *
 * Types specific to the API service
 */

import type {
  Event,
  Evidence,
  LLMAnalysisResult,
  HealthStatus,
  BlastRadius,
  Reversibility,
  DataImpact,
} from "@kenchi/shared";

// ==================== Analysis Types ====================

/**
 * Detected test framework hint from log preprocessing.
 */
export interface TestFrameworkRequest {
  readonly name: string;
  readonly language: string;
  readonly assertion_hint: string;
}

/**
 * CI failure analysis request payload
 */
export interface AnalyzeRequest {
  readonly failure_log: string;
  readonly repository: string;
  readonly commit?: string;
  readonly tenant_id?: string;
  /** Detected test framework for assertion parsing hints */
  readonly test_framework?: TestFrameworkRequest;
  /** Workflow identifier */
  readonly workflow_id?: string;
  /** CI platform (github, gitlab, circleci, etc.) */
  readonly ci_platform?: string;
  /** Git branch name */
  readonly branch?: string;
  /** Pull request number */
  readonly pr_number?: number;
  /** PR diff content (truncated, unified format) for failure correlation */
  readonly pr_diff?: string;
  /** Files changed in the PR */
  readonly pr_changed_files?: readonly string[];
  /** PR title for LLM context */
  readonly pr_title?: string;
  /** Workflow SHA for fingerprinting */
  readonly workflow_sha?: string;
  /** Exit code from CI job */
  readonly exit_code?: number;
}

/**
 * CI failure analysis response
 */
export interface AnalyzeResponse {
  readonly analysis: string;
  readonly identified_cause: string | undefined;
  readonly confidence: number;
  readonly recommended_actions: LLMAnalysisResult["recommendedActions"];
  readonly full_analysis: LLMAnalysisResult;
  readonly repository: string;
}

/**
 * Webhook payload (generic)
 */
export interface WebhookPayload {
  readonly [key: string]: unknown;
}

/**
 * Analysis context created from request
 */
export interface AnalysisContext {
  readonly event: Event;
  readonly evidence: Evidence;
}

/**
 * Health check response
 */
export interface HealthResponse {
  readonly status: HealthStatus;
  readonly service: string;
  readonly timestamp: string;
  readonly uptime: number;
  readonly environment: string;
}

// ==================== Fine-Tuning Dataset Types ====================

/**
 * Request body for dataset extraction
 */
export interface ExtractDatasetRequestBody {
  readonly tenantId?: string;
  readonly startDate?: string;
  readonly endDate?: string;
  readonly minFeedbackCount?: number;
  readonly limit?: number;
}

// ==================== Fine-Tuning Job Types ====================

/**
 * Request body for starting a fine-tuning job
 */
export interface StartJobRequestBody {
  readonly tenantId?: string;
  readonly epochs?: number;
  readonly suffix?: string;
  readonly dryRun?: boolean;
}

// ==================== Fine-Tuning Model Types ====================

/**
 * Request body for configuring A/B test
 */
export interface ABTestConfigRequestBody {
  readonly controlVersion: string;
  readonly treatmentVersion: string;
  readonly treatmentPercentage: number;
}

/**
 * Request body for comparing models
 */
export interface CompareModelsRequestBody {
  readonly controlVersionId: string;
  readonly treatmentVersionId: string;
  readonly tenantId?: string;
}

// ==================== Config Types ====================

/**
 * API service configuration interface
 */
export interface ApiConfig {
  readonly port: number;
  readonly environment: string;
  readonly serviceName: string;
  readonly version: string;
  readonly databaseUrl: string;
}

// ==================== Feedback Types ====================

/**
 * Feedback counts by type.
 */
export interface FeedbackCounts {
  readonly helpful: number;
  readonly not_helpful: number;
  readonly neutral: number;
}

// ==================== Evidence Types ====================

/**
 * Represents a section in the evidence log.
 */
export interface EvidenceSection {
  readonly heading: string;
  readonly content: string;
}

/**
 * Intermediate state for section parsing.
 */
export interface SectionAccumulator {
  readonly sections: readonly EvidenceSection[];
  readonly currentHeading: string;
  readonly currentLines: readonly string[];
}

// ==================== Risk Rules Types ====================

/**
 * Request body for creating a risk rule
 */
export interface CreateRiskRuleRequestBody {
  readonly tenantId: string;
  readonly name: string;
  readonly description?: string;
  readonly actionTypes: readonly string[];
  readonly environment?: "production" | "staging" | "development";
  readonly blastRadius?: BlastRadius;
  readonly reversibility?: Reversibility;
  readonly dataImpact?: DataImpact;
  readonly scoreModifier?: number;
  readonly productionMultiplier?: number;
  readonly incidentModeMultiplier?: number;
  readonly offHoursMultiplier?: number;
  readonly requireApprovalThreshold?: number;
  readonly blockThreshold?: number;
  readonly enabled?: boolean;
  readonly priority?: number;
  readonly createdBy?: string;
}

/**
 * Request body for updating a risk rule
 */
export interface UpdateRiskRuleRequestBody {
  readonly tenantId: string;
  readonly name?: string;
  readonly description?: string;
  readonly actionTypes?: readonly string[];
  readonly environment?: "production" | "staging" | "development";
  readonly blastRadius?: BlastRadius | null;
  readonly reversibility?: Reversibility | null;
  readonly dataImpact?: DataImpact | null;
  readonly scoreModifier?: number;
  readonly productionMultiplier?: number;
  readonly incidentModeMultiplier?: number;
  readonly offHoursMultiplier?: number;
  readonly requireApprovalThreshold?: number;
  readonly blockThreshold?: number;
  readonly enabled?: boolean;
  readonly priority?: number;
}
