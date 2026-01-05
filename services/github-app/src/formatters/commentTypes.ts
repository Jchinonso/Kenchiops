/**
 * GitHub Comment Type Definitions
 *
 * Types, interfaces, and static content for GitHub PR comment formatting.
 */

import {
  UI_EMOJI,
  GITHUB_COMMENT_TEMPLATES,
  type CIAnnotation,
  type CITestFailure,
  type LLMDetectedDependencyChange,
  type LLMDetectedBuildConfigChange,
  type LLMAnalysisResult,
  type RecommendedAction,
} from "@kenchi/shared";
import type { FeedbackLinks } from "./formatterUtils.js";

// ==================== Type Aliases ====================

/** Alias for LLM-detected dependency changes */
export type DetectedDependencyChange = LLMDetectedDependencyChange;

/** Alias for LLM-detected build config changes */
export type DetectedBuildConfigChange = LLMDetectedBuildConfigChange;

// Re-export RecommendedAction for consumers
export type { RecommendedAction };

// ==================== Interfaces ====================

/**
 * Analysis data structure for GitHub comments.
 * Contains all information needed to generate a rich failure analysis comment.
 */
export interface AnalysisData {
  readonly summary?: string;
  readonly analysis?: string;
  readonly identified_cause?: string;
  readonly confidence: number;
  readonly recommended_actions?: readonly RecommendedAction[];
  readonly repository: string;
  readonly checkName?: string;
  readonly headSha?: string;
  readonly annotations?: readonly CIAnnotation[];
  readonly testFailures?: readonly CITestFailure[];
  readonly prContext?: {
    readonly number: number;
    readonly title: string;
    readonly author: string;
    readonly branch: string;
  };
  readonly workflowContext?: {
    readonly name: string;
    readonly duration?: string;
  };
  /** Legacy field (deprecated - use detectedDependencyChanges instead) */
  readonly dependencyChanges?: ReadonlyArray<{
    readonly type: "added" | "removed" | "updated";
    readonly name: string;
    readonly oldVersion?: string;
    readonly newVersion?: string;
  }>;
  /** AI-extracted structured data (Phase 3 - Language Agnostic) */
  readonly detectedDependencyChanges?: readonly DetectedDependencyChange[];
  readonly detectedBuildConfigChanges?: readonly DetectedBuildConfigChange[];
  readonly full_analysis?: LLMAnalysisResult;
  readonly feedbackLinks?: FeedbackLinks;
}

// ==================== Static Content ====================

/** Header for failure analysis comments */
export const FAILURE_HEADER = GITHUB_COMMENT_TEMPLATES.FAILURE_HEADER(UI_EMOJI.failure);

/** Header for success/all-clear comments */
export const SUCCESS_HEADER = GITHUB_COMMENT_TEMPLATES.SUCCESS_HEADER(UI_EMOJI.success);

/** Footer branding for all comments */
export const COMMENT_FOOTER = GITHUB_COMMENT_TEMPLATES.FOOTER(UI_EMOJI.robot);
