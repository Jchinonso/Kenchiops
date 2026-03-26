/**
 * CI Provider Registry
 *
 * Maps CI provider identifiers to their adapter implementations.
 * Follows the OAuth adapter registry pattern from the API service.
 *
 * @module adapters/ciProviderRegistry
 */

import { ValidationError, type CIProvider } from "@kenchi/shared";
import type { CIProviderAdapters } from "../types/githubTypes.js";
import { githubWebhookAdapter } from "./githubWebhookAdapter.js";
import { githubLogFetcherAdapter } from "./githubLogFetcherAdapter.js";
import { githubOutputAdapter } from "./githubOutputAdapter.js";
import { gitlabWebhookAdapter } from "./gitlabWebhookAdapter.js";
import { createGitLabLogFetcherAdapter } from "./gitlabLogFetcherAdapter.js";
import { createGitLabOutputAdapter } from "./gitlabOutputAdapter.js";
import { circleciWebhookAdapter } from "./circleciWebhookAdapter.js";
import { createCircleCILogFetcherAdapter } from "./circleciLogFetcherAdapter.js";
import { createCircleCIOutputAdapter } from "./circleciOutputAdapter.js";

// ==================== Registry ====================

const ADAPTERS: Readonly<Partial<Record<CIProvider, CIProviderAdapters>>> = {
  github_actions: {
    webhook: githubWebhookAdapter,
    logFetcher: githubLogFetcherAdapter,
    output: githubOutputAdapter,
  },
  gitlab_ci: {
    webhook: gitlabWebhookAdapter,
    logFetcher: createGitLabLogFetcherAdapter(),
    output: createGitLabOutputAdapter(),
  },
  circleci: {
    webhook: circleciWebhookAdapter,
    logFetcher: createCircleCILogFetcherAdapter(),
    output: createCircleCIOutputAdapter(),
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
