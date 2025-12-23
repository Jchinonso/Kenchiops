/**
 * GitHub Service
 *
 * Handles GitHub API interactions and OpenAI analysis integration.
 * Uses caching for Octokit instances per installation.
 */

import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/rest";
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
  getErrorMessage,
  wrapError,
} from "@kenchi/shared";
import { appConfig } from "../config/appConfig.js";
import type { PullRequestWebhook, CheckRunWebhook } from "../types/githubTypes.js";

const logger = createLogger("github-app");

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
    logger.info("OpenAI client initialized");
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

  logger.info("Creating new Octokit instance", { installationId });

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
  id: generateEventId("pr"),
  type: "MANUAL_TRIGGER",
  source: "github",
  timestamp: new Date().toISOString(),
  severity: "medium",
  title: `PR #${webhook.pull_request.number}: ${webhook.pull_request.title}`,
  payload: {
    action: webhook.action,
    prNumber: webhook.pull_request.number,
    title: webhook.pull_request.title,
    body: webhook.pull_request.body || "",
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
  id: generateEventId("check"),
  type: "CICD_FAILURE",
  source: "github",
  timestamp: new Date().toISOString(),
  severity: "high",
  title: `CI Failure: ${webhook.check_run.name}`,
  payload: {
    action: webhook.action,
    checkName: webhook.check_run.name,
    conclusion: webhook.check_run.conclusion,
    repository: webhook.repository.full_name,
    output: webhook.check_run.output,
    headSha: webhook.check_run.head_sha,
    pullRequestCount: webhook.check_run.pull_requests.length,
  },
  metadata: {
    owner: webhook.repository.owner.login,
    repo: webhook.repository.name,
    installationId: webhook.installation?.id,
    checkRunId: webhook.check_run.id,
    headSha: webhook.check_run.head_sha,
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

  logger.info("Starting analysis", {
    eventId: event.id,
    type: event.type,
  });

  try {
    const analysis = await openaiClient.analyzeIncident(event, evidence);
    const confidence = calculateConfidenceScore(analysis, evidence);

    logger.info("Analysis completed", {
      eventId: event.id,
      confidence: confidence.finalScore,
      gating: confidence.gatingDecision,
    });

    return { analysis, confidence, event };
  } catch (error) {
    logger.error("Analysis failed", {
      eventId: event.id,
      error: getErrorMessage(error),
    });

    throw new LLMError(wrapError("Failed to analyze", error));
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

    logger.info("Posted PR comment", {
      owner,
      repo,
      prNumber,
    });
  } catch (error) {
    logger.error("Failed to post PR comment", {
      owner,
      repo,
      prNumber,
      error: getErrorMessage(error),
    });

    throw new ExternalServiceError("GitHub", wrapError("Failed to post comment", error), {
      owner,
      repo,
      prNumber,
    });
  }
};

/**
 * Annotation for a check run
 */
export interface CheckAnnotation {
  readonly path: string;
  readonly start_line: number;
  readonly end_line: number;
  readonly annotation_level: "notice" | "warning" | "failure";
  readonly message: string;
  readonly title?: string;
}

/**
 * GitHub API annotation batch size limit
 */
const MAX_ANNOTATIONS_PER_CALL = 50;

/**
 * Split array into batches of specified size
 */
const batchArray = <T>(array: T[], batchSize: number): T[][] => {
  const batchCount = Math.ceil(array.length / batchSize);
  return Array.from({ length: batchCount }, (_, i) =>
    array.slice(i * batchSize, (i + 1) * batchSize)
  );
};

/**
 * Create a check run with annotations
 * This posts line-level feedback directly on the PR files
 */
export const createCheckRunWithAnnotations = async (
  installationId: number,
  owner: string,
  repo: string,
  headSha: string,
  name: string,
  summary: string,
  annotations: CheckAnnotation[]
): Promise<void> => {
  try {
    const octokit = await getOctokit(installationId);

    // Split annotations into batches (GitHub limits to 50 per API call)
    const annotationBatches = batchArray(annotations, MAX_ANNOTATIONS_PER_CALL);

    // Create the check run with first batch
    const { data: checkRun } = await octokit.rest.checks.create({
      owner,
      repo,
      name,
      head_sha: headSha,
      status: "completed",
      conclusion: annotations.some((a) => a.annotation_level === "failure") ? "failure" : "neutral",
      output: {
        title: "KenchiOps CI Analysis",
        summary,
        annotations: annotationBatches[0] || [],
      },
    });

    // Update with remaining batches (if any)
    const remainingBatches = annotationBatches.slice(1);
    await Promise.all(
      remainingBatches.map((batch) =>
        octokit.rest.checks.update({
          owner,
          repo,
          check_run_id: checkRun.id,
          output: {
            title: "KenchiOps CI Analysis",
            summary,
            annotations: batch,
          },
        })
      )
    );

    logger.info("Created check run with annotations", {
      owner,
      repo,
      headSha,
      checkRunId: checkRun.id,
      annotationCount: annotations.length,
    });
  } catch (error) {
    logger.error("Failed to create check run with annotations", {
      owner,
      repo,
      headSha,
      error: getErrorMessage(error),
    });

    throw new ExternalServiceError("GitHub", wrapError("Failed to create check run", error), {
      owner,
      repo,
      headSha,
    });
  }
};
