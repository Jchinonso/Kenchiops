/**
 * Types for Check Run Success Handler
 *
 * @module handlers/checkRunSuccessHandlerTypes
 */

/**
 * Result of handling a successful check run.
 */
export interface CheckRunSuccessResult {
  readonly handled: boolean;
  readonly message: string;
  readonly fixCommentsIngested?: number;
  readonly previousFailure?: {
    readonly checkName: string;
    readonly failedAt: string;
    readonly errorSummary: string;
  };
}
