/**
 * IncidentDetailPanel helpers
 *
 * Pure functions for extracting data from incident alert payloads.
 */

/**
 * Build the shareable URL for an incident detail panel.
 */
export const buildIncidentUrl = (incidentId: string): string =>
  `${window.location.origin}/dashboard/incidents/active?id=${incidentId}`;

/**
 * Extract the commit SHA from alert labels (Vercel or Netlify).
 * Returns null if no commit SHA label is found.
 */
export const extractCommitSha = (labels: Readonly<Record<string, string>>): string | null =>
  labels.vercel_commit_sha ?? labels.netlify_commit_sha ?? null;
