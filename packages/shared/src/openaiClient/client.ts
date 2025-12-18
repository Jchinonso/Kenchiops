/**
 * OpenAIClient - Main API client for OpenAI integration.
 *
 * IMPORTANT SAFETY NOTE:
 * - The LLM is treated as an untrusted helper.
 * - Its outputs MUST NOT be executed directly as code or commands.
 * - Deterministic application logic is responsible for validating and deciding
 *   whether to act on any suggestion.
 */

import OpenAI from 'openai';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { 
  OPENAI_DEFAULTS,
  OPENAI_CONSTANTS,
  TIME_CONSTANTS,
} from '../constants.js';
import type {
  Event,
  Evidence,
  LLMAnalysisResult,
} from '../types.js';
import { buildAnalysisPrompt } from '../prompts.js';
import { validateResponse } from './validation.js';
import { manageTokenBudget } from './tokenManager.js';
import { handleOpenAIError, sleep } from './errors.js';

interface OpenAIConfig {
  model: string;
  maxTokens: number;
  temperature: number;
  timeout: number;
}

export class OpenAIClient {
  private readonly client: OpenAI;
  private readonly clientConfig: OpenAIConfig;

  constructor() {
    this.client = new OpenAI({
      apiKey: config.OPENAI_API_KEY,
      timeout: config.OPENAI_TIMEOUT_MS || OPENAI_CONSTANTS.DEFAULT_TIMEOUT_MS,
    });

    this.clientConfig = {
      model: config.OPENAI_MODEL || 'gpt-4-turbo-2024-04-09',
      maxTokens: config.OPENAI_MAX_TOKENS || 4096,
      temperature: config.OPENAI_TEMPERATURE || OPENAI_DEFAULTS.TEMPERATURE,
      timeout: config.OPENAI_TIMEOUT_MS || OPENAI_CONSTANTS.DEFAULT_TIMEOUT_MS,
    };
  }

  /**
   * Analyzes an incident using OpenAI API with proper prompt construction,
   * response parsing, and anti-hallucination validation.
   *
   * @param event - The incident event to analyze
   * @param evidence - Collected evidence about the incident
   * @returns Structured analysis result with confidence score
   */
  async analyzeIncident(
    event: Event,
    evidence: Evidence
  ): Promise<LLMAnalysisResult> {
    const startTime = Date.now();

    try {
      // 1. Manage token budget - truncate evidence if needed
      const truncatedEvidence = manageTokenBudget(event, evidence, OPENAI_CONSTANTS.MAX_PROMPT_TOKENS);

      // 2. Build prompt
      const prompt = buildAnalysisPrompt(event, truncatedEvidence);

      // 3. Call OpenAI API with retry logic
      const response = await this.callOpenAIWithRetry(prompt);

      // 4. Parse and validate response
      const analysis = this.parseResponse(response, event.id);

      // 5. Validate against hallucinations
      const validation = validateResponse(analysis, { event, evidence });

      if (!validation.valid) {
        logger.warn('OpenAI response validation failed', {
          eventId: event.id,
          errors: validation.errors,
        });
      }

      if (validation.warnings.length > 0) {
        logger.warn('OpenAI response validation warnings', {
          eventId: event.id,
          warnings: validation.warnings,
        });
      }

      // 6. Add metadata
      const processingTime = (Date.now() - startTime) / TIME_CONSTANTS.MILLISECONDS_PER_SECOND;
      analysis.processingTime = processingTime;
      analysis.llmModel = this.clientConfig.model;
      analysis.analyzedAt = new Date().toISOString();

      return analysis;
    } catch (error) {
      throw handleOpenAIError(error, this.clientConfig.timeout);
    }
  }

  /**
   * Calls OpenAI API with exponential backoff retry logic for rate limits.
   */
  private async callOpenAIWithRetry(
    prompt: string,
    maxRetries: number = OPENAI_CONSTANTS.MAX_RETRIES
  ): Promise<string> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const completion = await this.client.chat.completions.create({
          model: this.clientConfig.model,
          messages: [
            {
              role: 'user',
              content: prompt,
            },
          ],
          max_tokens: this.clientConfig.maxTokens,
          temperature: this.clientConfig.temperature,
          response_format: { type: 'json_object' }, // Request JSON response
        });

        const content = completion.choices[0]?.message?.content;
        if (!content) {
          throw new Error('No content in OpenAI response');
        }

        return content;
      } catch (error: unknown) {
        const err = error instanceof Error ? error : new Error(String(error));
        lastError = err;

        // Check if it's a rate limit error
        const statusCode = (error as { status?: number }).status;
        if (statusCode === OPENAI_CONSTANTS.RATE_LIMIT_STATUS_CODE && attempt < maxRetries) {
          // Exponential backoff: base^attempt seconds
          const delayMs = Math.pow(OPENAI_CONSTANTS.EXPONENTIAL_BACKOFF_BASE, attempt) * TIME_CONSTANTS.MILLISECONDS_PER_SECOND;
          logger.warn('OpenAI rate limit hit, retrying with exponential backoff', {
            attempt,
            maxRetries,
            delayMs,
          });
          await sleep(delayMs);
          continue;
        }

        // For other errors or if we've exhausted retries, throw
        throw error;
      }
    }

    throw lastError;
  }

  /**
   * Parses OpenAI response and validates JSON structure.
   */
  private parseResponse(
    responseContent: string,
    eventId: string
  ): LLMAnalysisResult {
    try {
      // Extract JSON from response (sometimes wrapped in markdown)
      const jsonMatch = responseContent.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Ensure required fields are present
      const analysis: LLMAnalysisResult = {
        eventId,
        summary: parsed.summary || 'No summary provided',
        identifiedCause: parsed.identifiedCause || undefined,
        impactAssessment: parsed.impactAssessment || undefined,
        confidence: parsed.confidence || 'medium',
        confidenceScore: undefined, // Will be calculated by safety.ts
        reasoning: parsed.reasoning || '',
        recommendedActions: parsed.recommendedActions || [],
        uncertainties: parsed.uncertainties || [],
        evidenceUsed: parsed.evidenceUsed || [],
        relatedIncidents: parsed.relatedIncidents || [],
        nextSteps: parsed.nextSteps || [],
        analyzedAt: new Date().toISOString(),
      };

      return analysis;
    } catch (error) {
      throw new Error(`Failed to parse OpenAI response: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
