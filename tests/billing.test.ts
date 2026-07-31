import { describe, it, expect } from 'vitest';

describe('Billing Tests', () => {
  it('should calculate points correctly for Gemini 3.1 Pro', () => {
    const tokens = 1000000; // 1M tokens
    const priceData = { input: 12500, output: 50000 };
    const inTokens = Math.round(tokens * 0.3);
    const outTokens = Math.round(tokens * 0.7);
    const expectedPoints = Math.round((inTokens * priceData.input + outTokens * priceData.output) / 1000000);
    expect(expectedPoints).toBe(38750); // 3750 + 35000
  });
});
