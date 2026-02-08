/**
 * LLM Provider Types
 *
 * Provider-agnostic interfaces for LLM integrations.
 * Implementations can be swapped without changing consumer code.
 *
 * @module llm/types
 */

import type { Event, Evidence, LLMAnalysisResult } from "../core/types.js";
import type { EmbeddingTierName } from "../constants/index.js";

// ==================== Analysis Provider ====================

/**
 * Provider-agnostic interface for LLM analysis.
 * Implementations: OpenAI, Anthropic, Google, etc.
 */
export interface LLMAnalysisProvider {
  /**
   * Analyzes an incident using the LLM.
   *
   * @param event - The incident event to analyze
   * @param evidence - Collected evidence about the incident
   * @returns Structured analysis result
   */
  readonly analyzeIncident: (event: Event, evidence: Evidence) => Promise<LLMAnalysisResult>;

  /**
   * Checks if the provider is available (e.g., circuit breaker not open).
   */
  readonly isAvailable: () => boolean;
}

// ==================== Embedding Provider ====================

/**
 * Result of a single embedding operation.
 */
export interface EmbeddingResult {
  /** The generated embedding vector */
  readonly embedding: readonly number[];
  /** Token count used for this embedding */
  readonly tokenCount: number;
  /** Model used for embedding */
  readonly model: string;
  /** Tier used for this embedding */
  readonly tier: string;
  /** Embedding dimension */
  readonly dimension: number;
}

/**
 * Result of a batch embedding operation.
 */
export interface BatchEmbeddingResult {
  /** Array of embeddings in the same order as input texts */
  readonly embeddings: ReadonlyArray<readonly number[]>;
  /** Total token count used across all embeddings */
  readonly totalTokens: number;
  /** Model used for embedding */
  readonly model: string;
  /** Tier used for this embedding */
  readonly tier: string;
  /** Embedding dimension */
  readonly dimension: number;
}

/**
 * Provider-agnostic interface for embedding generation.
 * Implementations: OpenAI, Cohere, local models, etc.
 */
export interface EmbeddingProvider {
  /**
   * Generates a vector embedding for a single text.
   *
   * @param text - The text to embed
   * @returns Promise resolving to the embedding result
   */
  readonly generateEmbedding: (text: string) => Promise<EmbeddingResult>;

  /**
   * Generates vector embeddings for multiple texts in a single operation.
   *
   * @param texts - Array of texts to embed
   * @returns Promise resolving to batch embedding result
   */
  readonly generateBatchEmbeddings: (texts: readonly string[]) => Promise<BatchEmbeddingResult>;

  /**
   * Gets the tier/quality level for this provider.
   */
  readonly getTier: () => string;

  /**
   * Gets the embedding dimension for this provider.
   */
  readonly getDimension: () => number;

  /**
   * Checks if the provider is available.
   */
  readonly isAvailable?: () => boolean;
}

// ==================== Provider Configuration ====================

/**
 * Base configuration for LLM providers.
 */
export interface LLMProviderConfig {
  /** API key for authentication */
  readonly apiKey: string;
  /** Request timeout in milliseconds */
  readonly timeout: number;
  /** Maximum retry attempts */
  readonly maxRetries?: number;
}

/**
 * Configuration for analysis providers.
 */
export interface AnalysisProviderConfig extends LLMProviderConfig {
  /** Model identifier */
  readonly model: string;
  /** Maximum tokens for response */
  readonly maxTokens: number;
  /** Temperature for response generation */
  readonly temperature: number;
}

/**
 * Configuration for embedding providers.
 */
export interface EmbeddingProviderConfig extends LLMProviderConfig {
  /** Model identifier */
  readonly model: string;
  /** Embedding dimension */
  readonly dimension: number;
  /** Maximum batch size */
  readonly maxBatchSize: number;
}

// ==================== Provider Factory ====================

/**
 * Factory function type for creating LLM analysis providers.
 */
export type AnalysisProviderFactory = (
  config?: Partial<AnalysisProviderConfig>
) => LLMAnalysisProvider;

/**
 * Factory function type for creating embedding providers.
 */
export type EmbeddingProviderFactory = (
  config?: Partial<EmbeddingProviderConfig>
) => EmbeddingProvider;

// ==================== Provider Registry ====================

/**
 * Supported LLM provider names.
 */
export type LLMProviderName = "openai" | "anthropic" | "gemini" | "local";

/**
 * Registry entry for a provider.
 */
export interface ProviderRegistryEntry {
  readonly name: LLMProviderName;
  readonly createAnalysisProvider?: AnalysisProviderFactory;
  readonly createEmbeddingProvider?: EmbeddingProviderFactory;
}

// ==================== OpenAI Client Types ====================

/**
 * OpenAI client configuration.
 */
export interface OpenAIConfig {
  readonly model: string;
  readonly maxTokens: number;
  readonly temperature: number;
  readonly timeout: number;
}

// ==================== Embedding Client Types ====================

/**
 * OpenAI client configuration for embeddings.
 */
export interface EmbeddingClientConfig {
  readonly model: string;
  readonly dimension: number;
  readonly timeout: number;
  readonly maxBatchSize: number;
  readonly tier: EmbeddingTierName;
}

// ==================== Token Manager Types ====================

/**
 * Token estimation result with metadata for optimization decisions.
 */
export interface TokenEstimate {
  readonly evidenceTokens: number;
  readonly totalEstimatedTokens: number;
  readonly requiresTruncation: boolean;
}

// ==================== Response Parser Validation Types ====================

/**
 * Raw annotation structure from AI response
 */
export interface RawAnnotation {
  readonly evidence_id?: unknown;
  readonly snippet?: unknown;
  readonly explanation?: unknown;
}

/**
 * Raw secondary finding from AI response
 */
export interface RawSecondaryFinding {
  readonly issue?: unknown;
  readonly evidence_id?: unknown;
}

/**
 * Valid confidence levels
 */
export type ConfidenceLevel = "low" | "medium" | "high";

// ==================== Response Parser Types ====================

/** Test failure shape for logging */
export interface TestFailureLogShape {
  readonly testName: string;
  readonly expected?: string | null;
  readonly actual?: string | null;
  readonly error: string;
}

/** Lint error shape for logging */
export interface LintErrorLogShape {
  readonly code: string;
  readonly message: string;
  readonly file: string;
  readonly line: number;
}

/** Valid priority values for recommended actions */
export type ActionPriority = "immediate" | "high" | "medium" | "low";

// ==================== Validation Types ====================

/**
 * Pre-computed lookup structures for validation.
 */
export interface ValidationLookups {
  readonly commits: Set<string>;
  readonly incidents: Set<string>;
  readonly documentTitles: Set<string>;
  readonly logs: Map<string, string>;
  readonly logValues: string[];
}

/**
 * Evidence type validator - dispatch table for O(1) type lookup.
 */
export type EvidenceValidator = (
  ref: string,
  context: { event: Event; evidence: Evidence },
  lookups: ValidationLookups
) => boolean;

// ==================== JSON Extraction Types ====================

/**
 * State for JSON extraction state machine.
 */
export interface JsonExtractionState {
  readonly depth: number;
  readonly startIndex: number;
  readonly endIndex: number | null;
  readonly isInString: boolean;
  readonly isEscaped: boolean;
}
