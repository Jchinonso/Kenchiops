/**
 * Integration Adapter Registry
 *
 * Maps integration provider names to their adapter implementations.
 * Provides lookup functions for retrieving the correct adapter
 * during the integration OAuth flow.
 *
 * @module adapters/integrationAdapterRegistry
 */

import { ValidationError, type IntegrationProvider } from "@kenchi/shared";

import type { IntegrationOAuthPort } from "../ports/integrationOAuthPort.js";
import { vercelIntegrationAdapter } from "./vercelIntegrationAdapter.js";
import { netlifyIntegrationAdapter } from "./netlifyIntegrationAdapter.js";

// ==================== Registry ====================

const INTEGRATION_ADAPTERS: Readonly<Record<IntegrationProvider, IntegrationOAuthPort>> = {
  vercel: vercelIntegrationAdapter,
  netlify: netlifyIntegrationAdapter,
};

/**
 * Retrieve the integration adapter for a given provider.
 * Throws ValidationError if the provider is not supported.
 */
export const getIntegrationAdapter = (provider: IntegrationProvider): IntegrationOAuthPort => {
  const adapter = INTEGRATION_ADAPTERS[provider];

  if (!adapter) {
    throw new ValidationError(`Integration provider "${provider}" is not supported`, {
      operation: "getIntegrationAdapter",
      metadata: { provider },
    });
  }

  return adapter;
};

/**
 * Check whether an integration adapter exists for the given provider.
 */
export const hasIntegrationAdapter = (provider: IntegrationProvider): boolean =>
  provider in INTEGRATION_ADAPTERS;
