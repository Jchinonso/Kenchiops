import type {
  FullAnalysisDependencyChange,
  FullAnalysisBuildConfigChange,
  FullAnalysisAction,
} from "./types";

/** Extract typed arrays from the fullAnalysis JSON blob. */
export const extractFullAnalysis = (
  fullAnalysis: Readonly<Record<string, unknown>>
): {
  readonly depChanges: readonly FullAnalysisDependencyChange[];
  readonly buildChanges: readonly FullAnalysisBuildConfigChange[];
  readonly richActions: readonly FullAnalysisAction[];
} => {
  const depChanges = Array.isArray(fullAnalysis.detectedDependencyChanges)
    ? (fullAnalysis.detectedDependencyChanges as readonly FullAnalysisDependencyChange[])
    : [];
  const buildChanges = Array.isArray(fullAnalysis.detectedBuildConfigChanges)
    ? (fullAnalysis.detectedBuildConfigChanges as readonly FullAnalysisBuildConfigChange[])
    : [];
  const richActions = Array.isArray(fullAnalysis.recommendedActions)
    ? (fullAnalysis.recommendedActions as readonly FullAnalysisAction[])
    : [];
  return { depChanges, buildChanges, richActions };
};
