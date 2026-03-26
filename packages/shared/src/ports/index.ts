/**
 * Port interfaces barrel file.
 *
 * Exports provider-agnostic contracts for CI and deployment provider adapters.
 *
 * @module ports
 */

export type { CIWebhookPort } from "./ciWebhookPort.js";
export type { CILogFetcherPort, FetchedBuildLogs } from "./ciLogFetcherPort.js";
export type { CIOutputPort } from "./ciOutputPort.js";
export type {
  DeployLogSourcePort,
  DeployPlatform,
  DeployStatus,
  DeployMetadata,
  DeployWebhookResult,
  FetchDeployLogsParams,
  DeployLogData,
  LogLine,
  LogDrainBatchResult,
  DeployLogInput,
} from "./deployLogSourcePort.js";
