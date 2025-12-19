/**
 * GitHub Service
 *
 * Handles GitHub API interactions and OpenAI analysis integration.
 * Uses caching for Octokit instances per installation.
 */

import { createAppAuth } from '@octokit/auth-app';
import { Octokit } from '@octokit/rest';
import {
  createLogger,
  OpenAIClient,
  calculateConfidenceScore,
  type Event,
  type Evidence,
  type LLMAnalysisResult,
  type ConfidenceScoreResult,
  LLMError,
  ExternalServiceError,
} from '@kenchi/shared';
import { appConfig } from '../config/appConfig.js';
import type { PullRequestWebhook, CheckRunWebhook } from '../types/githubTypes.js';

const logger = createLogger('github-app');

/**
 * Cached Octokit instances per installation
 */
const octokitCache = new Map<number, Octokit>();

/**
 * Singleton OpenAI client
 */
let openaiClientInstance: OpenAIClient | null = null;

/**
 * Get or create the OpenAI client singleton
 */
export const getOpenAIClient = (): OpenAIClient => {
  if (!openaiClientInstance) {
    openaiClientInstance = new OpenAIClient();
    logger.info('OpenAI client initialized');
  }
  return openaiClientInstance;
};

/**
 * Get or create an authenticated Octokit instance for an installation
 */
export const getOctokit = async (installationId: number): Promise<Octokit> => {
  // Check cache first
  const cached = octokitCache.get(installationId);
  if (cached) {
    return cached;
  }

  logger.info('Creating new Octokit instance', { installationId });

  const auth = createAppAuth({
    appId: appConfig.github.appId,
    privateKey: appConfig.github.privateKey,
    installationId,
  });

  const octokit = new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId: appConfig.github.appId,
      privateKey: appConfig.github.privateKey,
      installationId,
    },
  });

  // Cache the instance
  octokitCache.set(installationId, octokit);

  return octokit;
};

/**
 * Analysis result with confidence scoring
 */
export interface AnalysisResult {
  readonly analysis: LLMAnalysisResult;
  readonly confidence: ConfidenceScoreResult;
  readonly event: Event;
}

/**
 * Generate a unique event ID
 */
const generateEventId = (prefix: string): string => {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 11);
  return `${prefix}_${timestamp}_${random}`;
};

/**
 * Create an Event from a pull request webhook
 */
export const createEventFromPR = (webhook: PullRequestWebhook): Event => ({
  id: generateEventId('pr'),
  type: 'MANUAL_TRIGGER',
  source: 'github',
  timestamp: new Date().toISOString(),
  severity: 'medium',
  title: `PR #${webhook.pull_request.number}: ${webhook.pull_request.title}`,
  payload: {
    action: webhook.action,
    prNumber: webhook.pull_request.number,
    title: webhook.pull_request.title,
    body: webhook.pull_request.body || '',
    repository: webhook.repository.full_name,
    author: webhook.pull_request.user.login,
    headSha: webhook.pull_request.head.sha,
    baseBranch: webhook.pull_request.base.ref,
    headBranch: webhook.pull_request.head.ref,
  },
  metadata: {
    owner: webhook.repository.owner.login,
    repo: webhook.repository.name,
    installationId: webhook.installation?.id,
  },
});

/**
 * Create an Event from a check run webhook
 */
export const createEventFromCheckRun = (webhook: CheckRunWebhook): Event => ({
  id: generateEventId('check'),
  type: 'CICD_FAILURE',
  source: 'github',
  timestamp: new Date().toISOString(),
  severity: 'high',
  title: `CI Failure: ${webhook.check_run.name}`,
  payload: {
    action: webhook.action,
    checkName: webhook.check_run.name,
    conclusion: webhook.check_run.conclusion,
    repository: webhook.repository.full_name,
    output: webhook.check_run.output,
  },
  metadata: {
    owner: webhook.repository.owner.login,
    repo: webhook.repository.name,
    installationId: webhook.installation?.id,
    checkRunId: webhook.check_run.id,
  },
});

/**
 * Create minimal evidence for analysis
 */
export const createMinimalEvidence = (eventId: string): Evidence => ({
  eventId,
  collectedAt: new Date().toISOString(),
  logs: [],
});

/**
 * Perform OpenAI analysis on an event
 */
export const performAnalysis = async (event: Event): Promise<AnalysisResult> => {
  const evidence = createMinimalEvidence(event.id);
  const openaiClient = getOpenAIClient();

  logger.info('Starting analysis', {
    eventId: event.id,
    type: event.type,
  });

  try {
    const analysis = await openaiClient.analyzeIncident(event, evidence);
    const confidence = calculateConfidenceScore(analysis, evidence);

    logger.info('Analysis completed', {
      eventId: event.id,
      confidence: confidence.finalScore,
      gating: confidence.gatingDecision,
    });

    return { analysis, confidence, event };
  } catch (error) {
    logger.error('Analysis failed', {
      eventId: event.id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    throw new LLMError(
      `Failed to analyze: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
};

/**
 * Post a comment on a pull request
 */
export const postPRComment = async (
  installationId: number,
  owner: string,
  repo: string,
  prNumber: number,
  body: string
): Promise<void> => {
  try {
    const octokit = await getOctokit(installationId);

    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: prNumber,
      body,
    });

    logger.info('Posted PR comment', {
      owner,
      repo,
      prNumber,
    });
  } catch (error) {
    logger.error('Failed to post PR comment', {
      owner,
      repo,
      prNumber,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    throw new ExternalServiceError(
      'GitHub',
      `Failed to post comment: ${error instanceof Error ? error.message : 'Unknown error'}`,
      { owner, repo, prNumber }
    );
  }
};

/**
 * Format analysis result as a GitHub comment
 */
export const formatAnalysisComment = (result: AnalysisResult): string => {
  const { analysis, confidence } = result;
  const confidencePercent = Math.round(confidence.finalScore * 100);

  let comment = `## AI Analysis\n\n`;
  comment += `**Confidence:** ${confidencePercent}% (${confidence.gatingDecision.replace('_', ' ')})\n\n`;
  comment += `### Summary\n${analysis.summary}\n\n`;

  if (analysis.identifiedCause) {
    comment += `### Identified Cause\n${analysis.identifiedCause}\n\n`;
  }

  if (analysis.recommendedActions && analysis.recommendedActions.length > 0) {
    comment += `### Recommended Actions\n`;
    for (const action of analysis.recommendedActions) {
      comment += `- **${action.priority}:** ${action.description}\n`;
    }
    comment += '\n';
  }

  if (analysis.uncertainties && analysis.uncertainties.length > 0) {
    comment += `### Uncertainties\n`;
    for (const uncertainty of analysis.uncertainties) {
      comment += `- ${uncertainty}\n`;
    }
    comment += '\n';
  }

  comment += `---\n*Generated by Kenchi DevOps Assistant*`;

  return comment;
};
