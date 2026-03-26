/**
 * Deploy Analysis Composition Root
 *
 * Wires deploy log adapters, ingestion buffer, analysis service,
 * and flush trigger worker. Returns a container with the fully
 * assembled deploy analysis subsystem.
 *
 * @module container/deployContainer
 */

import {
  createIngestionBuffer,
  type DeployLogSourcePort,
  type DeployPlatform,
  type IngestionBufferPort,
} from "@kenchi/shared";
import { vercelLogAdapter } from "../adapters/vercelLogAdapter.js";
import { railwayLogAdapter } from "../adapters/railwayLogAdapter.js";
import { renderLogAdapter } from "../adapters/renderLogAdapter.js";
import { netlifyLogAdapter } from "../adapters/netlifyLogAdapter.js";
import {
  createDeployAnalysisService,
  type DeployAnalysisService,
} from "../services/deployAnalysisService.js";
import { performAnalysis } from "../services/analysisService.js";
import {
  startFlushTriggerWorker,
  type FlushTriggerWorkerControl,
} from "../workers/flushTriggerWorker.js";

// ==================== Adapter Registry ====================

const DEPLOY_ADAPTERS: Readonly<Record<DeployPlatform, DeployLogSourcePort>> = {
  vercel: vercelLogAdapter,
  railway: railwayLogAdapter,
  render: renderLogAdapter,
  netlify: netlifyLogAdapter,
};

// ==================== Container Type ====================

/** Deploy analysis subsystem container. */
export interface DeployContainer {
  readonly deployAnalysisService: DeployAnalysisService;
  readonly buffer: IngestionBufferPort;
  readonly adapters: Readonly<Record<DeployPlatform, DeployLogSourcePort>>;
  readonly flushWorker: FlushTriggerWorkerControl;
}

// ==================== Factory ====================

/**
 * Creates the deploy analysis container with all dependencies wired.
 * Call once at service startup. Returns the container + flush worker handle.
 */
export const createDeployContainer = (): DeployContainer => {
  const buffer = createIngestionBuffer();

  const deployAnalysisService = createDeployAnalysisService(
    { performAnalysis },
    buffer,
    DEPLOY_ADAPTERS
  );

  const flushWorker = startFlushTriggerWorker(buffer, deployAnalysisService);

  return {
    deployAnalysisService,
    buffer,
    adapters: DEPLOY_ADAPTERS,
    flushWorker,
  };
};
