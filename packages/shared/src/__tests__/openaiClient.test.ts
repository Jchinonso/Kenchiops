import { describe, it, expect } from '@jest/globals';
import { OpenAIClient } from '../openaiClient.js';

describe('OpenAIClient', () => {
  it('should create an instance', () => {
    const client = new OpenAIClient();
    expect(client).toBeInstanceOf(OpenAIClient);
  });

  it('should return a placeholder analysis', async () => {
    const client = new OpenAIClient();
    const prompt = 'Test prompt';
    const result = await client.generateAnalysis(prompt);
    
    expect(result).toBeDefined();
    expect(typeof result).toBe('string');
    expect(result).toContain('DUMMY ANALYSIS');
    expect(result).toContain(prompt);
  });

  it('should handle different prompts', async () => {
    const client = new OpenAIClient();
    const result1 = await client.generateAnalysis('Prompt 1');
    const result2 = await client.generateAnalysis('Prompt 2');
    
    expect(result1).not.toBe(result2);
    expect(result1).toContain('Prompt 1');
    expect(result2).toContain('Prompt 2');
  });
});

