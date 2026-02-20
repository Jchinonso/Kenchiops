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
import type { AlertSourcePort } from "../ports/alertSourcePort.js";
import type { AlertSource } from "./incidentTypes.js";

/**
 * Composition root interface for the incident triage service.
 *
 * Only exposes services the worker and routes directly call. Intermediate
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
  readonly alertAdapters: Readonly<Partial<Record<AlertSource, AlertSourcePort>>>;
}
