/**
 * OpenAIClient - Main API client for OpenAI integration.
 *
 * IMPORTANT SAFETY NOTE:
 * - The LLM is treated as an untrusted helper.
 * - Its outputs MUST NOT be executed directly as code or commands.
 * - Deterministic application logic is responsible for validating and deciding
 *   whether to act on any suggestion.
 *
 * @module openaiClient/client
 */

import OpenAI from "openai";
import { config } from "../core/config.js";
import { logger } from "../core/logger.js";
import { LLMError, getErrorMessage } from "../core/errors.js";
import {
  OPENAI_DEFAULTS,
  OPENAI_CONSTANTS,
  TIME_CONSTANTS,
  OPENAI_MESSAGES,
} from "../constants/index.js";
import type { Event, Evidence, LLMAnalysisResult } from "../core/types.js";
import { buildAnalysisPrompt } from "../integrations/prompts.js";
import { validateResponse } from "./validation.js";
import { manageTokenBudget } from "./tokenManager.js";
import { handleOpenAIError } from "./errors.js";
import { delay } from "../core/utils.js";

/**
 * OpenAI client configuration.
 */
interface OpenAIConfig {
  readonly model: string;
  readonly maxTokens: number;
  readonly temperature: number;
  readonly timeout: number;
}

/**
 * Creates OpenAI client configuration from environment variables.
 *
 * @returns Configured OpenAI client instance
 */
const createOpenAIClient = (): OpenAI => {
  return new OpenAI({
    apiKey: config.OPENAI_API_KEY,
    timeout: config.OPENAI_TIMEOUT_MS || OPENAI_CONSTANTS.DEFAULT_TIMEOUT_MS,
  });
};

/**
 * Creates client configuration from environment variables with defaults.
 *
 * @returns Client configuration object
 */
const createClientConfig = (): OpenAIConfig => {
  return {
    model: config.OPENAI_MODEL || OPENAI_DEFAULTS.MODEL,
    maxTokens: config.OPENAI_MAX_TOKENS || OPENAI_DEFAULTS.MAX_TOKENS,
    temperature: config.OPENAI_TEMPERATURE || OPENAI_DEFAULTS.TEMPERATURE,
    timeout: config.OPENAI_TIMEOUT_MS || OPENAI_CONSTANTS.DEFAULT_TIMEOUT_MS,
  } as const;
};

export class OpenAIClient {
  private readonly client: OpenAI;
  private readonly clientConfig: OpenAIConfig;

  constructor() {
    this.client = createOpenAIClient();
    this.clientConfig = createClientConfig();
  }

  /**
   * Analyzes an incident using OpenAI API with proper prompt construction,
   * response parsing, and anti-hallucination validation.
   *
   * @param event - The incident event to analyze
   * @param evidence - Collected evidence about the incident
   * @returns Structured analysis result with confidence score
   */
  async analyzeIncident(event: Event, evidence: Evidence): Promise<LLMAnalysisResult> {
    const startTime = Date.now();

    try {
      const truncatedEvidence = manageTokenBudget(
        event,
        evidence,
        OPENAI_CONSTANTS.MAX_PROMPT_TOKENS
      );
      const prompt = buildAnalysisPrompt(event, truncatedEvidence);
      const response = await this.callOpenAIWithRetry(prompt);
      const analysis = this.parseResponse(response, event.id);
      const validation = validateResponse(analysis, { event, evidence });

      this.logValidationResults(validation, event.id);

      return this.enrichAnalysis(analysis, startTime);
    } catch (error) {
      throw handleOpenAIError(error, this.clientConfig.timeout);
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
      (acc, dep) => {
        const ecosystem = dep.ecosystem ?? "unknown";
        acc[ecosystem] = (acc[ecosystem] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    // Count dependencies by change type
    const changeTypeCounts = depChanges.reduce(
      (acc, dep) => {
        acc[dep.type] = (acc[dep.type] ?? 0) + 1;
        return acc;
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
            files: configChanges.map((c) => c.file),
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
      log: (validation: { errors: string[] }, eventId: string) =>
        logger.warn("OpenAI response validation failed", { eventId, errors: validation.errors }),
    },
    {
      condition: (validation: { warnings: string[] }) => validation.warnings.length > 0,
      log: (validation: { warnings: string[] }, eventId: string) =>
        logger.warn("OpenAI response validation warnings", {
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
    validation: { valid: boolean; errors: string[]; warnings: string[] },
    eventId: string
  ): void => {
    this.validationLoggers
      .filter(({ condition }) => condition(validation))
      .map(({ log }) => log(validation, eventId));
  };

  /**
   * Creates OpenAI API request configuration.
   *
   * @param prompt - The prompt to send
   * @returns OpenAI API request configuration
   */
  private createRequestConfig = (prompt: string) => {
    return {
      model: this.clientConfig.model,
      messages: [{ role: "user" as const, content: prompt }],
      max_tokens: this.clientConfig.maxTokens,
      temperature: this.clientConfig.temperature,
      response_format: { type: "json_object" as const },
    };
  };

  /**
   * Extracts content from OpenAI completion response.
   *
   * @param completion - OpenAI completion response
   * @returns Response content
   * @throws {Error} If no content is found
   */
  private extractResponseContent = (completion: OpenAI.Chat.Completions.ChatCompletion): string => {
    return (
      completion.choices[0]?.message?.content ??
      (() => {
        throw new LLMError(OPENAI_MESSAGES.NO_CONTENT);
      })()
    );
  };

  /**
   * Calculates exponential backoff delay for retry attempts.
   *
   * @param attempt - Current attempt number (1-indexed)
   * @returns Delay in milliseconds
   */
  private calculateBackoffDelay = (attempt: number): number => {
    return (
      Math.pow(OPENAI_CONSTANTS.EXPONENTIAL_BACKOFF_BASE, attempt) *
      TIME_CONSTANTS.MILLISECONDS_PER_SECOND
    );
  };

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
    return statusCode === OPENAI_CONSTANTS.RATE_LIMIT_STATUS_CODE && attempt < maxRetries;
  };

  /**
   * Handles retry attempt with exponential backoff.
   *
   * @param attempt - Current attempt number
   * @param maxRetries - Maximum number of retries
   */
  private handleRetryAttempt = async (attempt: number, maxRetries: number): Promise<void> => {
    const delayMs = this.calculateBackoffDelay(attempt);

    logger.warn("OpenAI rate limit hit, retrying with exponential backoff", {
      attempt,
      maxRetries,
      delayMs,
    });
    await delay(delayMs);
  };

  /**
   * Attempts a single OpenAI API call.
   *
   * @param prompt - The prompt to send
   * @returns Response content
   * @throws {Error} If the API call fails
   */
  private attemptApiCall = async (prompt: string): Promise<string> => {
    const requestConfig = this.createRequestConfig(prompt);
    const completion = await this.client.chat.completions.create(requestConfig);
    return this.extractResponseContent(completion);
  };

  /**
   * Determines if retry should continue based on error and attempt count.
   *
   * @param error - The error that occurred
   * @param attempt - Current attempt number
   * @param maxRetries - Maximum number of retries
   * @returns True if retry should continue
   */
  private shouldContinueRetry = (error: unknown, attempt: number, maxRetries: number): boolean => {
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
   * @throws {Error} If all retry attempts fail
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
   * Calls OpenAI API with exponential backoff retry logic for rate limits.
   *
   * Uses recursive approach instead of for loop for cleaner functional style.
   *
   * @param prompt - The prompt to send to OpenAI
   * @param maxRetries - Maximum number of retry attempts
   * @returns Response content from OpenAI
   * @throws {Error} If all retry attempts fail
   */
  private callOpenAIWithRetry = async (
    prompt: string,
    maxRetries: number = OPENAI_CONSTANTS.MAX_RETRIES
  ): Promise<string> => {
    return this.attemptWithRetry(prompt, 1, maxRetries);
  };

  /**
   * Extracts JSON from response content (handles markdown-wrapped JSON).
   *
   * @param responseContent - Raw response content
   * @returns Extracted JSON string
   * @throws {Error} If no JSON is found
   */
  private extractJsonFromResponse = (responseContent: string): string => {
    return (
      responseContent.match(/\{[\s\S]*\}/)?.[0] ??
      (() => {
        throw new LLMError(OPENAI_MESSAGES.NO_JSON_FOUND);
      })()
    );
  };

  /**
   * Safe field extractor with default values.
   */
  private readonly fieldExtractors = {
    string: <T extends string>(value: unknown, defaultValue: T): T =>
      (typeof value === "string" && value.length > 0 ? value : defaultValue) as T,

    optionalString: (value: unknown): string | undefined =>
      typeof value === "string" && value.length > 0 ? value : undefined,

    array: <T>(value: unknown, defaultValue: T[]): T[] =>
      (Array.isArray(value) ? value : defaultValue) as T[],

    optional: <T>(value: unknown, defaultValue: T | undefined): T | undefined =>
      value !== null && value !== undefined ? (value as T) : defaultValue,
  } as const;

  /**
   * Validates and normalizes a code annotation from AI response.
   *
   * @param annotation - Raw annotation object from AI
   * @returns Validated annotation or null if invalid
   */
  private validateCodeAnnotation = (
    annotation: unknown
  ): LLMAnalysisResult["codeAnnotations"] extends (infer T)[] | undefined ? T | null : never => {
    if (!annotation || typeof annotation !== "object") return null;

    const ann = annotation as Record<string, unknown>;
    const path = typeof ann.path === "string" ? ann.path : null;
    const line = typeof ann.line === "number" ? ann.line : null;
    const level = typeof ann.level === "string" ? ann.level : "warning";
    const message = typeof ann.message === "string" ? ann.message : null;

    // Path and message are required
    if (!path || !message) return null;

    return {
      path,
      line: line ?? 1,
      level: (["failure", "warning", "notice"].includes(level) ? level : "warning") as
        | "failure"
        | "warning"
        | "notice",
      message,
      title: typeof ann.title === "string" ? ann.title : undefined,
    };
  };

  /**
   * Parses code annotations array from AI response.
   *
   * @param rawAnnotations - Raw annotations array from AI
   * @returns Validated array of code annotations
   */
  private parseCodeAnnotations = (
    rawAnnotations: unknown
  ): LLMAnalysisResult["codeAnnotations"] => {
    if (!Array.isArray(rawAnnotations)) return [];

    return rawAnnotations
      .map(this.validateCodeAnnotation)
      .filter((ann): ann is NonNullable<typeof ann> => ann !== null);
  };

  /**
   * Validates and normalizes a detected dependency change from AI response.
   *
   * @param change - Raw dependency change object from AI
   * @returns Validated dependency change or null if invalid
   */
  private validateDependencyChange = (
    change: unknown
  ): LLMAnalysisResult["detectedDependencyChanges"] extends (infer T)[] | undefined
    ? T | null
    : never => {
    if (!change || typeof change !== "object") return null;

    const dep = change as Record<string, unknown>;
    const name = typeof dep.name === "string" ? dep.name : null;
    const type = typeof dep.type === "string" ? dep.type : null;

    if (!name || !type || !["added", "removed", "updated"].includes(type)) return null;

    return {
      name,
      type: type as "added" | "removed" | "updated",
      oldVersion: typeof dep.oldVersion === "string" ? dep.oldVersion : undefined,
      newVersion: typeof dep.newVersion === "string" ? dep.newVersion : undefined,
      ecosystem: typeof dep.ecosystem === "string" ? dep.ecosystem : undefined,
    };
  };

  /**
   * Validates and normalizes a detected build config change from AI response.
   *
   * @param change - Raw build config change object from AI
   * @returns Validated build config change or null if invalid
   */
  private validateBuildConfigChange = (
    change: unknown
  ): LLMAnalysisResult["detectedBuildConfigChanges"] extends (infer T)[] | undefined
    ? T | null
    : never => {
    if (!change || typeof change !== "object") return null;

    const cfg = change as Record<string, unknown>;
    const file = typeof cfg.file === "string" ? cfg.file : null;
    const changeType = typeof cfg.changeType === "string" ? cfg.changeType : null;
    const summary = typeof cfg.summary === "string" ? cfg.summary : null;

    if (
      !file ||
      !changeType ||
      !summary ||
      !["added", "modified", "deleted"].includes(changeType)
    ) {
      return null;
    }

    return {
      file,
      changeType: changeType as "added" | "modified" | "deleted",
      summary,
    };
  };

  /**
   * Parses detected dependency changes array from AI response.
   *
   * @param rawChanges - Raw dependency changes array from AI
   * @returns Validated array of dependency changes
   */
  private parseDependencyChanges = (
    rawChanges: unknown
  ): LLMAnalysisResult["detectedDependencyChanges"] => {
    if (!Array.isArray(rawChanges)) return [];

    return rawChanges
      .map(this.validateDependencyChange)
      .filter((change): change is NonNullable<typeof change> => change !== null);
  };

  /**
   * Parses detected build config changes array from AI response.
   *
   * @param rawChanges - Raw build config changes array from AI
   * @returns Validated array of build config changes
   */
  private parseBuildConfigChanges = (
    rawChanges: unknown
  ): LLMAnalysisResult["detectedBuildConfigChanges"] => {
    if (!Array.isArray(rawChanges)) return [];

    return rawChanges
      .map(this.validateBuildConfigChange)
      .filter((change): change is NonNullable<typeof change> => change !== null);
  };

  /**
   * Parses JSON string and creates LLM analysis result with defaults.
   *
   * @param parsed - Parsed JSON object
   * @param eventId - Event ID for the analysis
   * @returns LLM analysis result with required fields
   */
  private createAnalysisFromParsed = (
    parsed: Record<string, unknown>,
    eventId: string
  ): LLMAnalysisResult => {
    const { string, optionalString, array, optional } = this.fieldExtractors;

    return {
      eventId,
      summary: string(parsed.summary, OPENAI_MESSAGES.NO_SUMMARY),
      identifiedCause: optionalString(parsed.identifiedCause),
      impactAssessment: optional(
        parsed.impactAssessment,
        undefined
      ) as LLMAnalysisResult["impactAssessment"],
      confidence: string(parsed.confidence, "medium") as LLMAnalysisResult["confidence"],
      confidenceScore: undefined, // Will be calculated by safety.ts
      reasoning: string(parsed.reasoning, ""),
      codeAnnotations: this.parseCodeAnnotations(parsed.codeAnnotations),
      recommendedActions: array(
        parsed.recommendedActions,
        []
      ) as LLMAnalysisResult["recommendedActions"],
      uncertainties: array(parsed.uncertainties, []) as string[],
      evidenceUsed: array(parsed.evidenceUsed, []) as LLMAnalysisResult["evidenceUsed"],
      relatedIncidents: array(parsed.relatedIncidents, []) as string[],
      nextSteps: array(parsed.nextSteps, []) as string[],
      analyzedAt: new Date().toISOString(),
      // Phase 3: AI-extracted structured data
      detectedDependencyChanges: this.parseDependencyChanges(parsed.detectedDependencyChanges),
      detectedBuildConfigChanges: this.parseBuildConfigChanges(parsed.detectedBuildConfigChanges),
    };
  };

  /**
   * Parses OpenAI response and validates JSON structure.
   *
   * @param responseContent - Raw response content from OpenAI
   * @param eventId - Event ID for the analysis
   * @returns Parsed and validated LLM analysis result
   * @throws {Error} If parsing fails
   */
  private parseResponse = (responseContent: string, eventId: string): LLMAnalysisResult => {
    try {
      const jsonString = this.extractJsonFromResponse(responseContent);
      const parsed = JSON.parse(jsonString) as Record<string, unknown>;
      return this.createAnalysisFromParsed(parsed, eventId);
    } catch (error) {
      throw new LLMError(`Failed to parse OpenAI response: ${getErrorMessage(error)}`);
    }
  };
}
