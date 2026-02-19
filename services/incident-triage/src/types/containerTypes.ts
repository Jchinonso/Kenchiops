/**
 * Container Types
 *
 * Defines the TriageContainer interface for the composition root.
 * The container holds all wired-up services that the triage worker needs.
 *
 * @module types/containerTypes
 */

import type { QueueManager } from "@kenchi/shared";
import type { DeduplicationService } from "./severityTypes.js";
import type { RunbookMatcherService } from "./runbookTypes.js";
import type { IncidentCorrelatorService } from "./correlationTypes.js";
import type { AiSummarizerService } from "./summaryTypes.js";
import type { DispatchService } from "./policyTypes.js";

/**
 * Composition root interface for the incident triage service.
 *
 * Only exposes services the worker directly calls. Intermediate
 * ports (embeddingPort, knowledgeSearchPort, triageSearchPort,
 * llmCompletionPort) are internal wiring details of the container.
 */
export interface TriageContainer {
  readonly queue: QueueManager;
  readonly dedupService: DeduplicationService;
  readonly runbookMatcher: RunbookMatcherService;
  readonly incidentCorrelator: IncidentCorrelatorService;
  readonly aiSummarizer: AiSummarizerService;
  readonly dispatchService: DispatchService;
}
