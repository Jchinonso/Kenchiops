/**
 * OAuth Adapter Registry
 *
 * Maps OAuth provider names to their adapter implementations.
 * Provides lookup functions for retrieving the correct adapter
 * during the OAuth flow.
 *
 * @module adapters/oauthAdapterRegistry
 */

import { ValidationError, type OAuthProvider } from "@kenchi/shared";

import type { OAuthPort } from "../ports/oauthPort.js";
import { githubOAuthAdapter } from "./githubOAuthAdapter.js";

// ==================== Registry ====================

const ADAPTERS: Partial<Record<OAuthProvider, OAuthPort>> = {
  github: githubOAuthAdapter,
};

/**
 * Retrieve the OAuth adapter for a given provider.
 * Throws ValidationError if the provider is not yet supported.
 */
export const getOAuthAdapter = (provider: OAuthProvider): OAuthPort => {
  const adapter = ADAPTERS[provider];

  if (!adapter) {
    throw new ValidationError(`OAuth provider "${provider}" is not yet supported`, {
      operation: "getOAuthAdapter",
      metadata: { provider },
    });
  }

  return adapter;
};

/**
 * Check whether an OAuth adapter exists for the given provider.
 */
export const hasOAuthAdapter = (provider: OAuthProvider): boolean => provider in ADAPTERS;
