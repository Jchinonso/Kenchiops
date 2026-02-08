/**
 * GitHub Issues Connector
 *
 * Fetches issues from GitHub repositories for ingestion into RAG.
 * Supports pagination, label filtering, and tech stack extraction.
 *
 * @module rag/githubIssuesConnector
 */

import { createLogger } from "../core/logger.js";
import { getErrorMessage, ExternalServiceError } from "../core/errors.js";
import { resilientGet } from "../http/resilientClient.js";
import {
  EXTERNAL_SOURCE_TYPES,
  EXTERNAL_SOURCE_CONFIG,
  TECH_STACK_TAGS,
  GITHUB_API_CONFIG,
  type TechStackTag,
} from "../constants/index.js";
import type { ExternalSource } from "../database/index.js";
import { registerConnector } from "./externalKnowledge.js";
import type {
  ExternalDocument,
  FetchResult,
  ExternalSourceConnector,
  GitHubIssue,
  GitHubAuthConfig,
} from "./types.js";

const logger = createLogger("github-issues-connector");

// ==================== Constants ====================

/**
 * Label to tech stack tag mapping.
 */
const LABEL_TAG_MAP: ReadonlyArray<{ pattern: string; tag: TechStackTag }> = [
  { pattern: "typescript", tag: TECH_STACK_TAGS.TYPESCRIPT },
  { pattern: "javascript", tag: TECH_STACK_TAGS.JAVASCRIPT },
  { pattern: "python", tag: TECH_STACK_TAGS.PYTHON },
  { pattern: "go", tag: TECH_STACK_TAGS.GO },
  { pattern: "rust", tag: TECH_STACK_TAGS.RUST },
  { pattern: "java", tag: TECH_STACK_TAGS.JAVA },
  { pattern: "react", tag: TECH_STACK_TAGS.REACT },
  { pattern: "node", tag: TECH_STACK_TAGS.NODE },
  { pattern: "docker", tag: TECH_STACK_TAGS.DOCKER },
  { pattern: "kubernetes", tag: TECH_STACK_TAGS.KUBERNETES },
  { pattern: "aws", tag: TECH_STACK_TAGS.AWS },
  { pattern: "gcp", tag: TECH_STACK_TAGS.GCP },
  { pattern: "azure", tag: TECH_STACK_TAGS.AZURE },
  { pattern: "postgres", tag: TECH_STACK_TAGS.POSTGRESQL },
  { pattern: "redis", tag: TECH_STACK_TAGS.REDIS },
  { pattern: "ci", tag: TECH_STACK_TAGS.GITHUB_ACTIONS },
  { pattern: "github-actions", tag: TECH_STACK_TAGS.GITHUB_ACTIONS },
  { pattern: "jest", tag: TECH_STACK_TAGS.JEST },
  { pattern: "pytest", tag: TECH_STACK_TAGS.PYTEST },
];

// ==================== Helper Functions ====================

/**
 * Parses auth config from JSONB.
 */
const parseAuthConfig = (authConfig: unknown): GitHubAuthConfig | null => {
  if (!authConfig || typeof authConfig !== "object") {
    return null;
  }

  const config = authConfig as Record<string, unknown>;
  if (typeof config.owner !== "string" || typeof config.repo !== "string") {
    return null;
  }

  return {
    token: typeof config.token === "string" ? config.token : undefined,
    owner: config.owner,
    repo: config.repo,
    labels: Array.isArray(config.labels) ? config.labels : undefined,
    state:
      config.state === "open" || config.state === "closed" || config.state === "all"
        ? config.state
        : "all",
  };
};

/**
 * Extracts tech stack tags from issue labels.
 */
const extractTechStackTags = (labels: ReadonlyArray<{ name: string }>): readonly TechStackTag[] => {
  const tags = new Set<TechStackTag>();

  labels.forEach((label) => {
    const lowerLabel = label.name.toLowerCase();
    LABEL_TAG_MAP.forEach(({ pattern, tag }) => {
      if (lowerLabel.includes(pattern)) {
        tags.add(tag);
      }
    });
  });

  return Object.freeze([...tags]);
};

/**
 * Builds issue content for embedding.
 */
const buildIssueContent = (issue: GitHubIssue): string => {
  const parts: string[] = [
    `# ${issue.title}`,
    "",
    `**Issue #${issue.number}** | Status: ${issue.state}`,
    `Created: ${issue.created_at}`,
  ];

  if (issue.labels.length > 0) {
    const labelNames = issue.labels.map((label) => label.name).join(", ");
    parts.push(`Labels: ${labelNames}`);
  }

  parts.push("");

  if (issue.body) {
    parts.push(issue.body);
  } else {
    parts.push("(No description provided)");
  }

  return parts.join("\n");
};

/**
 * Converts GitHub issue to ExternalDocument.
 */
const issueToDocument = (issue: GitHubIssue): ExternalDocument => ({
  title: `#${issue.number}: ${issue.title}`,
  content: buildIssueContent(issue),
  sourceUrl: issue.html_url,
  techStackTags: extractTechStackTags(issue.labels),
  metadata: {
    issueNumber: issue.number,
    state: issue.state,
    createdAt: issue.created_at,
    updatedAt: issue.updated_at,
    closedAt: issue.closed_at,
    labelCount: issue.labels.length,
  },
});

/**
 * Fetches issues from GitHub API using resilient HTTP client.
 */
const fetchGitHubIssues = async (
  config: GitHubAuthConfig,
  page: number
): Promise<{ issues: readonly GitHubIssue[]; hasMore: boolean }> => {
  const url = new URL(`${GITHUB_API_CONFIG.BASE_URL}/repos/${config.owner}/${config.repo}/issues`);
  url.searchParams.set("state", config.state ?? "all");
  url.searchParams.set("per_page", GITHUB_API_CONFIG.ISSUES_PER_PAGE.toString());
  url.searchParams.set("page", page.toString());
  url.searchParams.set("sort", "updated");
  url.searchParams.set("direction", "desc");

  if (config.labels && config.labels.length > 0) {
    url.searchParams.set("labels", config.labels.join(","));
  }

  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "Kenchi-RAG-Connector",
  };

  if (config.token) {
    headers.Authorization = `Bearer ${config.token}`;
  }

  const startTime = Date.now();

  try {
    const response = await resilientGet<readonly GitHubIssue[]>(url.toString(), {
      headers,
    });

    const durationMs = Date.now() - startTime;

    logger.info("GitHub issues fetched", {
      provider: "github",
      operation: "listIssues",
      durationMs,
      statusCode: response.status,
      owner: config.owner,
      repo: config.repo,
      page,
    });

    // resilientGet returns data directly; pagination check via status
    // Note: Link header not available via resilientGet, use result length heuristic
    const issues = response.data;
    const hasMore = issues.length >= GITHUB_API_CONFIG.ISSUES_PER_PAGE;

    return { issues: Object.freeze(issues), hasMore };
  } catch (error) {
    const durationMs = Date.now() - startTime;

    logger.error("GitHub issues fetch failed", {
      provider: "github",
      operation: "listIssues",
      durationMs,
      owner: config.owner,
      repo: config.repo,
      page,
      error: getErrorMessage(error),
    });

    throw new ExternalServiceError("github", `Failed to fetch issues: ${getErrorMessage(error)}`, {
      retryable: true,
      metadata: { owner: config.owner, repo: config.repo, page, durationMs },
    });
  }
};

// ==================== Connector Implementation ====================

/**
 * Fetches issues from GitHub with pagination support.
 */
const fetchGitHubIssuesWithPagination = async (
  source: ExternalSource,
  cursor?: string
): Promise<FetchResult> => {
  const config = parseAuthConfig(source.authConfig);
  if (!config) {
    logger.error("Invalid GitHub auth config", { sourceId: source.id });
    return {
      documents: Object.freeze([]),
      errorCount: 1,
    };
  }

  const page = cursor ? parseInt(cursor, 10) : 1;
  const maxDocs = EXTERNAL_SOURCE_CONFIG.MAX_DOCS_PER_SOURCE;

  logger.info("Fetching GitHub issues", {
    sourceId: source.id,
    owner: config.owner,
    repo: config.repo,
    page,
  });

  try {
    const { issues, hasMore } = await fetchGitHubIssues(config, page);

    // Filter out pull requests (GitHub API returns them as issues)
    const actualIssues = issues.filter((issue) => !issue.pull_request);

    // Convert to documents
    const documents = actualIssues.map(issueToDocument);

    // Limit total documents
    const limitedDocs = documents.slice(0, maxDocs - source.docCount);

    logger.info("Fetched GitHub issues", {
      sourceId: source.id,
      fetched: issues.length,
      filtered: actualIssues.length,
      returned: limitedDocs.length,
      hasMore,
    });

    return {
      documents: Object.freeze(limitedDocs),
      errorCount: 0,
      nextCursor: hasMore ? (page + 1).toString() : undefined,
    };
  } catch (error) {
    logger.error("Failed to fetch GitHub issues", {
      sourceId: source.id,
      error: getErrorMessage(error),
    });

    return {
      documents: Object.freeze([]),
      errorCount: 1,
    };
  }
};

/**
 * GitHub Issues connector implementation.
 */
export const githubIssuesConnector: ExternalSourceConnector = {
  sourceType: EXTERNAL_SOURCE_TYPES.GITHUB_ISSUES,
  fetch: fetchGitHubIssuesWithPagination,
};

/**
 * Registers the GitHub Issues connector.
 * Call this during application initialization.
 */
export const initGitHubIssuesConnector = (): void => {
  registerConnector(githubIssuesConnector);
  logger.info("GitHub Issues connector registered");
};
