/**
 * CI Log Fetcher Port Interface
 *
 * Provider-agnostic contract for fetching build logs
 * from CI providers. Adapters implement this to download
 * logs via provider-specific APIs.
 *
 * @module ports/ciLogFetcherPort
 */

import type { RequestContext } from "../core/types.js";

/**
 * Result of fetching build logs from a CI provider.
 */
export interface FetchedBuildLogs {
  readonly buildId: string;
  readonly buildName: string;
  readonly logs: string;
  readonly durationMs?: number;
}

/**
 * Port for fetching build logs from a CI provider.
 */
export interface CILogFetcherPort {
  /** Fetch logs for a specific build/job. */
  readonly fetchBuildLogs: (
    buildId: string,
    owner: string,
    repo: string,
    installationId: number,
    context: RequestContext
  ) => Promise<FetchedBuildLogs>;

  /** Fetch logs for all failed builds in a commit. */
  readonly fetchAllFailedLogs: (
    commitSha: string,
    owner: string,
    repo: string,
    installationId: number,
    context: RequestContext
  ) => Promise<readonly FetchedBuildLogs[]>;
}
