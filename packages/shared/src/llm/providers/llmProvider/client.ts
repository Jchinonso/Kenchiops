/**
 * LLMClient - Main API client for LLM integration.
 *
 * IMPORTANT SAFETY NOTE:
 * - The LLM is treated as an untrusted helper.
 * - Its outputs MUST NOT be executed directly as code or commands.
 * - Deterministic application logic is responsible for validating and deciding
 *   whether to act on any suggestion.
 *
 * @module llm/providers/llmProvider/client
 */

import type OpenAI from "openai";
import { config } from "../../../core/config.js";
import { createLogger } from "../../../core/logger.js";
import { LLMError, getErrorMessage, ExternalServiceError } from "../../../core/errors.js";
import {
  LLM_DEFAULTS,
  OPENROUTER_DEFAULTS,
  LLM_CONSTANTS,
  TIME_CONSTANTS,
  LLM_MESSAGES,
  EXTERNAL_SERVICE_NAMES,
} from "../../../constants/index.js";
import type { Event, Evidence, LLMAnalysisResult } from "../../../core/types.js";
import { buildAnalysisPrompt } from "../../../integrations/prompts.js";
import { validateResponse } from "../../validation.js";
import { manageTokenBudget } from "../../tokenManager.js";
import { handleLLMError } from "./errors.js";
import { parseLLMResponse } from "../../responseParser.js";
import { delay } from "../../../core/utils.js";
import {
  withCircuitBreaker,
  getCircuitStatus,
  SERVICE_KEYS,
} from "../../../http/circuitBreaker.js";
import type { LLMAnalysisProvider, LLMConfig } from "../../types.js";
import { isOpenRouterProvider, getEffectiveBaseUrl, createLLMSDKClient } from "./clientFactory.js";

const logger = createLogger("llm-client");

/**
 * Creates client configuration from environment variables with defaults.
 * Uses OpenRouter defaults when LLM_PROVIDER=openrouter.
 *
 * @returns Client configuration object
 */
const createClientConfig = (): LLMConfig => {
  const useOpenRouter = isOpenRouterProvider();

  return {
    model:
      config.LLM_MODEL ||
      config.OPENAI_MODEL ||
      (useOpenRouter ? OPENROUTER_DEFAULTS.MODEL : LLM_DEFAULTS.MODEL),
    maxTokens:
      config.OPENAI_MAX_TOKENS ||
      (useOpenRouter ? OPENROUTER_DEFAULTS.MAX_TOKENS : LLM_DEFAULTS.MAX_TOKENS),
    temperature:
      config.OPENAI_TEMPERATURE ??
      (useOpenRouter ? OPENROUTER_DEFAULTS.TEMPERATURE : LLM_DEFAULTS.TEMPERATURE),
    timeout: config.OPENAI_TIMEOUT_MS || LLM_CONSTANTS.DEFAULT_TIMEOUT_MS,
  } as const;
};

/**
 * LLM analysis provider that wraps the OpenAI-compatible API with circuit breaker
 * protection, exponential backoff retry, token budget management, and response
 * validation. Supports both direct OpenAI and OpenRouter backends.
 */
export class LLMClient implements LLMAnalysisProvider {
  private readonly client: OpenAI;
  private readonly clientConfig: LLMConfig;

  constructor() {
    this.clientConfig = createClientConfig();
    this.client = createLLMSDKClient(this.clientConfig.timeout);

    logger.info("LLM client initialized", {
      provider: config.LLM_PROVIDER,
      model: this.clientConfig.model,
      baseURL: getEffectiveBaseUrl() || "default",
      maxTokens: this.clientConfig.maxTokens,
      temperature: this.clientConfig.temperature,
    });
  }

  /**
   * Gets the circuit breaker status for the LLM service.
   * Useful for health checks and monitoring.
   *
   * @returns Current circuit breaker status
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
   * Checks if the LLM service is available (circuit not open).
   * Static version for convenience.
   *
   * @returns True if service is available
   */
  static isAvailable(): boolean {
    return !getCircuitStatus(SERVICE_KEYS.OPENAI).isOpen;
  }

  /**
   * Instance method to check availability (implements LLMAnalysisProvider).
   *
   * @returns True if service is available
   */
  readonly isAvailable = (): boolean => LLMClient.isAvailable();

  /**
   * Gets the provider name for error messages and logging.
   *
   * @returns Provider name ("OpenRouter" or "OpenAI")
   */
  private getProviderName = (): string =>
    isOpenRouterProvider() ? EXTERNAL_SERVICE_NAMES.OPENROUTER : EXTERNAL_SERVICE_NAMES.OPENAI;

  /**
   * Analyzes an incident using LLM API with proper prompt construction,
   * response parsing, and anti-hallucination validation.
   *
   * @param event - The incident event to analyze
   * @param evidence - Collected evidence about the incident
   * @returns Structured analysis result with confidence score
   */
  async analyzeIncident(event: Event, evidence: Evidence): Promise<LLMAnalysisResult> {
    const startTime = Date.now();

    try {
      const originalLogCount = evidence.logs?.length ?? 0;
      const truncatedEvidence = manageTokenBudget(event, evidence, LLM_CONSTANTS.MAX_PROMPT_TOKENS);
      const truncatedLogCount = truncatedEvidence.logs?.length ?? 0;
      const prompt = buildAnalysisPrompt(event, truncatedEvidence);

      // Critical diagnostic: shows if truncation is causing test failure loss
      logger.info("LLM prompt prepared", {
        eventId: event.id,
        originalLogCount,
        truncatedLogCount,
        logsRemoved: originalLogCount - truncatedLogCount,
        promptLength: prompt.length,
        estimatedTokens: Math.ceil(prompt.length / 4),
        maxTokens: LLM_CONSTANTS.MAX_PROMPT_TOKENS,
      });

      const response = await this.callWithRetry(prompt);
      const durationMs = Date.now() - startTime;
      const analysis = this.parseResponse(response, event.id);
      const validation = validateResponse(analysis, { event, evidence });

      this.logValidationResults(validation, event.id);

      logger.info("LLM analyzeIncident completed", {
        provider: this.getProviderName(),
        operation: "analyzeIncident",
        durationMs,
        eventId: event.id,
        model: this.clientConfig.model,
      });

      return this.enrichAnalysis(analysis, startTime);
    } catch (error) {
      const durationMs = Date.now() - startTime;
      logger.error("LLM analyzeIncident failed", {
        provider: this.getProviderName(),
        operation: "analyzeIncident",
        durationMs,
        eventId: event.id,
        model: this.clientConfig.model,
      });
      throw handleLLMError(error, this.clientConfig.timeout, this.getProviderName());
    }
  }

  /**
   * Logs AI extraction telemetry for tracking accuracy and usage.
   *
   * @param analysis - The analysis result to log telemetry for
   */
  private logExtractionTelemetry = (analysis: LLMAnalysisResult): void => {
    const depChanges = analysis.detectedDependencyChanges ?? [];
    const configChanges = analysis.detectedBuildConfigChanges ?? [];

    // Count dependencies by ecosystem
    const ecosystemCounts = depChanges.reduce(
      (counts, dependency) => {
        const ecosystem = dependency.ecosystem ?? "unknown";
        counts[ecosystem] = (counts[ecosystem] ?? 0) + 1;
        return counts;
      },
      {} as Record<string, number>
    );

    // Count dependencies by change type
    const changeTypeCounts = depChanges.reduce(
      (counts, dependency) => {
        counts[dependency.type] = (counts[dependency.type] ?? 0) + 1;
        return counts;
      },
      {} as Record<string, number>
    );

    // Only log if there's extraction data
    if (depChanges.length > 0 || configChanges.length > 0) {
      logger.info("AI extraction telemetry", {
        eventId: analysis.eventId,
        extraction: {
          dependencyChanges: {
            total: depChanges.length,
            byEcosystem: ecosystemCounts,
            byType: changeTypeCounts,
          },
          buildConfigChanges: {
            total: configChanges.length,
            files: configChanges.map((configChange) => configChange.file),
          },
        },
      });
    }
  };

  /**
   * Enriches analysis result with metadata.
   *
   * @param analysis - Parsed analysis result
   * @param startTime - Analysis start timestamp
   * @returns Enriched analysis with metadata
   */
  private enrichAnalysis(analysis: LLMAnalysisResult, startTime: number): LLMAnalysisResult {
    const processingTime = (Date.now() - startTime) / TIME_CONSTANTS.MILLISECONDS_PER_SECOND;

    // Log AI extraction telemetry for tracking accuracy
    this.logExtractionTelemetry(analysis);

    return {
      ...analysis,
      processingTime,
      llmModel: this.clientConfig.model,
      analyzedAt: new Date().toISOString(),
    };
  }

  /**
   * Logging configurations for validation results.
   */
  private readonly validationLoggers = [
    {
      condition: (validation: { valid: boolean }) => !validation.valid,
      log: (validation: { errors: readonly string[] }, eventId: string) =>
        logger.warn("LLM output validation failed", { eventId, errors: validation.errors }),
    },
    {
      condition: (validation: { warnings: readonly string[] }) => validation.warnings.length > 0,
      log: (validation: { warnings: readonly string[] }, eventId: string) =>
        logger.warn("LLM output validation warnings", {
          eventId,
          warnings: validation.warnings,
        }),
    },
  ] as const;

  /**
   * Logs validation results (errors and warnings).
   *
   * @param validation - Validation result object
   * @param eventId - Event ID for logging context
   */
  private logValidationResults = (
    validation: { valid: boolean; errors: readonly string[]; warnings: readonly string[] },
    eventId: string
  ): void => {
    this.validationLoggers
      .filter(({ condition }) => condition(validation))
      .forEach(({ log }) => log(validation, eventId));
  };

  /**
   * Creates LLM API request configuration.
   *
   * Note: response_format is set for direct OpenAI and OpenRouter with Gemini.
   * OpenRouter supports this for Gemini models which reliably return JSON.
   *
   * @param prompt - The prompt to send
   * @returns API request configuration
   */
  private createRequestConfig = (
    prompt: string
  ): OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming => {
    const isOpenRouter = isOpenRouterProvider();
    const isGeminiModel = this.clientConfig.model.includes("gemini");

    // Enable JSON response format for:
    // - Direct OpenAI (always supported)
    // - OpenRouter with Gemini (supported and reliable)
    const shouldUseJsonFormat = !isOpenRouter || isGeminiModel;

    return {
      model: this.clientConfig.model,
      messages: [{ role: "user" as const, content: prompt }],
      max_tokens: this.clientConfig.maxTokens,
      temperature: this.clientConfig.temperature,
      // Enable JSON response format for supported providers/models
      ...(shouldUseJsonFormat && { response_format: { type: "json_object" as const } }),
    };
  };

  /**
   * Extracts content from LLM completion response.
   *
   * @param completion - Completion response
   * @returns Response content
   * @throws {LLMError} If no content is found
   */
  private extractResponseContent = (completion: OpenAI.Chat.Completions.ChatCompletion): string => {
    const content = completion.choices?.[0]?.message?.content;
    if (content === undefined || content === null) {
      throw new LLMError(LLM_MESSAGES.NO_CONTENT, { service: this.getProviderName() });
    }
    return content;
  };

  /**
   * Calculates exponential backoff delay for retry attempts.
   *
   * @param attempt - Current attempt number (1-indexed)
   * @returns Delay in milliseconds
   */
  private calculateBackoffDelay = (attempt: number): number =>
    LLM_CONSTANTS.EXPONENTIAL_BACKOFF_BASE ** attempt * TIME_CONSTANTS.MILLISECONDS_PER_SECOND;

  /**
   * Checks if error is a rate limit error that should be retried.
   *
   * @param error - Error to check
   * @param attempt - Current attempt number
   * @param maxRetries - Maximum number of retries
   * @returns True if error should trigger a retry
   */
  private shouldRetryRateLimit = (error: unknown, attempt: number, maxRetries: number): boolean => {
    const statusCode = (error as { status?: number }).status;
    return statusCode === LLM_CONSTANTS.RATE_LIMIT_STATUS_CODE && attempt < maxRetries;
  };

  /**
   * Handles retry attempt with exponential backoff.
   *
   * @param attempt - Current attempt number
   * @param maxRetries - Maximum number of retries
   */
  private handleRetryAttempt = async (attempt: number, maxRetries: number): Promise<void> => {
    const delayMs = this.calculateBackoffDelay(attempt);

    logger.warn("LLM rate limit hit, retrying with exponential backoff", {
      attempt,
      maxRetries,
      delayMs,
    });
    await delay(delayMs);
  };

  /**
   * Attempts a single LLM API call with circuit breaker protection.
   *
   * @param prompt - The prompt to send
   * @returns Response content
   * @throws {ExternalServiceError} If circuit breaker is open
   * @throws {LLMError} If the API call fails
   */
  private attemptApiCall = async (prompt: string): Promise<string> => {
    const requestConfig = this.createRequestConfig(prompt);

    return withCircuitBreaker(
      SERVICE_KEYS.OPENAI,
      async () => {
        const completion = await this.client.chat.completions.create(requestConfig);
        return this.extractResponseContent(completion);
      },
      {
        threshold: LLM_CONSTANTS.CIRCUIT_BREAKER_THRESHOLD,
        resetTimeout: LLM_CONSTANTS.CIRCUIT_BREAKER_RESET_MS,
      }
    );
  };

  /**
   * Determines if retry should continue based on error and attempt count.
   * Circuit breaker errors are not retryable.
   *
   * @param error - The error that occurred
   * @param attempt - Current attempt number
   * @param maxRetries - Maximum number of retries
   * @returns True if retry should continue
   */
  private shouldContinueRetry = (error: unknown, attempt: number, maxRetries: number): boolean => {
    // Don't retry if circuit breaker is open
    if (error instanceof ExternalServiceError) {
      return false;
    }

    const isRetryable = this.shouldRetryRateLimit(error, attempt, maxRetries);
    return isRetryable && attempt < maxRetries;
  };

  /**
   * Recursively attempts API call with retry logic.
   *
   * @param prompt - The prompt to send
   * @param attempt - Current attempt number
   * @param maxRetries - Maximum number of retries
   * @returns Response content
   * @throws {LLMError} If all retry attempts fail
   */
  private attemptWithRetry = async (
    prompt: string,
    attempt: number,
    maxRetries: number
  ): Promise<string> => {
    try {
      return await this.attemptApiCall(prompt);
    } catch (error: unknown) {
      const shouldContinue = this.shouldContinueRetry(error, attempt, maxRetries);

      // Early return: throw if we can't continue retrying
      if (!shouldContinue) {
        throw error;
      }

      // Handle retry with backoff and recursively try next attempt
      await this.handleRetryAttempt(attempt, maxRetries);
      return this.attemptWithRetry(prompt, attempt + 1, maxRetries);
    }
  };

  /**
   * Calls LLM API with exponential backoff retry logic for rate limits.
   *
   * Uses recursive approach instead of for loop for cleaner functional style.
   *
   * @param prompt - The prompt to send
   * @param maxRetries - Maximum number of retry attempts
   * @returns Response content from LLM
   * @throws {LLMError} If all retry attempts fail
   */
  private callWithRetry = async (
    prompt: string,
    maxRetries: number = LLM_CONSTANTS.MAX_RETRIES
  ): Promise<string> => this.attemptWithRetry(prompt, 1, maxRetries);

  /**
   * Parses LLM response and validates JSON structure.
   * Delegates to responseParser module for the actual parsing.
   *
   * @param responseContent - Raw response content from LLM
   * @param eventId - Event ID for the analysis
   * @returns Parsed and validated LLM analysis result
   * @throws {LLMError} If parsing fails
   */
  private parseResponse = (responseContent: string, eventId: string): LLMAnalysisResult => {
    try {
      return parseLLMResponse(responseContent, eventId);
    } catch (error) {
      logger.warn("JSON extraction from LLM output failed — logging preview for diagnostics", {
        eventId,
        outputLength: responseContent.length,
        outputPreview: responseContent.slice(0, 500),
        outputTail: responseContent.slice(-200),
      });
      throw new LLMError(`Failed to parse LLM response: ${getErrorMessage(error)}`, {
        service: this.getProviderName(),
      });
    }
  };
}
