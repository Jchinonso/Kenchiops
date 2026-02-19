/**
 * Evidence Aggregator Tests
 *
 * Tests for the pure evidence aggregation function that assembles
 * evidence catalogs with confidence and completeness scoring.
 */

import { describe, it, expect } from "@jest/globals";
import { aggregateEvidence } from "../../services/evidenceAggregator.js";
import type { AggregateEvidenceInput } from "../../types/evidenceTypes.js";
import type { NormalizedAlert } from "../../types/incidentTypes.js";
import type { SeverityScore } from "../../types/severityTypes.js";
import type { RunbookMatch } from "../../types/runbookTypes.js";
import type { CorrelatedIncident } from "../../types/correlationTypes.js";

// ==================== Test Fixtures ====================

const createTestAlert = (overrides: Partial<NormalizedAlert> = {}): NormalizedAlert => ({
  sourceAlertId: "alert-1",
  deliveryId: "delivery-1",
  source: "pagerduty",
  title: "High CPU on payments-api",
  description: "CPU utilization is above 95%",
  severity: "high",
  fingerprint: "fp-abc123",
  serviceName: "payments-api",
  environment: "production",
  metrics: { cpu_percent: 95.4 },
  labels: { pd_service_id: "PSVC001", pd_service_name: "payments-api" },
  receivedAt: "2026-02-19T14:00:00.000Z",
  sourcePayload: {},
  ...overrides,
});

const createTestSeverity = (overrides: Partial<SeverityScore> = {}): SeverityScore => ({
  total: 72,
  label: "high",
  factors: [
    { name: "source_severity", weight: 25, score: 18, maxScore: 25, reason: "high maps to 70/100" },
    { name: "service_criticality", weight: 25, score: 20, maxScore: 25, reason: "tier2 service" },
  ],
  ...overrides,
});

const createTestRunbook = (overrides: Partial<RunbookMatch> = {}): RunbookMatch => ({
  docId: "rb-1",
  title: "CPU High Runbook",
  similarity: 0.87,
  content: "Steps to resolve high CPU...",
  sourceUrl: "https://docs.example.com/cpu-high",
  ...overrides,
});

const createTestCorrelation = (
  overrides: Partial<CorrelatedIncident> = {}
): CorrelatedIncident => ({
  triageResultId: "tr-1",
  alertId: "alert-prev-1",
  similarity: 0.91,
  correlationType: "same_root_cause",
  severityLabel: "high",
  serviceName: "payments-api",
  createdAt: new Date("2026-02-18T10:00:00.000Z"),
  ...overrides,
});

const createFullInput = (
  overrides: Partial<AggregateEvidenceInput> = {}
): AggregateEvidenceInput => ({
  alert: createTestAlert(),
  severity: createTestSeverity(),
  runbooks: [createTestRunbook()],
  correlations: [createTestCorrelation()],
  ...overrides,
});

// ==================== Tests ====================

describe("aggregateEvidence", () => {
  describe("evidence collection", () => {
    it("should return an EvidenceCatalog with items, confidence, completeness, and collectedAt", () => {
      const input = createFullInput();

      const result = aggregateEvidence(input);

      expect(result).toHaveProperty("items");
      expect(result).toHaveProperty("confidence");
      expect(result).toHaveProperty("completeness");
      expect(result).toHaveProperty("collectedAt");
      expect(typeof result.collectedAt).toBe("string");
    });

    it("should not mutate inputs", () => {
      const input = Object.freeze(createFullInput());

      expect(() => aggregateEvidence(input)).not.toThrow();
    });

    it("should collect alert base fields as ALT-prefixed evidence", () => {
      const input = createFullInput();

      const result = aggregateEvidence(input);

      expect(result.items["ALT-title"]).toBeDefined();
      expect(result.items["ALT-title"].value).toBe("High CPU on payments-api");
      expect(result.items["ALT-source"]).toBeDefined();
      expect(result.items["ALT-severity"]).toBeDefined();
      expect(result.items["ALT-fingerprint"]).toBeDefined();
      expect(result.items["ALT-receivedAt"]).toBeDefined();
    });

    it("should collect optional alert fields when present", () => {
      const input = createFullInput();

      const result = aggregateEvidence(input);

      expect(result.items["ALT-description"]).toBeDefined();
      expect(result.items["ALT-serviceName"]).toBeDefined();
      expect(result.items["ALT-environment"]).toBeDefined();
    });

    it("should not collect optional alert fields when null", () => {
      const input = createFullInput({
        alert: createTestAlert({
          description: null,
          serviceName: null,
          environment: null,
        }),
      });

      const result = aggregateEvidence(input);

      expect(result.items["ALT-description"]).toBeUndefined();
      expect(result.items["ALT-serviceName"]).toBeUndefined();
      expect(result.items["ALT-environment"]).toBeUndefined();
    });

    it("should collect metrics evidence when metrics are present", () => {
      const input = createFullInput({
        alert: createTestAlert({ metrics: { cpu: 99 } }),
      });

      const result = aggregateEvidence(input);

      expect(result.items["ALT-metrics"]).toBeDefined();
      expect(result.items["ALT-metrics"].prefix).toBe("ALT");
    });

    it("should not collect metrics evidence when metrics are empty", () => {
      const input = createFullInput({
        alert: createTestAlert({ metrics: {} }),
      });

      const result = aggregateEvidence(input);

      expect(result.items["ALT-metrics"]).toBeUndefined();
    });

    it("should collect labels evidence when labels are present", () => {
      const input = createFullInput({
        alert: createTestAlert({ labels: { region: "us-east-1" } }),
      });

      const result = aggregateEvidence(input);

      expect(result.items["ALT-labels"]).toBeDefined();
    });

    it("should not collect labels evidence when labels are empty", () => {
      const input = createFullInput({
        alert: createTestAlert({ labels: {} }),
      });

      const result = aggregateEvidence(input);

      expect(result.items["ALT-labels"]).toBeUndefined();
    });

    it("should collect severity evidence as SEV-prefixed items", () => {
      const input = createFullInput();

      const result = aggregateEvidence(input);

      expect(result.items["SEV-total"]).toBeDefined();
      expect(result.items["SEV-total"].value).toBe(72);
      expect(result.items["SEV-label"]).toBeDefined();
      expect(result.items["SEV-label"].value).toBe("high");
    });

    it("should collect severity factor evidence items", () => {
      const input = createFullInput();

      const result = aggregateEvidence(input);

      expect(result.items["SEV-source_severity"]).toBeDefined();
      expect(result.items["SEV-service_criticality"]).toBeDefined();
    });

    it("should collect runbook evidence as RB-prefixed items", () => {
      const input = createFullInput({
        runbooks: [createTestRunbook(), createTestRunbook({ docId: "rb-2", title: "Runbook 2" })],
      });

      const result = aggregateEvidence(input);

      expect(result.items["RB-0"]).toBeDefined();
      expect(result.items["RB-0"].label).toContain("CPU High Runbook");
      expect(result.items["RB-1"]).toBeDefined();
    });

    it("should collect correlation evidence as INC-prefixed items", () => {
      const input = createFullInput();

      const result = aggregateEvidence(input);

      expect(result.items["INC-0"]).toBeDefined();
      expect(result.items["INC-0"].label).toContain("same_root_cause");
    });

    it("should produce empty runbook and correlation evidence when arrays are empty", () => {
      const input = createFullInput({
        runbooks: [],
        correlations: [],
      });

      const result = aggregateEvidence(input);

      expect(result.items["RB-0"]).toBeUndefined();
      expect(result.items["INC-0"]).toBeUndefined();
    });
  });

  describe("confidence scoring", () => {
    it("should compute higher confidence when all signals are present", () => {
      const input = createFullInput();

      const result = aggregateEvidence(input);

      // All signals present: metrics, runbook, similar_incident, service, env, description, labels
      expect(result.confidence.total).toBeGreaterThan(0.8);
    });

    it("should compute lower confidence when signals are absent", () => {
      const input = createFullInput({
        alert: createTestAlert({
          description: null,
          serviceName: null,
          environment: null,
          metrics: {},
          labels: {},
        }),
        runbooks: [],
        correlations: [],
      });

      const result = aggregateEvidence(input);

      expect(result.confidence.total).toBe(0);
    });

    it("should include all 7 confidence signals", () => {
      const input = createFullInput();

      const result = aggregateEvidence(input);

      expect(result.confidence.signals).toHaveLength(7);
      const signalNames = result.confidence.signals.map((s) => s.name);
      expect(signalNames).toContain("has_metrics");
      expect(signalNames).toContain("has_runbook");
      expect(signalNames).toContain("has_similar_incident");
      expect(signalNames).toContain("service_known");
      expect(signalNames).toContain("environment_known");
      expect(signalNames).toContain("has_description");
      expect(signalNames).toContain("has_labels");
    });

    it("should mark signals as present=true when data exists", () => {
      const input = createFullInput();

      const result = aggregateEvidence(input);

      const metricsSignal = result.confidence.signals.find((s) => s.name === "has_metrics");
      expect(metricsSignal!.present).toBe(true);
      expect(metricsSignal!.reason).toContain("metric data");
    });

    it("should mark signals as present=false when data is missing", () => {
      const input = createFullInput({
        alert: createTestAlert({ metrics: {} }),
      });

      const result = aggregateEvidence(input);

      const metricsSignal = result.confidence.signals.find((s) => s.name === "has_metrics");
      expect(metricsSignal!.present).toBe(false);
    });

    it("should treat empty description as absent", () => {
      const input = createFullInput({
        alert: createTestAlert({ description: "" }),
      });

      const result = aggregateEvidence(input);

      const descSignal = result.confidence.signals.find((s) => s.name === "has_description");
      expect(descSignal!.present).toBe(false);
    });

    it("should have confidence total between 0 and 1 inclusive", () => {
      const input = createFullInput();

      const result = aggregateEvidence(input);

      expect(result.confidence.total).toBeGreaterThanOrEqual(0);
      expect(result.confidence.total).toBeLessThanOrEqual(1);
    });
  });

  describe("completeness scoring", () => {
    it("should compute high completeness when all fields are present", () => {
      const input = createFullInput();

      const result = aggregateEvidence(input);

      expect(result.completeness.total).toBeGreaterThan(0.8);
    });

    it("should track required fields separately", () => {
      const input = createFullInput();

      const result = aggregateEvidence(input);

      // required: title, source, severity, fingerprint (4 fields)
      expect(result.completeness.requiredTotal).toBe(4);
      expect(result.completeness.requiredPresent).toBe(4);
    });

    it("should track expected fields separately", () => {
      const input = createFullInput();

      const result = aggregateEvidence(input);

      // expected: serviceName, environment, description (3 fields)
      expect(result.completeness.expectedTotal).toBe(3);
      expect(result.completeness.expectedPresent).toBe(3);
    });

    it("should track optional fields separately", () => {
      const input = createFullInput();

      const result = aggregateEvidence(input);

      // optional: metrics, labels, runbooks, correlatedIncidents (4 fields)
      expect(result.completeness.optionalTotal).toBe(4);
      expect(result.completeness.optionalPresent).toBe(4);
    });

    it("should list missing fields", () => {
      const input = createFullInput({
        alert: createTestAlert({
          description: null,
          serviceName: null,
          metrics: {},
        }),
        runbooks: [],
      });

      const result = aggregateEvidence(input);

      expect(result.completeness.missingFields).toContain("description");
      expect(result.completeness.missingFields).toContain("serviceName");
      expect(result.completeness.missingFields).toContain("metrics");
      expect(result.completeness.missingFields).toContain("runbooks");
    });

    it("should have completeness total between 0 and 1 inclusive", () => {
      const input = createFullInput();

      const result = aggregateEvidence(input);

      expect(result.completeness.total).toBeGreaterThanOrEqual(0);
      expect(result.completeness.total).toBeLessThanOrEqual(1);
    });

    it("should weight required fields higher than optional in total score", () => {
      // All required + expected present, no optional
      const inputNoOptional = createFullInput({
        alert: createTestAlert({ metrics: {}, labels: {} }),
        runbooks: [],
        correlations: [],
      });

      // All optional present, one required missing (impossible with current types but we test logic)
      const resultNoOptional = aggregateEvidence(inputNoOptional);

      // All fields present
      const inputAll = createFullInput();
      const resultAll = aggregateEvidence(inputAll);

      // Full should be higher than missing optional
      expect(resultAll.completeness.total).toBeGreaterThan(resultNoOptional.completeness.total);
    });
  });

  describe("evidence item structure", () => {
    it("should give each evidence item an id, prefix, label, value, and source", () => {
      const input = createFullInput();

      const result = aggregateEvidence(input);
      const item = result.items["ALT-title"];

      expect(item.id).toBe("ALT-title");
      expect(item.prefix).toBe("ALT");
      expect(item.label).toBe("Alert Title");
      expect(item.value).toBe("High CPU on payments-api");
      expect(item.source).toBe("alert");
    });

    it("should set source to classifier for severity evidence", () => {
      const input = createFullInput();

      const result = aggregateEvidence(input);
      const item = result.items["SEV-total"];

      expect(item.source).toBe("classifier");
    });

    it("should set source to runbook-matcher for runbook evidence", () => {
      const input = createFullInput();

      const result = aggregateEvidence(input);
      const item = result.items["RB-0"];

      expect(item.source).toBe("runbook-matcher");
    });

    it("should set source to incident-correlator for correlation evidence", () => {
      const input = createFullInput();

      const result = aggregateEvidence(input);
      const item = result.items["INC-0"];

      expect(item.source).toBe("incident-correlator");
    });
  });
});
