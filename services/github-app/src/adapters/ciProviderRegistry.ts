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
  type CIWebhookPort,
  type CILogFetcherPort,
  type CIOutputPort,
} from "@kenchi/shared";
import { githubWebhookAdapter } from "./githubWebhookAdapter.js";
import { githubLogFetcherAdapter } from "./githubLogFetcherAdapter.js";
import { githubOutputAdapter } from "./githubOutputAdapter.js";

// ==================== Types ====================

/**
 * Bundled adapters for a CI provider.
 */
export interface CIProviderAdapters {
  readonly webhook: CIWebhookPort;
  readonly logFetcher: CILogFetcherPort;
  readonly output: CIOutputPort;
}

// ==================== Registry ====================

const ADAPTERS: Partial<Record<CIProvider, CIProviderAdapters>> = {
  github_actions: {
    webhook: githubWebhookAdapter,
    logFetcher: githubLogFetcherAdapter,
    output: githubOutputAdapter,
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
