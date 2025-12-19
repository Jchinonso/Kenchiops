import { describe, it, expect } from '@jest/globals';
import {
  calculateConfidenceScore,
  determineActionGating,
  confidenceScore,
  shouldActOnResult,
} from '../safety/index.js';
import type {
  LLMAnalysisResult,
  Evidence,
  ActionProposal,
} from '../types.js';

describe('Safety - Confidence Scoring', () => {
  describe('calculateConfidenceScore', () => {
    it('should calculate base score from LLM confidence', () => {
      const analysis: LLMAnalysisResult = {
        eventId: 'evt_test',
        summary: 'Test summary',
        confidence: 'high',
        analyzedAt: new Date().toISOString(),
      };

      const evidence: Evidence = {
        eventId: 'evt_test',
        collectedAt: new Date().toISOString(),
      };

      const result = calculateConfidenceScore(analysis, evidence);

      expect(result.finalScore).toBeGreaterThanOrEqual(0);
      expect(result.finalScore).toBeLessThanOrEqual(1);
      expect(result.breakdown.baseScore).toBe(0.75); // high = 0.75
      expect(result.reasoning[0]).toContain('Base score');
    });

    it('should apply uncertainty penalty for hedging language', () => {
      const analysis: LLMAnalysisResult = {
        eventId: 'evt_test',
        summary: 'I am not sure about this',
        identifiedCause: 'possibly a configuration issue',
        reasoning: 'It appears to be related to deployment',
        confidence: 'high',
        analyzedAt: new Date().toISOString(),
      };

      const evidence: Evidence = {
        eventId: 'evt_test',
        collectedAt: new Date().toISOString(),
      };

      const result = calculateConfidenceScore(analysis, evidence);

      // Should have strong uncertainty penalty (-0.15 for "not sure")
      expect(result.breakdown.uncertaintyAdjustment).toBeLessThan(0);
      expect(result.breakdown.uncertaintyAdjustment).toBeLessThanOrEqual(-0.15);
      expect(result.finalScore).toBeLessThan(0.75); // Less than base score
    });

    it('should reward evidence alignment when analysis references logs', () => {
      const analysis: LLMAnalysisResult = {
        eventId: 'evt_test',
        summary: 'Missing AUTH_SECRET environment variable',
        identifiedCause: 'AUTH_SECRET is not defined causing authentication failure',
        reasoning: 'The error log shows AUTH_SECRET is not defined',
        confidence: 'high',
        analyzedAt: new Date().toISOString(),
      };

      const evidence: Evidence = {
        eventId: 'evt_test',
        logs: [
          {
            level: 'ERROR',
            message: 'AUTH_SECRET is not defined',
            timestamp: new Date().toISOString(),
          },
        ],
        collectedAt: new Date().toISOString(),
      };

      const result = calculateConfidenceScore(analysis, evidence);

      // Should have positive evidence alignment (+0.15 for log reference)
      expect(result.breakdown.evidenceAlignment).toBeGreaterThan(0);
      expect(result.finalScore).toBeGreaterThan(0.75); // Greater than base score
    });

    it('should reward evidence alignment when analysis references commits', () => {
      const analysis: LLMAnalysisResult = {
        eventId: 'evt_test',
        summary: 'Configuration issue',
        reasoning: 'Based on commit abc1234 which modified the config',
        confidence: 'high',
        analyzedAt: new Date().toISOString(),
      };

      const evidence: Evidence = {
        eventId: 'evt_test',
        gitHistory: [
          {
            sha: 'abc1234567890',
            message: 'Update config',
            author: 'dev@example.com',
            timestamp: new Date().toISOString(),
          },
        ],
        collectedAt: new Date().toISOString(),
      };

      const result = calculateConfidenceScore(analysis, evidence);

      // Should have positive evidence alignment (+0.10 for commit reference)
      expect(result.breakdown.evidenceAlignment).toBeGreaterThan(0);
    });

    it('should penalize when no evidence alignment but cause identified', () => {
      const analysis: LLMAnalysisResult = {
        eventId: 'evt_test',
        summary: 'Database issue',
        identifiedCause: 'Database connection failed due to network timeout',
        confidence: 'high',
        analyzedAt: new Date().toISOString(),
      };

      const evidence: Evidence = {
        eventId: 'evt_test',
        logs: [
          {
            level: 'ERROR',
            message: 'Completely unrelated error message',
            timestamp: new Date().toISOString(),
          },
        ],
        collectedAt: new Date().toISOString(),
      };

      const result = calculateConfidenceScore(analysis, evidence);

      // Should have negative evidence alignment (-0.15)
      expect(result.breakdown.evidenceAlignment).toBe(-0.15);
    });

    it('should reward completeness when analysis is thorough', () => {
      const analysis: LLMAnalysisResult = {
        eventId: 'evt_test',
        summary: 'CI failure due to missing environment variable',
        identifiedCause: 'AUTH_SECRET environment variable is not configured',
        reasoning:
          'The error logs indicate that the AUTH_SECRET variable is missing. This is a critical configuration issue that prevents authentication.',
        impactAssessment: {
          scope: 'service',
          affectedUsers: 'all',
          businessImpact: 'high',
          description: 'All users affected',
        },
        confidence: 'high',
        recommendedActions: [
          {
            actionType: 'add_environment_variable',
            description: 'Add AUTH_SECRET',
            priority: 'immediate',
          },
          {
            actionType: 'notify_team',
            description: 'Notify security team',
            priority: 'high',
          },
        ],
        uncertainties: ['Unknown when the variable was removed'],
        analyzedAt: new Date().toISOString(),
      };

      const evidence: Evidence = {
        eventId: 'evt_test',
        collectedAt: new Date().toISOString(),
      };

      const result = calculateConfidenceScore(analysis, evidence);

      // Should have positive completeness score
      expect(result.breakdown.completeness).toBeGreaterThan(0);
      // Root cause + reasoning + actions + impact + uncertainties = +0.13
      expect(result.breakdown.completeness).toBeGreaterThanOrEqual(0.13);
    });

    it('should penalize incomplete analysis', () => {
      const analysis: LLMAnalysisResult = {
        eventId: 'evt_test',
        summary: 'Something went wrong',
        confidence: 'low',
        analyzedAt: new Date().toISOString(),
      };

      const evidence: Evidence = {
        eventId: 'evt_test',
        collectedAt: new Date().toISOString(),
      };

      const result = calculateConfidenceScore(analysis, evidence);

      // Should have negative completeness (-0.15)
      expect(result.breakdown.completeness).toBe(-0.15);
    });

    it('should reward knowledge base validation for high-similarity incidents', () => {
      const analysis: LLMAnalysisResult = {
        eventId: 'evt_test',
        summary: 'Similar to past incident',
        reasoning: 'This matches incident INC-123',
        relatedIncidents: ['INC-123'],
        confidence: 'high',
        analyzedAt: new Date().toISOString(),
      };

      const evidence: Evidence = {
        eventId: 'evt_test',
        relatedDocs: [
          {
            id: 'INC-123',
            type: 'past_incident',
            title: 'Previous AUTH failure',
            similarity: 0.90,
          },
        ],
        collectedAt: new Date().toISOString(),
      };

      const result = calculateConfidenceScore(analysis, evidence);

      // Should have positive knowledge base validation (+0.10)
      expect(result.breakdown.knowledgeBaseValidation).toBe(0.1);
    });

    it('should reward consistency when actions address cause', () => {
      const analysis: LLMAnalysisResult = {
        eventId: 'evt_test',
        summary: 'Missing environment variable',
        identifiedCause: 'AUTH_SECRET not configured',
        recommendedActions: [
          {
            actionType: 'add_environment_variable',
            description: 'Add AUTH_SECRET environment variable',
            priority: 'immediate',
          },
        ],
        confidence: 'high',
        analyzedAt: new Date().toISOString(),
      };

      const evidence: Evidence = {
        eventId: 'evt_test',
        collectedAt: new Date().toISOString(),
      };

      const result = calculateConfidenceScore(analysis, evidence);

      // Should have positive consistency (+0.05)
      expect(result.breakdown.consistency).toBe(0.05);
    });

    it('should penalize inconsistent actions', () => {
      const analysis: LLMAnalysisResult = {
        eventId: 'evt_test',
        summary: 'Deployment issue',
        identifiedCause: 'Deployment failed due to insufficient resources',
        recommendedActions: [
          {
            actionType: 'add_environment_variable',
            description: 'Add some random environment variable',
            priority: 'low',
          },
        ],
        confidence: 'high',
        analyzedAt: new Date().toISOString(),
      };

      const evidence: Evidence = {
        eventId: 'evt_test',
        collectedAt: new Date().toISOString(),
      };

      const result = calculateConfidenceScore(analysis, evidence);

      // Should have negative consistency (-0.10)
      expect(result.breakdown.consistency).toBe(-0.1);
    });

    it('should clamp final score to [0, 1] range', () => {
      const veryBadAnalysis: LLMAnalysisResult = {
        eventId: 'evt_test',
        summary: 'not sure, unclear, cannot determine',
        confidence: 'very_low',
        analyzedAt: new Date().toISOString(),
      };

      const evidence: Evidence = {
        eventId: 'evt_test',
        collectedAt: new Date().toISOString(),
      };

      const result = calculateConfidenceScore(veryBadAnalysis, evidence);

      expect(result.finalScore).toBeGreaterThanOrEqual(0);
      expect(result.finalScore).toBeLessThanOrEqual(1);
    });

    it('should provide detailed reasoning breakdown', () => {
      const analysis: LLMAnalysisResult = {
        eventId: 'evt_test',
        summary: 'Test summary',
        confidence: 'medium',
        analyzedAt: new Date().toISOString(),
      };

      const evidence: Evidence = {
        eventId: 'evt_test',
        collectedAt: new Date().toISOString(),
      };

      const result = calculateConfidenceScore(analysis, evidence);

      expect(result.reasoning).toBeInstanceOf(Array);
      expect(result.reasoning.length).toBeGreaterThan(0);
      expect(result.reasoning[0]).toContain('Base score');
      expect(result.reasoning[result.reasoning.length - 1]).toContain(
        'Final confidence score'
      );
    });

    it('should set appropriate gating decision based on score', () => {
      const lowConfidence: LLMAnalysisResult = {
        eventId: 'evt_test',
        summary: 'not sure',
        confidence: 'very_low',
        analyzedAt: new Date().toISOString(),
      };

      const highConfidence: LLMAnalysisResult = {
        eventId: 'evt_test',
        summary: 'Clear issue',
        identifiedCause: 'AUTH_SECRET is not defined',
        reasoning: 'The error log clearly shows AUTH_SECRET is not defined',
        confidence: 'very_high',
        analyzedAt: new Date().toISOString(),
      };

      const evidence: Evidence = {
        eventId: 'evt_test',
        logs: [
          {
            level: 'ERROR',
            message: 'AUTH_SECRET is not defined',
            timestamp: new Date().toISOString(),
          },
        ],
        collectedAt: new Date().toISOString(),
      };

      const lowResult = calculateConfidenceScore(lowConfidence, evidence);
      const highResult = calculateConfidenceScore(highConfidence, evidence);

      expect(lowResult.gatingDecision).toBe('block');
      expect(highResult.gatingDecision).toBe('auto_approve');
    });
  });

  describe('determineActionGating', () => {
    it('should block all actions for very low confidence (<0.3)', () => {
      const action: ActionProposal = {
        id: 'act_test',
        eventId: 'evt_test',
        actionType: 'notify_team',
        description: 'Notify team',
        confidence: 0.2,
        safetyLevel: 'safe',
        requiresApproval: true,
      };

      const result = determineActionGating(action, 0.2);

      expect(result.requiresApproval).toBe(true);
      expect(result.autoExecutable).toBe(false);
      expect(result.message).toContain('Very low confidence');
    });

    it('should require approval for low confidence (0.3-0.5)', () => {
      const action: ActionProposal = {
        id: 'act_test',
        eventId: 'evt_test',
        actionType: 'restart_service',
        description: 'Restart service',
        confidence: 0.4,
        safetyLevel: 'low_risk',
        requiresApproval: true,
      };

      const result = determineActionGating(action, 0.4);

      expect(result.requiresApproval).toBe(true);
      expect(result.autoExecutable).toBe(true);
      expect(result.message).toContain('Low confidence');
    });

    it('should require approval for medium confidence (0.5-0.7)', () => {
      const action: ActionProposal = {
        id: 'act_test',
        eventId: 'evt_test',
        actionType: 'add_environment_variable',
        description: 'Add env var',
        confidence: 0.6,
        safetyLevel: 'safe',
        requiresApproval: true,
      };

      const result = determineActionGating(action, 0.6);

      expect(result.requiresApproval).toBe(true);
      expect(result.autoExecutable).toBe(true);
      expect(result.message).toContain('Medium confidence');
    });

    it('should auto-approve safe actions with high confidence (0.7-0.85)', () => {
      const action: ActionProposal = {
        id: 'act_test',
        eventId: 'evt_test',
        actionType: 'notify_team',
        description: 'Notify team',
        confidence: 0.75,
        safetyLevel: 'safe',
        requiresApproval: false,
      };

      const result = determineActionGating(action, 0.75);

      expect(result.requiresApproval).toBe(false);
      expect(result.autoExecutable).toBe(true);
      expect(result.message).toContain('High confidence');
      expect(result.message).toContain('Auto-approved');
    });

    it('should require approval for risky actions even with high confidence', () => {
      const action: ActionProposal = {
        id: 'act_test',
        eventId: 'evt_test',
        actionType: 'rollback_deployment',
        description: 'Rollback',
        confidence: 0.75,
        safetyLevel: 'medium_risk',
        requiresApproval: true,
      };

      const result = determineActionGating(action, 0.75);

      expect(result.requiresApproval).toBe(true);
      expect(result.autoExecutable).toBe(true);
      expect(result.message).toContain('medium risk');
      expect(result.message).toContain('Approval required');
    });

    it('should auto-approve safe/low-risk actions with very high confidence (0.85+)', () => {
      const safeAction: ActionProposal = {
        id: 'act_test1',
        eventId: 'evt_test',
        actionType: 'notify_team',
        description: 'Notify team',
        confidence: 0.9,
        safetyLevel: 'safe',
        requiresApproval: false,
      };

      const lowRiskAction: ActionProposal = {
        id: 'act_test2',
        eventId: 'evt_test',
        actionType: 'restart_service',
        description: 'Restart service',
        confidence: 0.9,
        safetyLevel: 'low_risk',
        requiresApproval: false,
      };

      const safeResult = determineActionGating(safeAction, 0.9);
      const lowRiskResult = determineActionGating(lowRiskAction, 0.9);

      expect(safeResult.requiresApproval).toBe(false);
      expect(safeResult.autoExecutable).toBe(true);
      expect(lowRiskResult.requiresApproval).toBe(false);
      expect(lowRiskResult.autoExecutable).toBe(true);
    });

    it('should require approval for medium-risk actions even with very high confidence', () => {
      const action: ActionProposal = {
        id: 'act_test',
        eventId: 'evt_test',
        actionType: 'rollback_deployment',
        description: 'Rollback',
        confidence: 0.9,
        safetyLevel: 'medium_risk',
        requiresApproval: true,
      };

      const result = determineActionGating(action, 0.9);

      expect(result.requiresApproval).toBe(true);
      expect(result.autoExecutable).toBe(true);
      expect(result.message).toContain('medium risk');
    });

    it('should always require approval for dangerous actions', () => {
      const action: ActionProposal = {
        id: 'act_test',
        eventId: 'evt_test',
        actionType: 'manual_investigation',
        description: 'Manual investigation required',
        confidence: 0.95,
        safetyLevel: 'dangerous',
        requiresApproval: true,
      };

      const result = determineActionGating(action, 0.95);

      expect(result.requiresApproval).toBe(true);
      expect(result.message).toContain('Always requires approval');
    });
  });

  // Legacy function tests (for backward compatibility)
  describe('Legacy functions', () => {
    describe('confidenceScore', () => {
      it('should return 0.5 as placeholder value', () => {
        const score = confidenceScore({ test: 'value' });
        expect(score).toBe(0.5);
      });
    });

    describe('shouldActOnResult', () => {
      const mockAnalysis: LLMAnalysisResult = {
        eventId: 'evt_legacy',
        summary: 'Test summary',
        confidence: 'low',
        analyzedAt: new Date().toISOString(),
      };

      it('should return false when confidence is below threshold', () => {
        const result = shouldActOnResult(mockAnalysis, 0.8);
        expect(result).toBe(false);
      });

      it('should return true when confidence meets threshold', () => {
        const result = shouldActOnResult(mockAnalysis, 0.2);
        expect(result).toBe(true);
      });

      it('should use default threshold of 0.7', () => {
        const result = shouldActOnResult(mockAnalysis);
        expect(result).toBe(false);
      });
    });
  });
});
