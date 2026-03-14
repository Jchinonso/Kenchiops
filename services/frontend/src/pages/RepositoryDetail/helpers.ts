import type { AnalysisRecord } from "@/hooks/useDashboardData";
import { PERCENTAGE_MULTIPLIER } from "./constants";

export const formatAvgConfidence = (analyses: readonly AnalysisRecord[]): string => {
  const { length: count } = analyses;
  if (count === 0) {
    return "--";
  }
  const sum = analyses.reduce((acc, analysis) => acc + analysis.diagnosisConfidence, 0);
  return `${Math.round((sum / count) * PERCENTAGE_MULTIPLIER)}%`;
};
