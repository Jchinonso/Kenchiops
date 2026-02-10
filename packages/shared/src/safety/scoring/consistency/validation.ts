/**
 * Module initialization validation for consistency checking.
 * Validates all config constants at module load to catch programmer bugs early.
 *
 * @module safety/scoring/consistency/validation
 */

import { SHOTGUN_LIST_THRESHOLDS, RELEVANCE_THRESHOLDS } from "../../../constants/index.js";
import { invariant } from "../../../core/errors.js";

// ==================== Threshold Validation ====================

invariant(
  SHOTGUN_LIST_THRESHOLDS.MIN_ACTIONS >= 1,
  `SHOTGUN_LIST_THRESHOLDS.MIN_ACTIONS must be >= 1, got: ${SHOTGUN_LIST_THRESHOLDS.MIN_ACTIONS}`
);

invariant(
  SHOTGUN_LIST_THRESHOLDS.MAX_RELEVANCE_RATIO >= 0 &&
    SHOTGUN_LIST_THRESHOLDS.MAX_RELEVANCE_RATIO <= 1,
  `SHOTGUN_LIST_THRESHOLDS.MAX_RELEVANCE_RATIO must be in [0,1], got: ${SHOTGUN_LIST_THRESHOLDS.MAX_RELEVANCE_RATIO}`
);

invariant(
  SHOTGUN_LIST_THRESHOLDS.MAX_EFFECTIVE_RELEVANT >= 0,
  `SHOTGUN_LIST_THRESHOLDS.MAX_EFFECTIVE_RELEVANT must be >= 0, got: ${SHOTGUN_LIST_THRESHOLDS.MAX_EFFECTIVE_RELEVANT}`
);

invariant(
  RELEVANCE_THRESHOLDS.MIN_FOR_POSITIVE > 0 && RELEVANCE_THRESHOLDS.MIN_FOR_POSITIVE <= 1,
  `RELEVANCE_THRESHOLDS.MIN_FOR_POSITIVE must be in (0,1], got: ${RELEVANCE_THRESHOLDS.MIN_FOR_POSITIVE}`
);
