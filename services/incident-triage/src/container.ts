/**
 * Composition Root
 *
 * All dependency wiring for the incident triage service lives here.
 * Services receive their dependencies via factory args (closures).
 * No adapter instantiation happens outside this file.
 *
 * @module container
 */

import {
  createQueue,
  generateBudgetAwareEmbedding,
  findByFingerprint,
  upsertDedupEntry,
  searchSimilarTriageResults,
  searchSimilarKnowledgeDocs,
  QUEUE_NAMES,
  QUEUE_RETRY_CONFIG,
  QUEUE_VISIBILITY_TIMEOUT,
} from "@kenchi/shared";
import type { EmbeddingPort, KnowledgeSearchPort } from "./types/runbookTypes.js";
import type { TriageSearchPort } from "./types/correlationTypes.js";
import type { TriageContainer } from "./types/containerTypes.js";
import { createDeduplicationService } from "./services/deduplicationService.js";
import { createRunbookMatcher } from "./services/runbookMatcher.js";
import { createIncidentCorrelator } from "./services/incidentCorrelator.js";
import { createAiSummarizer } from "./services/aiSummarizer.js";
import { createDispatchService } from "./services/dispatchService.js";
import { createLLMCompletionAdapter } from "./adapters/llmCompletionAdapter.js";
import { createSlackDispatchAdapter } from "./adapters/slackDispatchAdapter.js";
import { createPagerDutyDispatchAdapter } from "./adapters/pagerDutyDispatchAdapter.js";
import { createPagerDutyAdapter } from "./adapters/pagerDutyAdapter.js";
import { appConfig } from "./config/appConfig.js";

/**
 * Creates the fully-wired triage container with all service dependencies.
 *
 * @returns TriageContainer with all services ready for use by the worker
 */
export const createTriageContainer = (): TriageContainer => {
  // ==================== Queue ====================

  const queue = createQueue({
    name: QUEUE_NAMES.INCIDENT_TRIAGE,
    maxRetries: QUEUE_RETRY_CONFIG.INCIDENT_TRIAGE,
    visibilityTimeout: QUEUE_VISIBILITY_TIMEOUT.INCIDENT_TRIAGE,
  });

  // ==================== Port Adapters (internal wiring) ====================

  const embeddingPort: EmbeddingPort = {
    generate: async (tenantId, text) => {
      const result = await generateBudgetAwareEmbedding({ tenantId, text });
      return { embedding: result.embedding, tokenCount: result.tokenCount };
    },
  };

  const knowledgeSearchPort: KnowledgeSearchPort = {
    searchRunbooks: async (embedding, tenantId, limit, minSimilarity) => {
      const results = await searchSimilarKnowledgeDocs(embedding as number[], {
        docType: "runbook",
        tenantId,
        limit,
        minSimilarity,
      });
      return results.map(({ item, similarity }) => ({
        id: item.id,
        title: item.title,
        content: item.content,
        sourceUrl: item.sourceUrl ?? null,
        similarity,
      }));
    },
  };

  const triageSearchPort: TriageSearchPort = {
    searchSimilar: async (embedding, tenantId, excludeAlertId, limit, minSimilarity) => {
      const results = await searchSimilarTriageResults(
        embedding,
        tenantId,
        excludeAlertId,
        minSimilarity,
        limit
      );
      return results.map((result) => ({
        triageResultId: result.triageResultId,
        alertId: result.alertId,
        similarity: result.similarity,
        severityLabel: result.severityLabel,
        serviceName: result.serviceName,
        createdAt: result.createdAt,
      }));
    },
  };

  // ==================== Dedup Service ====================

  const dedupService = createDeduplicationService({
    findByFingerprint: async (fingerprint: string, tenantId: string) => {
      const record = await findByFingerprint(fingerprint, tenantId);
      return record ? { alertId: record.alertId, expiresAt: record.expiresAt } : null;
    },
    upsertDedupEntry,
  });

  // ==================== Phase 3 Services ====================

  const runbookMatcher = createRunbookMatcher(embeddingPort, knowledgeSearchPort);
  const incidentCorrelator = createIncidentCorrelator(triageSearchPort);

  // ==================== Phase 4 Services ====================

  const llmCompletionPort = createLLMCompletionAdapter();
  const aiSummarizer = createAiSummarizer(llmCompletionPort);

  // ==================== Phase 5 Services ====================

  const slackDispatchPort = createSlackDispatchAdapter(appConfig.slackIncidentWebhookUrl);
  const pagerDutyDispatchPort = createPagerDutyDispatchAdapter();
  const dispatchService = createDispatchService(slackDispatchPort, pagerDutyDispatchPort);

  // ==================== Webhook Adapters ====================

  const pagerDutyAdapter = createPagerDutyAdapter();

  return {
    queue,
    dedupService,
    runbookMatcher,
    incidentCorrelator,
    aiSummarizer,
    dispatchService,
    pagerDutyAdapter,
  };
};
