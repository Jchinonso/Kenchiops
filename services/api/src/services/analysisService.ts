/**
 * Analysis Service
 *
 * Handles CI failure analysis using OpenAI.
 * Uses singleton pattern for OpenAI client to enable connection reuse.
 */

import {
  OpenAIClient,
  calculateConfidenceScore,
  createLogger,
  type Event,
  type Evidence,
  type LLMAnalysisResult,
  LLMError,
} from '@kenchi/shared';
import type { AnalyzeRequest, AnalyzeResponse, AnalysisContext } from '../types/apiTypes.js';

const logger = createLogger('api');

/**
 * Singleton OpenAI client instance
 */
let openaiClientInstance: OpenAIClient | null = null;

/**
 * Get or create the OpenAI client singleton
 */
const getOpenAIClient = (): OpenAIClient => {
  if (!openaiClientInstance) {
    openaiClientInstance = new OpenAIClient();
    logger.info('OpenAI client initialized');
  }
  return openaiClientInstance;
};

/**
 * Generate a unique event ID
 */
const generateEventId = (): string => {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 11);
  return `evt_${timestamp}_${random}`;
};

/**
 * Create analysis context (Event and Evidence) from request
 */
export const createAnalysisContext = (request: AnalyzeRequest): AnalysisContext => {
  const eventId = generateEventId();

  const event: Event = {
    id: eventId,
    type: 'CICD_FAILURE',
    source: 'n8n',
    timestamp: new Date().toISOString(),
    severity: 'high',
    title: `CI Failure in ${request.repository}`,
    payload: {
      repository: request.repository,
      failureLog: request.failure_log,
      commit: request.commit || 'unknown',
    },
  };

  const evidence: Evidence = {
    eventId,
    logs: [
      {
        level: 'ERROR',
        message: request.failure_log,
        timestamp: new Date().toISOString(),
        source: 'ci',
      },
    ],
    collectedAt: new Date().toISOString(),
  };

  return { event, evidence };
};

/**
 * Analyze CI failure using OpenAI
 */
export const analyzeFailure = async (
  event: Event,
  evidence: Evidence
): Promise<LLMAnalysisResult> => {
  const openaiClient = getOpenAIClient();

  try {
    const result = await openaiClient.analyzeIncident(event, evidence);
    return result;
  } catch (error) {
    logger.error('OpenAI analysis failed', {
      eventId: event.id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new LLMError(
      `Failed to analyze CI failure: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
};

/**
 * Format analysis result into API response
 */
export const formatAnalysisResponse = (
  analysisResult: LLMAnalysisResult,
  evidence: Evidence,
  repository: string
): AnalyzeResponse => {
  const confidenceResult = calculateConfidenceScore(analysisResult, evidence);

  return {
    analysis: analysisResult.summary,
    identified_cause: analysisResult.identifiedCause,
    confidence: confidenceResult.finalScore,
    recommended_actions: analysisResult.recommendedActions,
    full_analysis: analysisResult,
    repository,
  };
};

/**
 * Complete analysis flow: create context, analyze, format response
 */
export const performAnalysis = async (request: AnalyzeRequest): Promise<AnalyzeResponse> => {
  const { event, evidence } = createAnalysisContext(request);

  logger.info('CI failure analysis requested', {
    eventId: event.id,
    repository: request.repository,
  });

  const analysisResult = await analyzeFailure(event, evidence);

  logger.info('Analysis completed', {
    eventId: event.id,
    confidence: calculateConfidenceScore(analysisResult, evidence).finalScore,
    hasActions: (analysisResult.recommendedActions?.length ?? 0) > 0,
  });

  return formatAnalysisResponse(analysisResult, evidence, request.repository);
};
