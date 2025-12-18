/**
 * OpenAI Token Budget Management Module
 * 
 * Handles token budget estimation and evidence truncation to ensure
 * prompts fit within model token limits.
 */

import type { Event, Evidence } from '../types.js';
import {
  buildAnalysisPrompt,
  estimateTokens,
  truncateEvidence,
} from '../prompts.js';

/**
 * Manages token budget by truncating evidence if necessary.
 * Optimized: Only builds prompt if truncation is needed.
 */
export const manageTokenBudget = (
  event: Event,
  evidence: Evidence,
  maxTokens: number
): Evidence => {
  // Quick estimate: if evidence is small, likely no truncation needed
  // This avoids building the full prompt unnecessarily
  const evidenceSize = estimateEvidenceSize(evidence);
  const estimatedTokens = evidenceSize + 1000; // Add buffer for event/instructions

  if (estimatedTokens <= maxTokens) {
    // Verify with actual prompt (only if estimate suggests it might fit)
    const prompt = buildAnalysisPrompt(event, evidence);
    const currentTokens = estimateTokens(prompt);

    if (currentTokens <= maxTokens) {
      return evidence; // No truncation needed
    }
  }

  // Truncate evidence to fit budget
  const evidenceTokenBudget = maxTokens - 1000; // Reserve 1000 for event and instructions
  return truncateEvidence(evidence, evidenceTokenBudget);
};

/**
 * Quick estimate of evidence size in tokens (rough approximation).
 * Used to avoid building full prompt when truncation is clearly needed.
 */
const estimateEvidenceSize = (evidence: Evidence): number => {
  let size = 0;
  
  // Rough token estimate: ~4 chars per token
  if (evidence.logs) {
    size += evidence.logs.reduce((sum, log) => sum + log.message.length, 0) / 4;
  }
  if (evidence.gitHistory) {
    size += evidence.gitHistory.reduce((sum, commit) => 
      sum + (commit.message?.length || 0) + commit.sha.length, 0) / 4;
  }
  if (evidence.relatedDocs) {
    size += evidence.relatedDocs.reduce((sum, doc) => 
      sum + (doc.title?.length || 0) + (doc.excerpt?.length || 0), 0) / 4;
  }
  if (evidence.metrics) {
    size += JSON.stringify(evidence.metrics).length / 4;
  }
  
  return Math.ceil(size);
};

