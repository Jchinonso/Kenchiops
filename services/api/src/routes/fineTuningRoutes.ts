/**
 * Fine-Tuning Routes
 *
 * API endpoints for managing fine-tuning jobs, datasets, and model versions.
 * Provides full lifecycle management for model improvement.
 *
 * This is the public API that aggregates focused route modules:
 * - fineTuningDatasetRoutes.ts: Dataset extraction and statistics
 * - fineTuningJobRoutes.ts: Job management and scheduler
 * - fineTuningModelRoutes.ts: Model versions, evaluation, and A/B testing
 */

import { Router } from "express";
import { fineTuningDatasetRoutes } from "./fineTuningDatasetRoutes.js";
import { fineTuningJobRoutes } from "./fineTuningJobRoutes.js";
import { fineTuningModelRoutes } from "./fineTuningModelRoutes.js";

const router = Router();

// Mount sub-routers
router.use(fineTuningDatasetRoutes);
router.use(fineTuningJobRoutes);
router.use(fineTuningModelRoutes);

export { router as fineTuningRoutes };
