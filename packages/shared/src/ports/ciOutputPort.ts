/**
 * CI Output Port Interface
 *
 * Provider-agnostic contract for posting analysis results
 * back to CI providers. Adapters implement this to post
 * PR comments, check annotations, deployment comments, etc.
 *
 * @module ports/ciOutputPort
 */

import type { AggregatedFailures, ConsolidatedPostResult } from "../aggregation/types.js";
import type { RequestContext } from "../core/types.js";

/**
 * Port for posting analysis results back to a CI provider.
 */
export interface CIOutputPort {
  /** Post the consolidated analysis results. */
  readonly postAnalysisResults: (
    aggregation: AggregatedFailures,
    context: RequestContext
  ) => Promise<ConsolidatedPostResult>;
}
