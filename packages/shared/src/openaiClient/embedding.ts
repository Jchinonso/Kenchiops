/**
 * OpenAI Embedding Client
 *
 * Provides vector embedding generation using OpenAI's text-embedding-3-small model.
 * Used for RAG (Retrieval-Augmented Generation) to enable semantic search over
 * code diffs, documentation, and incident history.
 *
 * @module openaiClient/embedding
 */

import OpenAI from "openai";
import { config } from "../core/config.js";
import { logger } from "../core/logger.js";
import { ExternalServiceError, getErrorMessage } from "../core/errors.js";
import { EMBEDDING_CONFIG, OPENAI_CONSTANTS } from "../constants/index.js";
import { withCircuitBreaker, getCircuitStatus, SERVICE_KEYS } from "../http/circuitBreaker.js";

/**
 * Result of an embedding operation.
 */
export interface EmbeddingResult {
  /** The generated embedding vector */
  readonly embedding: readonly number[];
  /** Token count used for this embedding */
  readonly tokenCount: number;
  /** Model used for embedding */
  readonly model: string;
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
}

/**
 * OpenAI client configuration for embeddings.
 */
interface EmbeddingClientConfig {
  readonly model: string;
  readonly timeout: number;
  readonly maxBatchSize: number;
}

/**
 * Creates the OpenAI client instance for embeddings.
 */
const createOpenAIClient = (): OpenAI =>
  new OpenAI({
    apiKey: config.OPENAI_API_KEY,
    timeout: EMBEDDING_CONFIG.TIMEOUT_MS,
  });

/**
 * Creates embedding client configuration from constants.
 */
const createClientConfig = (): EmbeddingClientConfig => ({
  model: EMBEDDING_CONFIG.MODEL,
  timeout: EMBEDDING_CONFIG.TIMEOUT_MS,
  maxBatchSize: EMBEDDING_CONFIG.MAX_BATCH_SIZE,
});

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
 * const client = new EmbeddingClient();
 *
 * // Single embedding
 * const result = await client.generateEmbedding("TypeScript compilation failed");
 * // result.embedding.length === 1536
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

  constructor() {
    this.client = createOpenAIClient();
    this.clientConfig = createClientConfig();
  }

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
      throw new ExternalServiceError("OpenAI", `Embedding validation failed: ${validationError}`);
    }

    const startTime = Date.now();

    try {
      const response = await this.callEmbeddingAPI([text.trim()]);
      const embedding = response.data[0]?.embedding;

      if (!embedding) {
        throw new ExternalServiceError("OpenAI", "No embedding returned from OpenAI");
      }

      const result: EmbeddingResult = {
        embedding: Object.freeze([...embedding]),
        tokenCount: response.usage?.total_tokens ?? 0,
        model: this.clientConfig.model,
      };

      this.logEmbeddingTelemetry(1, result.tokenCount, Date.now() - startTime);
      return result;
    } catch (error) {
      throw this.handleEmbeddingError(error);
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
        "OpenAI",
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
      };

      this.logEmbeddingTelemetry(texts.length, result.totalTokens, Date.now() - startTime);
      return result;
    } catch (error) {
      throw this.handleEmbeddingError(error);
    }
  };

  /**
   * Calls the OpenAI embedding API with circuit breaker protection.
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
    logger.info("Embedding generated", {
      textCount,
      tokenCount,
      durationMs,
      model: this.clientConfig.model,
      tokensPerText: textCount > 0 ? Math.round(tokenCount / textCount) : 0,
    });
  };

  /**
   * Handles and enriches embedding API errors.
   */
  private readonly handleEmbeddingError = (error: unknown): ExternalServiceError => {
    const message = getErrorMessage(error);

    logger.error("Embedding API error", {
      error: message,
      model: this.clientConfig.model,
    });

    return new ExternalServiceError("OpenAI", `Embedding generation failed: ${message}`);
  };
}
