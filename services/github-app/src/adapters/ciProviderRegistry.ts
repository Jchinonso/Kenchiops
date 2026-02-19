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
import { vercelWebhookAdapter } from "./vercelWebhookAdapter.js";
import { vercelLogFetcherAdapter } from "./vercelLogFetcherAdapter.js";
import { vercelOutputAdapter } from "./vercelOutputAdapter.js";
import { netlifyWebhookAdapter } from "./netlifyWebhookAdapter.js";
import { netlifyLogFetcherAdapter } from "./netlifyLogFetcherAdapter.js";
import { netlifyOutputAdapter } from "./netlifyOutputAdapter.js";

// ==================== Registry ====================

const ADAPTERS: Readonly<Partial<Record<CIProvider, CIProviderAdapters>>> = {
  github_actions: {
    webhook: githubWebhookAdapter,
    logFetcher: githubLogFetcherAdapter,
    output: githubOutputAdapter,
  },
  vercel: {
    webhook: vercelWebhookAdapter,
    logFetcher: vercelLogFetcherAdapter,
    output: vercelOutputAdapter,
  },
  netlify: {
    webhook: netlifyWebhookAdapter,
    logFetcher: netlifyLogFetcherAdapter,
    output: netlifyOutputAdapter,
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
