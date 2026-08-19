import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { getImageProviderAdapter } from '../server/ai/imageProviderAdapter';
import { assertProviderModelCompatibility, resolveImageModel } from '../server/ai/modelRegistry';
import { providerErrorFromStatus, serializeProviderError } from '../server/ai/providerError';
import {
  buildNormalizedImageResponse,
  hasValidImages,
  normalizeGeminiImageResponse
} from '../server/ai/imageResponse';

describe('G1 provider architecture', () => {
  it('preserves explicitly selected Gemini models instead of broadly rewriting them', () => {
    expect(resolveImageModel('gemini-3.1-flash-image', 'text_to_image').id)
      .toBe('gemini-3.1-flash-image');
    expect(resolveImageModel('google/gemini-3-pro-image', 'image_edit').id)
      .toBe('gemini-3-pro-image');
    expect(resolveImageModel('openai/gpt-image-2', 'image_edit').id)
      .toBe('gpt-image-2');
  });

  it('supports only explicit aliases and rejects unknown image models', () => {
    expect(resolveImageModel('gemini-2.5-flash', 'text_to_image').id)
      .toBe('gemini-2.5-flash-image');
    expect(() => resolveImageModel('gemini-future-pro-image', 'text_to_image'))
      .toThrow(/未在图像能力注册表中启用/);
  });

  it('rejects incompatible provider and model combinations before network I/O', () => {
    const model = resolveImageModel('gpt-image-2', 'text_to_image');
    expect(() => assertProviderModelCompatibility(model, 'google', 'text_to_image'))
      .toThrow(/不支持模型/);
    expect(() => assertProviderModelCompatibility(model, 'vectorengine', 'image_edit'))
      .not.toThrow();
  });

  it('routes edit and generation intents to distinct OpenAI endpoints', () => {
    const model = resolveImageModel('gpt-image-2', 'image_edit');
    const adapter = getImageProviderAdapter(model);
    expect(adapter.buildEndpoint('https://example.com/v1beta', model, 'image_edit'))
      .toBe('https://example.com/v1/images/edits');
    expect(adapter.buildEndpoint('https://example.com/v1', model, 'text_to_image'))
      .toBe('https://example.com/v1/images/generations');
    expect(adapter.usesMultipart('image_edit')).toBe(true);
  });

  it('normalizes every valid Gemini candidate into images[] and compatibility candidates', () => {
    const imageA = 'a'.repeat(120);
    const imageB = 'b'.repeat(130);
    const result = normalizeGeminiImageResponse({
      responseId: 'provider-request-1',
      candidates: [
        { finishReason: 'STOP', content: { parts: [{ inlineData: { mimeType: 'image/png', data: imageA } }] } },
        { finishReason: 'STOP', content: { parts: [{ inlineData: { mimeType: 'image/webp', data: imageB } }] } }
      ],
      usageMetadata: { totalTokenCount: 10 }
    }, { actualModel: 'gemini-3.1-flash-image', provider: 'routerhub' });

    expect(result.images).toHaveLength(2);
    expect(result.candidates).toHaveLength(2);
    expect(result.providerRequestId).toBe('provider-request-1');
    expect(hasValidImages(result)).toBe(true);
  });

  it('normalizes OpenAI-style image arrays into the same response contract', () => {
    const result = buildNormalizedImageResponse([
      { mimeType: 'image/png', data: 'x'.repeat(120) },
      { mimeType: 'image/jpeg', data: 'y'.repeat(120) }
    ], { actualModel: 'gpt-image-2', provider: 'vectorengine' });
    expect(result.images).toHaveLength(2);
    expect(result.actualModel).toBe('gpt-image-2');
    expect(result.provider).toBe('vectorengine');
  });

  it('classifies upstream errors with stable category and retryability fields', () => {
    const error = providerErrorFromStatus(429, 'rate limit', 'routerhub', 'gemini-3.1-flash-image');
    const body = serializeProviderError(error, 'req-test');
    expect(body.error).toMatchObject({
      code: 'RATE_LIMITED',
      category: 'rate_limited',
      retryable: true,
      provider: 'routerhub',
      model: 'gemini-3.1-flash-image',
      requestId: 'req-test'
    });
  });

  it('keeps one config resolver and authenticates all generic AI proxy routes', () => {
    const root = process.cwd();
    const serverSource = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');
    const clientSource = fs.readFileSync(path.join(root, 'server/utils/aiClient.ts'), 'utf8');
    const configSource = fs.readFileSync(path.join(root, 'server/ai/providerConfig.ts'), 'utf8');

    expect(serverSource).not.toMatch(/function\s+resolveApiConfig/);
    expect(clientSource).not.toMatch(/function\s+resolveApiConfig/);
    expect(configSource.match(/function\s+resolveApiConfig/g)).toHaveLength(1);
    expect(serverSource).toContain("app.use(['/v1beta', '/v1alpha', '/v1'], authenticateToken as any");
  });

  it('contains an explicit refusal to downgrade invalid edits to generation', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'server.ts'), 'utf8');
    expect(source).toContain('已拒绝降级为文生图');
    expect(source).not.toContain("candidateModels.push('gpt-image-2')");
    expect(source).not.toMatch(/includes\(['"]flash['"]\)[\s\S]{0,120}gemini-2\.5-flash-image/);
  });
});
