/**
 * CI Failure Helpers Types
 *
 * Type definitions for CI failure analysis helper functions.
 */

import type { CIFailureAnalysis } from "../types/slackTypes.js";

/** Dependency change from analysis (AI-extracted or legacy) */
export type CIDependencyChange =
  | NonNullable<CIFailureAnalysis["detectedDependencyChanges"]>[number]
  | NonNullable<CIFailureAnalysis["dependencyChanges"]>[number];

/** Build config change from analysis (AI-extracted) */
export type CIBuildConfigChange = NonNullable<
  CIFailureAnalysis["detectedBuildConfigChanges"]
>[number];

/** Recommended action from CI failure analysis */
export type CIRecommendedAction = NonNullable<CIFailureAnalysis["recommended_actions"]>[number];
