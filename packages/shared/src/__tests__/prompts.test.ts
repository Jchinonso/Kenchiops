import { describe, it, expect } from '@jest/globals';
import {
  buildSystemPrompt,
  buildAnalysisPrompt,
  formatEvent,
  formatEvidence,
  formatLogs,
  formatMetrics,
  formatGitHistory,
  formatKnowledgeDocs,
  estimateTokens,
  truncateEvidence,
} from '../prompts.js';
import type {
  Event,
  Evidence,
  LogEntry,
  MetricsSummary,
  GitCommit,
  KnowledgeDocument,
} from '../types.js';

describe('Prompts Module', () => {
  describe('buildSystemPrompt', () => {
    it('should return system prompt with role definition', () => {
      const prompt = buildSystemPrompt();

      expect(prompt).toContain('expert DevOps incident analysis assistant');
      expect(prompt).toContain('Your Capabilities');
      expect(prompt).toContain('Your Limitations');
      expect(prompt).toContain('Safety Guidelines');
      expect(prompt).toContain('Transparency Requirements');
    });

    it('should include anti-hallucination constraints', () => {
      const prompt = buildSystemPrompt();

      expect(prompt).toContain('ONLY use information explicitly provided');
      expect(prompt).toContain('MUST NOT make up information');
      expect(prompt).toContain('MUST NOT assume facts');
    });

    it('should include safety guidelines', () => {
      const prompt = buildSystemPrompt();

      expect(prompt).toContain('NEVER suggest destructive actions');
      expect(prompt).toContain('NEVER recommend actions that could cause outages');
      expect(prompt).toContain('Reversible');
      expect(prompt).toContain('Safe');
    });
  });

  describe('formatEvent', () => {
    it('should format event details correctly', () => {
      const event: Event = {
        id: 'evt_test123',
        type: 'CICD_FAILURE',
        source: 'github',
        timestamp: '2025-12-17T10:00:00Z',
        severity: 'high',
        title: 'Build failed on main branch',
        payload: {
          repository: 'test/repo',
          workflow: 'ci.yml',
          errorMessage: 'Tests failed',
        },
      };

      const formatted = formatEvent(event);

      expect(formatted).toContain('EVENT DETAILS');
      expect(formatted).toContain('evt_test123');
      expect(formatted).toContain('CICD_FAILURE');
      expect(formatted).toContain('github');
      expect(formatted).toContain('2025-12-17T10:00:00Z');
      expect(formatted).toContain('high');
      expect(formatted).toContain('Build failed on main branch');
      expect(formatted).toContain('test/repo');
    });

    it('should handle event without optional fields', () => {
      const event: Event = {
        id: 'evt_minimal',
        type: 'MANUAL_TRIGGER',
        source: 'api',
        timestamp: '2025-12-17T10:00:00Z',
        payload: {},
      };

      const formatted = formatEvent(event);

      expect(formatted).toContain('evt_minimal');
      expect(formatted).toContain('MANUAL_TRIGGER');
      expect(formatted).not.toContain('**Title**');
    });
  });

  describe('formatLogs', () => {
    it('should format log entries with all fields', () => {
      const logs: LogEntry[] = [
        {
          level: 'ERROR',
          message: 'Connection timeout',
          timestamp: '2025-12-17T10:00:00Z',
          source: 'api-service',
          stackTrace: 'at Connection.connect (conn.ts:45)',
        },
        {
          level: 'WARN',
          message: 'Retrying connection',
          timestamp: '2025-12-17T10:00:05Z',
          source: 'api-service',
        },
      ];

      const formatted = formatLogs(logs);

      expect(formatted).toContain('[2025-12-17T10:00:00Z] [ERROR] api-service');
      expect(formatted).toContain('Connection timeout');
      expect(formatted).toContain('at Connection.connect (conn.ts:45)');
      expect(formatted).toContain('[WARN]');
      expect(formatted).toContain('Retrying connection');
      expect(formatted).toContain('---'); // Separator
    });

    it('should handle logs with minimal fields', () => {
      const logs: LogEntry[] = [
        {
          message: 'Simple log message',
        },
      ];

      const formatted = formatLogs(logs);

      expect(formatted).toContain('Simple log message');
      expect(formatted).toContain('[unknown time]');
      expect(formatted).toContain('[INFO]');
      expect(formatted).toContain('unknown');
    });
  });

  describe('formatMetrics', () => {
    it('should format all standard metrics', () => {
      const metrics: MetricsSummary = {
        errorRate: 0.05,
        requestRate: 1000,
        cpuUsage: 75.5,
        memoryUsage: 60.2,
        latencyP50: 120,
        latencyP95: 350,
        latencyP99: 890,
      };

      const formatted = formatMetrics(metrics);

      expect(formatted).toContain('Error Rate: 0.05');
      expect(formatted).toContain('Request Rate: 1000 req/s');
      expect(formatted).toContain('CPU Usage: 75.5%');
      expect(formatted).toContain('Memory Usage: 60.2%');
      expect(formatted).toContain('Latency P50: 120ms');
      expect(formatted).toContain('Latency P95: 350ms');
      expect(formatted).toContain('Latency P99: 890ms');
    });

    it('should handle custom metrics', () => {
      const metrics: MetricsSummary = {
        errorRate: 0.02,
        customMetric: 'custom value',
        anotherMetric: 42,
      };

      const formatted = formatMetrics(metrics);

      expect(formatted).toContain('Error Rate: 0.02');
      expect(formatted).toContain('customMetric: custom value');
      expect(formatted).toContain('anotherMetric: 42');
    });
  });

  describe('formatGitHistory', () => {
    it('should format git commits with all fields', () => {
      const commits: GitCommit[] = [
        {
          sha: 'abc1234567890',
          message: 'Fix authentication bug',
          author: 'dev@example.com',
          timestamp: '2025-12-17T09:00:00Z',
          filesChanged: ['src/auth.ts', 'src/config.ts'],
          additions: 15,
          deletions: 8,
          url: 'https://github.com/test/repo/commit/abc1234',
        },
      ];

      const formatted = formatGitHistory(commits);

      expect(formatted).toContain('Commit: abc1234567890');
      expect(formatted).toContain('Author: dev@example.com');
      expect(formatted).toContain('Date: 2025-12-17T09:00:00Z');
      expect(formatted).toContain('Message: Fix authentication bug');
      expect(formatted).toContain('Files Changed: src/auth.ts, src/config.ts');
      expect(formatted).toContain('+15 -8');
      expect(formatted).toContain('URL: https://github.com/test/repo/commit/abc1234');
    });

    it('should handle commits with minimal fields', () => {
      const commits: GitCommit[] = [
        {
          sha: 'xyz789',
          message: 'Update README',
          author: 'author@example.com',
          timestamp: '2025-12-17T08:00:00Z',
        },
      ];

      const formatted = formatGitHistory(commits);

      expect(formatted).toContain('Commit: xyz789');
      expect(formatted).toContain('Message: Update README');
      expect(formatted).not.toContain('Files Changed:');
      expect(formatted).not.toContain('URL:');
    });
  });

  describe('formatKnowledgeDocs', () => {
    it('should format knowledge documents with all fields', () => {
      const docs: KnowledgeDocument[] = [
        {
          id: 'INC-123',
          type: 'past_incident',
          title: 'Previous AUTH failure',
          excerpt: 'Similar authentication failure occurred...',
          similarity: 0.92,
          url: 'https://wiki.example.com/INC-123',
          metadata: {
            tags: ['auth', 'production', 'critical'],
            createdAt: '2025-11-01T00:00:00Z',
          },
        },
      ];

      const formatted = formatKnowledgeDocs(docs);

      expect(formatted).toContain('[past_incident] Previous AUTH failure');
      expect(formatted).toContain('(Similarity: 92%)');
      expect(formatted).toContain('Similar authentication failure occurred...');
      expect(formatted).toContain('Full document: https://wiki.example.com/INC-123');
      expect(formatted).toContain('Tags: auth, production, critical');
      expect(formatted).toContain('---');
    });

    it('should handle documents with minimal fields', () => {
      const docs: KnowledgeDocument[] = [
        {
          id: 'DOC-456',
          type: 'documentation',
          title: 'Setup Guide',
          similarity: 0.75,
        },
      ];

      const formatted = formatKnowledgeDocs(docs);

      expect(formatted).toContain('[documentation] Setup Guide');
      expect(formatted).toContain('(Similarity: 75%)');
      expect(formatted).not.toContain('Full document:');
      expect(formatted).not.toContain('Tags:');
    });
  });

  describe('formatEvidence', () => {
    it('should format all evidence sections', () => {
      const evidence: Evidence = {
        eventId: 'evt_test',
        logs: [
          {
            level: 'ERROR',
            message: 'Test error',
            timestamp: '2025-12-17T10:00:00Z',
          },
        ],
        metrics: {
          summary: {
            errorRate: 0.05,
            cpuUsage: 75,
          },
        },
        gitHistory: [
          {
            sha: 'abc123',
            message: 'Test commit',
            author: 'dev@example.com',
            timestamp: '2025-12-17T09:00:00Z',
          },
        ],
        relatedDocs: [
          {
            id: 'DOC-1',
            type: 'runbook',
            title: 'Test runbook',
            similarity: 0.8,
          },
        ],
        collectedAt: '2025-12-17T10:00:00Z',
      };

      const formatted = formatEvidence(evidence);

      expect(formatted).toContain('COLLECTED EVIDENCE');
      expect(formatted).toContain('### Error Logs');
      expect(formatted).toContain('Test error');
      expect(formatted).toContain('### System Metrics');
      expect(formatted).toContain('Error Rate: 0.05');
      expect(formatted).toContain('### Recent Git History');
      expect(formatted).toContain('Test commit');
      expect(formatted).toContain('### Related Knowledge Base Documents');
      expect(formatted).toContain('Test runbook');
    });

    it('should handle missing evidence sections', () => {
      const evidence: Evidence = {
        eventId: 'evt_test',
        collectedAt: '2025-12-17T10:00:00Z',
      };

      const formatted = formatEvidence(evidence);

      expect(formatted).toContain('COLLECTED EVIDENCE');
      expect(formatted).toContain('No error logs available');
      expect(formatted).toContain('No metrics available');
      expect(formatted).toContain('No recent commits available');
      expect(formatted).toContain('No related documents found');
    });
  });

  describe('buildAnalysisPrompt', () => {
    it('should build complete analysis prompt', () => {
      const event: Event = {
        id: 'evt_test',
        type: 'CICD_FAILURE',
        source: 'github',
        timestamp: '2025-12-17T10:00:00Z',
        payload: { errorMessage: 'Test failed' },
      };

      const evidence: Evidence = {
        eventId: 'evt_test',
        logs: [
          {
            level: 'ERROR',
            message: 'Test error',
            timestamp: '2025-12-17T10:00:00Z',
          },
        ],
        collectedAt: '2025-12-17T10:00:00Z',
      };

      const prompt = buildAnalysisPrompt(event, evidence);

      // Should include all sections
      expect(prompt).toContain('expert DevOps incident analysis assistant');
      expect(prompt).toContain('## TASK');
      expect(prompt).toContain('EVENT DETAILS');
      expect(prompt).toContain('COLLECTED EVIDENCE');
      expect(prompt).toContain('SAFETY CONSTRAINTS');
      expect(prompt).toContain('OUTPUT FORMAT');
      expect(prompt).toContain('Now, analyze the event');
    });
  });

  describe('estimateTokens', () => {
    it('should estimate tokens based on character count', () => {
      const shortText = 'Hello';
      const mediumText = 'This is a test message with some content';
      const longText = 'a'.repeat(1000);

      expect(estimateTokens(shortText)).toBe(Math.ceil(shortText.length / 4));
      expect(estimateTokens(mediumText)).toBe(Math.ceil(mediumText.length / 4));
      expect(estimateTokens(longText)).toBe(Math.ceil(1000 / 4));
    });

    it('should return positive integers', () => {
      const tokens = estimateTokens('test');
      expect(tokens).toBeGreaterThan(0);
      expect(Number.isInteger(tokens)).toBe(true);
    });
  });

  describe('truncateEvidence', () => {
    it('should prioritize ERROR logs', () => {
      const evidence: Evidence = {
        eventId: 'evt_test',
        logs: [
          {
            level: 'ERROR',
            message: 'Critical error 1',
            timestamp: '2025-12-17T10:00:00Z',
          },
          {
            level: 'ERROR',
            message: 'Critical error 2',
            timestamp: '2025-12-17T10:00:01Z',
          },
          {
            level: 'INFO',
            message: 'Info message',
            timestamp: '2025-12-17T10:00:02Z',
          },
        ],
        collectedAt: '2025-12-17T10:00:00Z',
      };

      const truncated = truncateEvidence(evidence, 500);

      expect(truncated.logs).toBeDefined();
      expect(truncated.logs!.length).toBeGreaterThan(0);
      // ERROR logs should be included
      expect(truncated.logs![0].level).toBe('ERROR');
    });

    it('should include recent commits when budget allows', () => {
      const evidence: Evidence = {
        eventId: 'evt_test',
        gitHistory: Array.from({ length: 10 }, (_, i) => ({
          sha: `commit${i}`,
          message: `Commit message ${i}`,
          author: 'dev@example.com',
          timestamp: '2025-12-17T09:00:00Z',
        })),
        collectedAt: '2025-12-17T10:00:00Z',
      };

      const truncated = truncateEvidence(evidence, 5000);

      expect(truncated.gitHistory).toBeDefined();
      expect(truncated.gitHistory!.length).toBeGreaterThan(0);
      expect(truncated.gitHistory!.length).toBeLessThanOrEqual(5);
    });

    it('should prioritize high-similarity knowledge docs', () => {
      const evidence: Evidence = {
        eventId: 'evt_test',
        relatedDocs: [
          {
            id: 'DOC-1',
            type: 'past_incident',
            title: 'Low similarity doc',
            similarity: 0.5,
          },
          {
            id: 'DOC-2',
            type: 'past_incident',
            title: 'High similarity doc',
            similarity: 0.9,
          },
          {
            id: 'DOC-3',
            type: 'runbook',
            title: 'Medium similarity doc',
            similarity: 0.75,
          },
        ],
        collectedAt: '2025-12-17T10:00:00Z',
      };

      const truncated = truncateEvidence(evidence, 3000);

      // Should only include docs with similarity > 0.7
      expect(truncated.relatedDocs).toBeDefined();
      if (truncated.relatedDocs && truncated.relatedDocs.length > 0) {
        expect(
          truncated.relatedDocs.every((doc) => doc.similarity > 0.7)
        ).toBe(true);
      }
    });

    it('should preserve metrics and system state', () => {
      const evidence: Evidence = {
        eventId: 'evt_test',
        logs: Array.from({ length: 100 }, (_, i) => ({
          level: 'ERROR',
          message: `Error ${i}`.repeat(100),
          timestamp: '2025-12-17T10:00:00Z',
        })),
        metrics: {
          summary: {
            errorRate: 0.05,
            cpuUsage: 75,
          },
        },
        systemState: {
          deploymentStatus: {
            currentVersion: 'v1.0.0',
          },
        },
        collectedAt: '2025-12-17T10:00:00Z',
      };

      const truncated = truncateEvidence(evidence, 2000);

      // Metrics and system state should always be preserved
      expect(truncated.metrics).toEqual(evidence.metrics);
      expect(truncated.systemState).toEqual(evidence.systemState);
    });

    it('should truncate to fit within token budget', () => {
      const largeEvidence: Evidence = {
        eventId: 'evt_test',
        logs: Array.from({ length: 100 }, (_, i) => ({
          level: 'ERROR',
          message: `This is a very long error message number ${i}`.repeat(50),
          timestamp: '2025-12-17T10:00:00Z',
        })),
        collectedAt: '2025-12-17T10:00:00Z',
      };

      const maxTokens = 1000;
      const truncated = truncateEvidence(largeEvidence, maxTokens);

      // Estimate tokens in truncated evidence
      const truncatedPrompt = formatEvidence(truncated);
      const truncatedTokens = estimateTokens(truncatedPrompt);

      // Should be significantly less than original
      const originalPrompt = formatEvidence(largeEvidence);
      const originalTokens = estimateTokens(originalPrompt);

      expect(truncatedTokens).toBeLessThan(originalTokens);
    });
  });
});
