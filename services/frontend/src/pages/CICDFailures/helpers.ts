/**
 * Pure helpers for the CI/CD Failures page.
 */

const SEVERITY_RANK: Readonly<Record<string, number>> = {
  high: 0,
  medium: 1,
  low: 2,
};

export const getSeverityRank = (severity: string | null): number =>
  severity !== null ? (SEVERITY_RANK[severity] ?? 3) : 3;
