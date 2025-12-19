/**
 * Analysis Routes
 *
 * Handles CI failure analysis endpoints
 */

import { Router } from 'express';
import { asyncHandler, validate, validators, HTTP_STATUS } from '@kenchi/shared';
import { performAnalysis } from '../services/analysisService.js';
import type { AnalyzeRequest } from '../types/apiTypes.js';

const router = Router();

/**
 * CI Failure Analysis endpoint (for n8n workflow)
 * POST /api/analyze
 *
 * Analyzes CI failure logs using OpenAI and returns
 * structured analysis with recommendations
 */
router.post(
  '/api/analyze',
  validate({
    body: {
      failure_log: (v) => validators.required(v) && validators.string(v),
      repository: (v) => validators.required(v) && validators.string(v),
    },
  }),
  asyncHandler(async (req, res) => {
    const request: AnalyzeRequest = {
      failure_log: req.body.failure_log,
      repository: req.body.repository,
      commit: req.body.commit,
    };

    const response = await performAnalysis(request);

    res.status(HTTP_STATUS.OK).json(response);
  })
);

export { router as analysisRoutes };
