import { describe, it, expect } from '@jest/globals';
import { confidenceScore, shouldActOnResult } from '../safety.js';

describe('Safety utilities', () => {
  describe('confidenceScore', () => {
    it('should return a number between 0 and 1', () => {
      const score = confidenceScore({ analysis: 'test' });
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });

    it('should return 0.5 as placeholder value', () => {
      const score = confidenceScore({ analysis: 'test' });
      expect(score).toBe(0.5);
    });
  });

  describe('shouldActOnResult', () => {
    it('should return false when confidence is below threshold', () => {
      const result = shouldActOnResult({ analysis: 'test' }, 0.8);
      expect(result).toBe(false);
    });

    it('should return true when confidence meets threshold', () => {
      const result = shouldActOnResult({ analysis: 'test' }, 0.4);
      expect(result).toBe(true);
    });

    it('should use default threshold of 0.8', () => {
      const result = shouldActOnResult({ analysis: 'test' });
      expect(result).toBe(false);
    });
  });
});

