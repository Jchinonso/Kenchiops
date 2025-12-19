/**
 * GitHub App Service Configuration
 *
 * Centralized configuration management with validation
 */

import { config, SERVICE_PORTS } from "@kenchi/shared";

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
 * Validate required GitHub configuration
 */
const validateGitHubConfig = (): void => {
  if (!config.GITHUB_APP_ID) {
    throw new Error("GITHUB_APP_ID is required");
  }
  if (!config.GITHUB_APP_PRIVATE_KEY) {
    throw new Error("GITHUB_APP_PRIVATE_KEY is required");
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
  serviceName: "github-app",
  github: {
    appId: config.GITHUB_APP_ID || "",
    privateKey: config.GITHUB_APP_PRIVATE_KEY || "",
    webhookSecret: config.GITHUB_WEBHOOK_SECRET || "",
    installationId: config.GITHUB_INSTALLATION_ID
      ? parseInt(String(config.GITHUB_INSTALLATION_ID), 10)
      : undefined,
  },
} as const;
