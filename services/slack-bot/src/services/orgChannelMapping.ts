/**
 * Organization to Channel Mapping Service
 *
 * Maps GitHub organizations to Slack channels for multi-tenant support.
 * Configuration via ORG_CHANNEL_MAPPING environment variable.
 *
 * Format: "org1:C123456,org2:C789012"
 *
 * If not configured, falls back to single-tenant mode (bot's active channel).
 * If configured but org not found, throws error (no silent fallback).
 */

import { createLogger } from "@kenchi/shared";

const logger = createLogger("slack-bot");

/**
 * Parsed org-to-channel mapping
 */
type OrgChannelMap = ReadonlyMap<string, string>;

/**
 * Parse the ORG_CHANNEL_MAPPING environment variable.
 * Format: "org1:C123456,org2:C789012"
 *
 * @returns Map of org name (lowercase) to channel ID, or null if not configured
 */
const parseOrgChannelMapping = (): OrgChannelMap | null => {
  const mappingStr = process.env.ORG_CHANNEL_MAPPING;

  if (!mappingStr || mappingStr.trim() === "") {
    logger.info("ORG_CHANNEL_MAPPING not configured, using single-tenant mode");
    return null;
  }

  const mapping = new Map<string, string>();

  const pairs = mappingStr.split(",").map((p) => p.trim());

  for (const pair of pairs) {
    if (!pair) continue;

    const [org, channelId] = pair.split(":").map((s) => s.trim());

    if (!org || !channelId) {
      logger.warn("Invalid org:channel pair in ORG_CHANNEL_MAPPING", { pair });
      continue;
    }

    // Validate channel ID format (Slack channel IDs start with C, G, or D)
    if (!/^[CGD][A-Z0-9]+$/.test(channelId)) {
      logger.warn("Invalid Slack channel ID format", { org, channelId });
      continue;
    }

    // Store org in lowercase for case-insensitive matching
    mapping.set(org.toLowerCase(), channelId);
  }

  if (mapping.size === 0) {
    logger.warn("ORG_CHANNEL_MAPPING configured but no valid mappings found");
    return null;
  }

  logger.info("Org-channel mapping loaded", {
    organizations: Array.from(mapping.keys()),
    count: mapping.size,
  });

  return mapping;
};

/**
 * Cached mapping (parsed once at startup)
 */
let cachedMapping: OrgChannelMap | null | undefined;

/**
 * Get the org-channel mapping (lazy initialization).
 */
const getMapping = (): OrgChannelMap | null => {
  if (cachedMapping === undefined) {
    cachedMapping = parseOrgChannelMapping();
  }
  return cachedMapping;
};

/**
 * Check if multi-tenant mode is enabled (mapping is configured).
 */
export const isMultiTenantMode = (): boolean => {
  return getMapping() !== null;
};

/**
 * Extract organization name from repository full name.
 *
 * @param repository - Full repository name (e.g., "my-org/my-repo")
 * @returns Organization name, or null if invalid format
 */
export const extractOrganization = (repository: string): string | null => {
  const parts = repository.split("/");
  if (parts.length < 2) {
    return null;
  }
  return parts[0].toLowerCase();
};

/**
 * Look up the Slack channel for a GitHub organization.
 *
 * @param organization - GitHub organization name
 * @returns Channel ID, or null if not found or not in multi-tenant mode
 * @throws Error if multi-tenant mode is enabled but org not in mapping
 */
export const getChannelForOrganization = (organization: string): string | null => {
  const mapping = getMapping();

  // Single-tenant mode - no mapping configured
  if (mapping === null) {
    return null;
  }

  // Multi-tenant mode - must find the org in mapping
  const normalizedOrg = organization.toLowerCase();
  const channelId = mapping.get(normalizedOrg);

  if (!channelId) {
    // In multi-tenant mode, unknown org is an error (no silent fallback)
    throw new Error(
      `Organization "${organization}" not found in ORG_CHANNEL_MAPPING. ` +
        `Configure the mapping or use single-tenant mode.`
    );
  }

  logger.info("Resolved channel for organization", {
    organization: normalizedOrg,
    channelId,
  });

  return channelId;
};

/**
 * Look up the Slack channel for a repository.
 * Extracts the org from the repository name and looks up the channel.
 *
 * @param repository - Full repository name (e.g., "my-org/my-repo")
 * @returns Channel ID, or null if not in multi-tenant mode
 * @throws Error if multi-tenant mode enabled but org not in mapping
 */
export const getChannelForRepository = (repository: string): string | null => {
  const org = extractOrganization(repository);

  if (!org) {
    throw new Error(`Invalid repository format: "${repository}". Expected "org/repo".`);
  }

  return getChannelForOrganization(org);
};

/**
 * Get all configured organization mappings (for debugging/admin).
 */
export const getAllMappings = (): ReadonlyMap<string, string> => {
  return getMapping() || new Map();
};

/**
 * Reset cached mapping (for testing).
 */
export const resetMappingCache = (): void => {
  cachedMapping = undefined;
};
