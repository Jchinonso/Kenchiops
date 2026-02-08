/**
 * OpenAI Embedding Client
 *
 * Provides vector embedding generation using OpenAI's embedding models.
 * Supports tiered models (LIGHT, STANDARD, PREMIUM) for cost optimization.
 * Used for RAG (Retrieval-Augmented Generation) to enable semantic search over
 * code diffs, documentation, and incident history.
 *
 * @module llm/providers/openai/embedding
 */

import OpenAI from "openai";
import { config } from "../../../core/config.js";
import { createLogger } from "../../../core/logger.js";
import { ExternalServiceError, getErrorMessage } from "../../../core/errors.js";
import {
  EMBEDDING_CONFIG,
  OPENAI_CONSTANTS,
  EMBEDDING_TIERS,
  OPENROUTER_DEFAULTS,
  type EmbeddingTierName,
} from "../../../constants/index.js";
import {
  withCircuitBreaker,
  getCircuitStatus,
  SERVICE_KEYS,
} from "../../../http/circuitBreaker.js";
import type {
  EmbeddingResult,
  BatchEmbeddingResult,
  EmbeddingProvider,
  EmbeddingClientConfig,
} from "../../types.js";

// Re-export types for backward compatibility
export type { EmbeddingResult, BatchEmbeddingResult, EmbeddingProvider };

const logger = createLogger("embedding-client");

/**
 * Checks if we're using OpenRouter provider.
 */
const isOpenRouterProvider = (): boolean => config.LLM_PROVIDER === "openrouter";

/**
 * Gets the effective base URL for the LLM provider.
 */
const getEffectiveBaseUrl = (): string | undefined => {
  if (config.LLM_BASE_URL) {
    return config.LLM_BASE_URL;
  }
  if (isOpenRouterProvider()) {
    return OPENROUTER_DEFAULTS.BASE_URL;
  }
  return undefined;
};

/**
 * Creates the OpenAI client instance for embeddings.
 * Supports OpenRouter and other OpenAI-compatible providers.
 *
 * Note: Embedding models may vary by provider. OpenRouter may not support
 * all OpenAI embedding models (text-embedding-3-small/large).
 */
const createOpenAIClient = (): OpenAI => {
  const baseURL = getEffectiveBaseUrl();
  return new OpenAI({
    apiKey: config.OPENAI_API_KEY,
    timeout: EMBEDDING_CONFIG.TIMEOUT_MS,
    ...(baseURL && { baseURL }),
  });
};

/**
 * Creates embedding client configuration from tier.
 */
const createClientConfig = (tier: EmbeddingTierName = "STANDARD"): EmbeddingClientConfig => {
  const tierConfig = EMBEDDING_TIERS[tier];
  return {
    model: tierConfig.model,
    dimension: tierConfig.dimension,
    timeout: EMBEDDING_CONFIG.TIMEOUT_MS,
    maxBatchSize: EMBEDDING_CONFIG.MAX_BATCH_SIZE,
    tier,
  };
};

/**
 * Validates input text for embedding.
 * Returns null if valid, error message if invalid.
 */
const validateEmbeddingInput = (text: string): string | null => {
  const trimmedLength = text.trim().length;
  return trimmedLength === 0 ? "Input text cannot be empty" : null;
};

/**
 * Validates batch input for embedding.
 * Returns null if valid, error message if invalid.
 */
const validateBatchInput = (texts: readonly string[], maxBatchSize: number): string | null => {
  const validators = [
    { condition: texts.length === 0, message: "Batch cannot be empty" },
    {
      condition: texts.length > maxBatchSize,
      message: `Batch size ${texts.length} exceeds maximum ${maxBatchSize}`,
    },
    {
      condition: texts.some((text) => text.trim().length === 0),
      message: "All texts must be non-empty",
    },
  ];

  const failedValidator = validators.find((validator) => validator.condition);
  return failedValidator?.message ?? null;
};

/**
 * EmbeddingClient - Generates vector embeddings using OpenAI API.
 *
 * @example
 * ```typescript
 * // Standard tier (default)
 * const client = new EmbeddingClient();
 *
 * // Specific tier for cost optimization
 * const lightClient = new EmbeddingClient("LIGHT");
 * const premiumClient = new EmbeddingClient("PREMIUM");
 *
 * // Single embedding
 * const result = await client.generateEmbedding("TypeScript compilation failed");
 * // result.embedding.length === tier dimension (512/1536/3072)
 *
 * // Batch embeddings
 * const batchResult = await client.generateBatchEmbeddings([
 *   "Database connection error",
 *   "API timeout in authentication service",
 * ]);
 * ```
 */
export class EmbeddingClient {
  private readonly client: OpenAI;
  private readonly clientConfig: EmbeddingClientConfig;

  constructor(tier: EmbeddingTierName = "STANDARD") {
    this.client = createOpenAIClient();
    this.clientConfig = createClientConfig(tier);

    logger.info("Embedding client initialized", {
      provider: config.LLM_PROVIDER,
      baseURL: getEffectiveBaseUrl() || "default",
      tier: this.clientConfig.tier,
      model: this.clientConfig.model,
      dimension: this.clientConfig.dimension,
    });
  }

  /**
   * Gets the current tier configuration.
   */
  readonly getTier = (): EmbeddingTierName => this.clientConfig.tier;

  /**
   * Gets the embedding dimension for this client's tier.
   */
  readonly getDimension = (): number => this.clientConfig.dimension;

  /**
   * Gets the circuit breaker status for the embedding service.
   * Shares circuit with main OpenAI client for unified rate limiting.
   */
  static getCircuitBreakerStatus(): {
    state: string;
    failures: number;
    isOpen: boolean;
    lastFailure: number | null;
  } {
    return getCircuitStatus(SERVICE_KEYS.OPENAI);
  }

  /**
   * Checks if the embedding service is available (circuit not open).
   */
  static isAvailable(): boolean {
    return !getCircuitStatus(SERVICE_KEYS.OPENAI).isOpen;
  }

  /**
   * Generates a vector embedding for a single text.
   *
   * @param text - The text to embed
   * @returns Promise resolving to the embedding result
   * @throws {ExternalServiceError} If the API call fails or circuit is open
   */
  readonly generateEmbedding = async (text: string): Promise<EmbeddingResult> => {
    const validationError = validateEmbeddingInput(text);
    if (validationError) {
      throw new ExternalServiceError("openai", `Embedding validation failed: ${validationError}`);
    }

    const startTime = Date.now();

    try {
      const response = await this.callEmbeddingAPI([text.trim()]);
      const embedding = response.data[0]?.embedding;

      if (!embedding) {
        throw new ExternalServiceError("openai", "No embedding returned from OpenAI");
      }

      const result: EmbeddingResult = {
        embedding: Object.freeze([...embedding]),
        tokenCount: response.usage?.total_tokens ?? 0,
        model: this.clientConfig.model,
        tier: this.clientConfig.tier,
        dimension: this.clientConfig.dimension,
      };

      this.logEmbeddingTelemetry(1, result.tokenCount, Date.now() - startTime);
      return result;
    } catch (error) {
      throw this.handleEmbeddingError(error, Date.now() - startTime);
    }
  };

  /**
   * Generates vector embeddings for multiple texts in a single API call.
   * More efficient than calling generateEmbedding repeatedly.
   *
   * @param texts - Array of texts to embed
   * @returns Promise resolving to batch embedding result
   * @throws {ExternalServiceError} If the API call fails or input is invalid
   */
  readonly generateBatchEmbeddings = async (
    texts: readonly string[]
  ): Promise<BatchEmbeddingResult> => {
    const validationError = validateBatchInput(texts, this.clientConfig.maxBatchSize);
    if (validationError) {
      throw new ExternalServiceError(
        "openai",
        `Batch embedding validation failed: ${validationError}`
      );
    }

    const startTime = Date.now();
    const trimmedTexts = texts.map((text) => text.trim());

    try {
      const response = await this.callEmbeddingAPI(trimmedTexts);

      // Sort by index to maintain input order
      const sortedData = [...response.data].sort(
        (firstItem, secondItem) => firstItem.index - secondItem.index
      );

      const embeddings = sortedData.map((item) => Object.freeze([...item.embedding]));

      const result: BatchEmbeddingResult = {
        embeddings: Object.freeze(embeddings),
        totalTokens: response.usage?.total_tokens ?? 0,
        model: this.clientConfig.model,
        tier: this.clientConfig.tier,
        dimension: this.clientConfig.dimension,
      };

      this.logEmbeddingTelemetry(texts.length, result.totalTokens, Date.now() - startTime);
      return result;
    } catch (error) {
      throw this.handleEmbeddingError(error, Date.now() - startTime);
    }
  };

  /**
   * Calls the OpenAI embedding API with circuit breaker protection.
   * Passes dimensions parameter for text-embedding-3 models.
   */
  private readonly callEmbeddingAPI = async (
    texts: readonly string[]
  ): Promise<OpenAI.Embeddings.CreateEmbeddingResponse> =>
    withCircuitBreaker(
      SERVICE_KEYS.OPENAI,
      async () =>
        this.client.embeddings.create({
          model: this.clientConfig.model,
          input: [...texts],
          dimensions: this.clientConfig.dimension,
        }),
      {
        threshold: OPENAI_CONSTANTS.CIRCUIT_BREAKER_THRESHOLD,
        resetTimeout: OPENAI_CONSTANTS.CIRCUIT_BREAKER_RESET_MS,
      }
    );

  /**
   * Logs embedding telemetry for monitoring and cost tracking.
   */
  private readonly logEmbeddingTelemetry = (
    textCount: number,
    tokenCount: number,
    durationMs: number
  ): void => {
    logger.info("Embedding API call completed", {
      provider: "openai",
      operation: "generateEmbedding",
      durationMs,
      textCount,
      tokenCount,
      model: this.clientConfig.model,
      tier: this.clientConfig.tier,
      dimension: this.clientConfig.dimension,
      tokensPerText: textCount > 0 ? Math.round(tokenCount / textCount) : 0,
    });
  };

  /**
   * Handles and enriches embedding API errors.
   *
   * @param error - The error that occurred
   * @param durationMs - Duration of the failed call in milliseconds
   * @returns ExternalServiceError with enriched context
   */
  private readonly handleEmbeddingError = (
    error: unknown,
    durationMs: number
  ): ExternalServiceError => {
    const message = getErrorMessage(error);

    logger.error("Embedding API call failed", {
      provider: "openai",
      operation: "generateEmbedding",
      durationMs,
      error: message,
      model: this.clientConfig.model,
      tier: this.clientConfig.tier,
    });

    return new ExternalServiceError("openai", `Embedding generation failed: ${message}`);
  };
}

// ==================== Client Cache ====================

/**
 * Cached client instances by tier for reuse.
 * Avoids recreating clients for each request.
 */
const clientCache = new Map<EmbeddingTierName, EmbeddingClient>();

/**
 * Gets or creates an EmbeddingClient for the specified tier.
 * Clients are cached for reuse.
 *
 * @param tier - The embedding tier to use
 * @returns Cached or new EmbeddingClient instance
 */
export const getEmbeddingClient = (tier: EmbeddingTierName = "STANDARD"): EmbeddingClient => {
  const cached = clientCache.get(tier);
  if (cached) {
    return cached;
  }

  const client = new EmbeddingClient(tier);
  clientCache.set(tier, client);
  return client;
};

/**
 * Clears the client cache. Useful for testing or reconfiguration.
 */
export const clearClientCache = (): void => {
  clientCache.clear();
};

// ==================== Provider Factory ====================

/**
 * Creates an embedding provider for the specified tier.
 * Currently uses OpenAI, but interface supports future providers.
 *
 * @param tier - The embedding tier to use
 * @returns EmbeddingProvider instance
 */
export const createEmbeddingProvider = (tier: EmbeddingTierName = "STANDARD"): EmbeddingProvider =>
  getEmbeddingClient(tier);
