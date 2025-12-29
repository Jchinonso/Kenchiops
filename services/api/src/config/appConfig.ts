/**
 * API Service Configuration
 *
 * Centralized configuration management with validation
 */

import { config, SERVICE_PORTS, SERVICE_NAMES } from "@kenchi/shared";

/**
 * API service configuration interface
 */
export interface ApiConfig {
  readonly port: number;
  readonly environment: string;
  readonly serviceName: string;
}

/**
 * Validated API configuration
 */
export const appConfig: ApiConfig = {
  port: config.PORT ? parseInt(String(config.PORT), 10) : SERVICE_PORTS.API,
  environment: config.NODE_ENV || "development",
  serviceName: SERVICE_NAMES.API,
} as const;
