/**
 * RAG Routes - Combined router for all RAG endpoints
 *
 * @module routes/rag
 */

import { Router } from "express";
import { ragCoreRoutes } from "./coreRoutes.js";
import { ragPurgeRoutes } from "./purgeRoutes.js";
import { ragHealthRoutes } from "./healthRoutes.js";
import { ragCostRoutes } from "./costRoutes.js";
import { ragDriftRoutes } from "./driftRoutes.js";

const router = Router();

// Mount all RAG route modules
router.use(ragCoreRoutes);
router.use(ragPurgeRoutes);
router.use(ragHealthRoutes);
router.use(ragCostRoutes);
router.use(ragDriftRoutes);

export { router as ragRoutes };
