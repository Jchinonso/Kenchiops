/**
 * Port interfaces barrel file.
 *
 * Exports provider-agnostic contracts for CI provider adapters.
 *
 * @module ports
 */

export type { CIWebhookPort } from "./ciWebhookPort.js";
export type { CILogFetcherPort, FetchedBuildLogs } from "./ciLogFetcherPort.js";
export type { CIOutputPort } from "./ciOutputPort.js";
