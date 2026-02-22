/**
 * CI Provider Registry
 *
 * Maps CI provider identifiers to their adapter implementations.
 * Follows the OAuth adapter registry pattern from the API service.
 *
 * @module adapters/ciProviderRegistry
 */

import {
  ValidationError,
  type CIProvider,
  type CILogFetcherPort,
  type CIOutputPort,
  type RequestContext,
} from "@kenchi/shared";
import type { CIProviderAdapters } from "../types/githubTypes.js";
import { githubWebhookAdapter } from "./githubWebhookAdapter.js";
import { githubLogFetcherAdapter } from "./githubLogFetcherAdapter.js";
import { githubOutputAdapter } from "./githubOutputAdapter.js";
import { gitlabWebhookAdapter } from "./gitlabWebhookAdapter.js";

// ==================== Stubs for Phases 3 & 4 ====================

const gitlabLogFetcherStub: CILogFetcherPort = {
  fetchBuildLogs: async (
    _buildId: string,
    _owner: string,
    _repo: string,
    _installationId: number,
    _context: RequestContext
  ) => {
    throw new ValidationError("GitLab log fetcher not yet implemented (Phase 3)", {
      operation: "fetchBuildLogs",
      metadata: { provider: "gitlab_ci" },
    });
  },
  fetchAllFailedLogs: async (
    _commitSha: string,
    _owner: string,
    _repo: string,
    _installationId: number,
    _context: RequestContext
  ) => {
    throw new ValidationError("GitLab log fetcher not yet implemented (Phase 3)", {
      operation: "fetchAllFailedLogs",
      metadata: { provider: "gitlab_ci" },
    });
  },
};

const gitlabOutputStub: CIOutputPort = {
  postAnalysisResults: async (_aggregation, _context) => {
    throw new ValidationError("GitLab output not yet implemented (Phase 4)", {
      operation: "postAnalysisResults",
      metadata: { provider: "gitlab_ci" },
    });
  },
};

// ==================== Registry ====================

const ADAPTERS: Readonly<Partial<Record<CIProvider, CIProviderAdapters>>> = {
  github_actions: {
    webhook: githubWebhookAdapter,
    logFetcher: githubLogFetcherAdapter,
    output: githubOutputAdapter,
  },
  gitlab_ci: {
    webhook: gitlabWebhookAdapter,
    logFetcher: gitlabLogFetcherStub,
    output: gitlabOutputStub,
  },
};

/**
 * Retrieve the CI provider adapters for a given provider.
 * Throws ValidationError if the provider is not yet supported.
 */
export const getCIProviderAdapters = (provider: CIProvider): CIProviderAdapters => {
  const adapters = ADAPTERS[provider];

  if (!adapters) {
    throw new ValidationError(`CI provider "${provider}" is not yet supported`, {
      operation: "getCIProviderAdapters",
      metadata: { provider },
    });
  }

  return adapters;
};

/**
 * Check whether adapters exist for the given CI provider.
 */
export const hasCIProvider = (provider: CIProvider): boolean => provider in ADAPTERS;
