/**
 * GitHub App Service Configuration
 *
 * Centralized configuration management with validation
 */

import { config, SERVICE_PORTS, SERVICE_NAMES, ValidationError } from "@kenchi/shared";

/**
 * GitHub App configuration interface
 */
export interface GitHubAppConfig {
  readonly port: number;
  readonly environment: string;
  readonly serviceName: string;
  readonly github: {
    readonly appId: string;
    readonly privateKey: string;
    readonly webhookSecret: string;
    readonly installationId?: number;
  };
}

/**
 * Parse private key, converting escaped newlines to actual newlines
 * Docker env_file doesn't support multi-line values, so we use \n escapes
 */
const parsePrivateKey = (key: string | undefined): string => {
  if (!key) return "";
  // Remove surrounding quotes if present and convert \n to actual newlines
  return key.replace(/^["']|["']$/g, "").replace(/\\n/g, "\n");
};

/**
 * Required GitHub configuration fields
 */
const REQUIRED_GITHUB_CONFIG = [
  { key: "GITHUB_APP_ID", value: () => config.GITHUB_APP_ID, message: "GITHUB_APP_ID is required" },
  {
    key: "GITHUB_APP_PRIVATE_KEY",
    value: () => config.GITHUB_APP_PRIVATE_KEY,
    message: "GITHUB_APP_PRIVATE_KEY is required",
  },
] as const;

/**
 * Validate required GitHub configuration
 */
const validateGitHubConfig = (): void => {
  const missingConfig = REQUIRED_GITHUB_CONFIG.find((c) => !c.value());
  if (missingConfig) {
    throw new ValidationError(missingConfig.message);
  }
};

// Validate on module load
validateGitHubConfig();

/**
 * Validated GitHub App configuration
 */
export const appConfig: GitHubAppConfig = {
  port: config.PORT ? parseInt(String(config.PORT), 10) : SERVICE_PORTS.GITHUB_APP,
  environment: config.NODE_ENV || "development",
  serviceName: SERVICE_NAMES.GITHUB_APP,
  github: {
    appId: config.GITHUB_APP_ID || "",
    privateKey: parsePrivateKey(config.GITHUB_APP_PRIVATE_KEY),
    webhookSecret: config.GITHUB_WEBHOOK_SECRET || "",
    installationId: config.GITHUB_INSTALLATION_ID
      ? parseInt(String(config.GITHUB_INSTALLATION_ID), 10)
      : undefined,
  },
} as const;
