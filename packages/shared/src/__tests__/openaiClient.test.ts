import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { OpenAIClient } from '../openaiClient/index.js';
import type { Event, Evidence } from '../types.js';

// Mock OpenAI SDK
const mockCreate = jest.fn();

jest.mock('openai', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: mockCreate,
        },
      },
    })),
  };
});

// Helper to set mock response
function setMockOpenAIResponse(response: any) {
  (mockCreate as any).mockResolvedValueOnce(response);
}

// Helper to set mock error
function setMockOpenAIError(error: any) {
  (mockCreate as any).mockRejectedValueOnce(error);
}

describe('OpenAIClient', () => {
  let client: OpenAIClient;
  let mockEvent: Event;
  let mockEvidence: Evidence;

  beforeEach(() => {
    mockCreate.mockClear();
    client = new OpenAIClient();

    mockEvent = {
      id: 'evt_test123',
      type: 'CICD_FAILURE',
      source: 'github',
      timestamp: '2025-12-17T10:00:00Z',
      severity: 'high',
      title: 'Test CI Failure',
      payload: {
        repository: 'test/repo',
        workflow: 'ci.yml',
        errorMessage: 'Build failed',
      },
    };

    mockEvidence = {
      eventId: 'evt_test123',
      logs: [
        {
          level: 'ERROR',
          message: 'AUTH_SECRET is not defined',
          timestamp: '2025-12-17T10:00:00Z',
          source: 'api',
        },
      ],
      gitHistory: [
        {
          sha: 'abc1234567',
          message: 'Update environment config',
          author: 'dev@example.com',
          timestamp: '2025-12-17T09:00:00Z',
        },
      ],
      collectedAt: '2025-12-17T10:00:00Z',
    };
  });

  describe('analyzeIncident', () => {
    it('should successfully analyze an incident', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                summary: 'Missing AUTH_SECRET environment variable',
                identifiedCause: 'AUTH_SECRET not configured',
                confidence: 'high',
                reasoning: 'Error log indicates AUTH_SECRET is not defined',
                recommendedActions: [
                  {
                    actionType: 'add_environment_variable',
                    description: 'Add AUTH_SECRET to environment',
                    priority: 'immediate',
                  },
                ],
                uncertainties: [],
                evidenceUsed: [
                  {
                    type: 'log',
                    reference: 'Log entry at 10:00:00',
                    relevance: 'Shows missing variable',
                  },
                ],
                relatedIncidents: [],
                nextSteps: ['Add environment variable and redeploy'],
              }),
            },
          },
        ],
      };

      setMockOpenAIResponse(mockResponse);

      const result = await client.analyzeIncident(mockEvent, mockEvidence);

      expect(result).toBeDefined();
      expect(result.eventId).toBe('evt_test123');
      expect(result.summary).toBe('Missing AUTH_SECRET environment variable');
      expect(result.identifiedCause).toBe('AUTH_SECRET not configured');
      expect(result.confidence).toBe('high');
      expect(result.llmModel).toBeDefined();
      expect(result.processingTime).toBeGreaterThan(0);
    });

    it('should retry on rate limit error (429)', async () => {
      const rateLimitError = {
        status: 429,
        message: 'Rate limit exceeded',
      };

      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                summary: 'Test summary',
                confidence: 'medium',
                recommendedActions: [],
                uncertainties: [],
                evidenceUsed: [],
                relatedIncidents: [],
                nextSteps: [],
              }),
            },
          },
        ],
      };

      setMockOpenAIError(rateLimitError);
      setMockOpenAIResponse(mockResponse);

      const result = await client.analyzeIncident(mockEvent, mockEvidence);

      expect(result).toBeDefined();
      expect(mockCreate).toHaveBeenCalledTimes(2); // Initial call + 1 retry
    });

    it('should throw error on authentication failure (401)', async () => {
      const authError = {
        status: 401,
        message: 'Invalid API key',
      };

      setMockOpenAIError(authError);

      await expect(
        client.analyzeIncident(mockEvent, mockEvidence)
      ).rejects.toThrow('OpenAI authentication failed');
    });

    it('should handle malformed JSON response', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: 'This is not valid JSON',
            },
          },
        ],
      };

      setMockOpenAIResponse(mockResponse);

      await expect(
        client.analyzeIncident(mockEvent, mockEvidence)
      ).rejects.toThrow('Failed to parse OpenAI response');
    });

    it('should detect dangerous keywords in recommendations', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                summary: 'Database issue',
                confidence: 'high',
                recommendedActions: [
                  {
                    actionType: 'manual_investigation',
                    description: 'Drop the database and recreate it',
                    priority: 'immediate',
                  },
                ],
                uncertainties: [],
                evidenceUsed: [],
                relatedIncidents: [],
                nextSteps: [],
              }),
            },
          },
        ],
      };

      setMockOpenAIResponse(mockResponse);

      // Spy on console.warn to check if validation warnings are logged
      const consoleWarnSpy = jest
        .spyOn(console, 'warn')
        .mockImplementation(() => {});

      const result = await client.analyzeIncident(mockEvent, mockEvidence);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[OpenAIClient] Validation errors:',
        expect.arrayContaining([
          expect.stringContaining('dangerous keyword "drop"'),
        ])
      );

      consoleWarnSpy.mockRestore();
    });

    it('should validate evidence references', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                summary: 'Test summary',
                confidence: 'high',
                reasoning: 'Based on commit xyz9999 which introduced the bug',
                recommendedActions: [],
                uncertainties: [],
                evidenceUsed: [
                  {
                    type: 'commit',
                    reference: 'Commit xyz9999',
                    relevance: 'Introduced the issue',
                  },
                ],
                relatedIncidents: [],
                nextSteps: [],
              }),
            },
          },
        ],
      };

      setMockOpenAIResponse(mockResponse);

      const result = await client.analyzeIncident(mockEvent, mockEvidence);

      // Analysis should complete despite validation warning about non-existent commit
      expect(result).toBeDefined();
      expect(result.summary).toBe('Test summary');
    });

    it('should truncate evidence when exceeding token budget', async () => {
      // Create evidence with lots of logs
      const largeEvidence: Evidence = {
        ...mockEvidence,
        logs: Array.from({ length: 100 }, (_, i) => ({
          level: 'ERROR',
          message: `Error message ${i}`.repeat(100),
          timestamp: '2025-12-17T10:00:00Z',
          source: 'api',
        })),
      };

      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                summary: 'Test summary',
                confidence: 'medium',
                recommendedActions: [],
                uncertainties: [],
                evidenceUsed: [],
                relatedIncidents: [],
                nextSteps: [],
              }),
            },
          },
        ],
      };

      setMockOpenAIResponse(mockResponse);

      const result = await client.analyzeIncident(mockEvent, largeEvidence);

      expect(result).toBeDefined();
      // Verify that API was called (meaning truncation succeeded)
    });

    it('should add metadata to analysis result', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                summary: 'Test summary',
                confidence: 'medium',
                recommendedActions: [],
                uncertainties: [],
                evidenceUsed: [],
                relatedIncidents: [],
                nextSteps: [],
              }),
            },
          },
        ],
      };

      setMockOpenAIResponse(mockResponse);

      const startTime = Date.now();
      const result = await client.analyzeIncident(mockEvent, mockEvidence);
      const endTime = Date.now();

      expect(result.llmModel).toBeDefined();
      expect(result.processingTime).toBeDefined();
      expect(result.processingTime).toBeGreaterThanOrEqual(0);
      expect(result.processingTime).toBeLessThan((endTime - startTime) / 1000 + 1);
      expect(result.analyzedAt).toBeDefined();
      expect(new Date(result.analyzedAt).getTime()).toBeGreaterThanOrEqual(
        startTime
      );
    });
  });
});
