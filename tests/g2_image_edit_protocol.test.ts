import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { getImageProviderAdapter } from '../server/ai/imageProviderAdapter';
import {
  assertSafeRemoteUrl,
  detectImageMimeType,
  isBlockedIpAddress,
  resolveAndValidateImage,
  resolveAndValidateImages,
  validateMask
} from '../server/ai/imageInputSecurity';
import {
  buildImageRoleManifest,
  normalizeImageReferences,
  parseGenerationIntent
} from '../server/ai/imageRequest';
import { assertProviderModelCompatibility, resolveImageModel } from '../server/ai/modelRegistry';

const png = async (width = 8, height = 6, alpha = true) => sharp({
  create: {
    width,
    height,
    channels: alpha ? 4 : 3,
    background: alpha ? { r: 0, g: 0, b: 0, alpha: 0 } : { r: 255, g: 255, b: 255 }
  }
}).png().toBuffer();

describe('G2 structured image edit protocol', () => {
  it('normalizes legacy images into stable roles and explicit order', () => {
    const refs = normalizeImageReferences([
      { data: 'BBBB', role: 'scene_reference', order: 2, referenceAssetId: 'scene-1' },
      { data: 'AAAA', role: 'primary_product', order: 0, referenceAssetId: 'sku-1' },
      'CCCC'
    ]);
    expect(refs.map(ref => ref.role)).toEqual(['primary_product', 'scene_reference', 'style_reference']);
    expect(buildImageRoleManifest(refs)).toContain('图1：主产品参考，资产ID=sku-1');
  });

  it('requires intent and image presence to agree', () => {
    expect(parseGenerationIntent(undefined, 1)).toBe('image_edit');
    expect(parseGenerationIntent('text_to_image', 0)).toBe('text_to_image');
    expect(() => parseGenerationIntent('text_to_image', 1)).toThrow(/不得携带参考图/);
    expect(() => parseGenerationIntent('image_edit', 0)).toThrow(/必须携带/);
  });

  it('registers gpt-image-2-all as a VectorEngine-only JSON edit protocol', () => {
    const model = resolveImageModel('gpt-image-2-all', 'image_edit');
    const adapter = getImageProviderAdapter(model);
    expect(model.transport).toBe('openai_images_json_multi');
    expect(model.capabilities).toMatchObject({ textToImage: false, imageEdit: true, mask: false });
    expect(adapter.usesMultipart('image_edit')).toBe(false);
    expect(adapter.buildEndpoint('https://vector.example/v1', model, 'image_edit'))
      .toBe('https://vector.example/v1/images/edits');
    expect(adapter.buildJsonPayload?.({
      model: model.id,
      publicUrls: ['https://cdn.example.com/primary.png', 'https://cdn.example.com/scene.jpg'],
      prompt: 'edit',
      size: '1024x1024',
      quality: 'high',
      outputFormat: 'png'
    })).toEqual({
      model: 'gpt-image-2-all',
      image: ['https://cdn.example.com/primary.png', 'https://cdn.example.com/scene.jpg'],
      prompt: 'edit',
      n: 1,
      size: '1024x1024',
      quality: 'high',
      output_format: 'png'
    });
    expect(() => adapter.buildJsonPayload?.({
      model: model.id,
      publicUrls: ['http://cdn.example.com/primary.png'],
      prompt: 'edit',
      size: '1024x1024',
      quality: 'high',
      outputFormat: 'png'
    })).toThrow(/public HTTPS/);
    expect(() => assertProviderModelCompatibility(model, 'routerhub', 'image_edit')).toThrow(/不支持模型/);
    expect(() => resolveImageModel('gpt-image-2-all', 'text_to_image')).toThrow(/不支持文生图/);
  });

  it('validates real signatures, dimensions and MIME instead of trusting request fields', async () => {
    const buffer = await png();
    const source = `data:image/png;base64,${buffer.toString('base64')}`;
    const [image] = await resolveAndValidateImages([
      { source, role: 'primary_product', order: 0, declaredMimeType: 'image/png' }
    ], 'edit this');
    expect(image).toMatchObject({ mimeType: 'image/png', width: 8, height: 6, hasAlpha: true });
    expect(detectImageMimeType(buffer)).toBe('image/png');

    await expect(resolveAndValidateImage({
      source,
      role: 'primary_product',
      order: 0,
      declaredMimeType: 'image/jpeg'
    })).rejects.toThrow(/MIME/);
  });

  it('requires a PNG alpha mask matching the first input image dimensions', async () => {
    const targetBuffer = await png(8, 6, false);
    const target = await resolveAndValidateImage({
      source: targetBuffer.toString('base64'), role: 'primary_product', order: 0
    });
    const validMask = await png(8, 6, true);
    await expect(validateMask({ data: validMask.toString('base64'), mimeType: 'image/png' }, target))
      .resolves.toMatchObject({ width: 8, height: 6, hasAlpha: true });

    const noAlpha = await png(8, 6, false);
    await expect(validateMask({ data: noAlpha.toString('base64'), mimeType: 'image/png' }, target))
      .rejects.toThrow(/Alpha/);

    const wrongSize = await png(7, 6, true);
    await expect(validateMask({ data: wrongSize.toString('base64'), mimeType: 'image/png' }, target))
      .rejects.toThrow(/必须与第一张目标图/);

    await expect(validateMask({
      data: validMask.toString('base64'),
      mimeType: 'image/png',
      targetReferenceAssetId: 'another-asset'
    }, { ...target, referenceAssetId: 'primary-asset' })).rejects.toThrow(/第一张目标图/);

    const jpegTargetBuffer = await sharp(targetBuffer).jpeg().toBuffer();
    const jpegTarget = await resolveAndValidateImage({
      source: jpegTargetBuffer.toString('base64'), role: 'primary_product', order: 0
    });
    await expect(validateMask({ data: validMask.toString('base64'), mimeType: 'image/png' }, jpegTarget))
      .rejects.toThrow(/第一张目标图也必须为 PNG/);
  });

  it('blocks local, private and plain HTTP remote image fetches before network I/O', async () => {
    expect(isBlockedIpAddress('127.0.0.1')).toBe(true);
    expect(isBlockedIpAddress('192.0.2.1')).toBe(true);
    expect(isBlockedIpAddress('198.51.100.2')).toBe(true);
    expect(isBlockedIpAddress('203.0.113.3')).toBe(true);
    expect(isBlockedIpAddress('::ffff:172.16.0.1')).toBe(true);
    expect(isBlockedIpAddress('2001:db8::1')).toBe(true);
    expect(isBlockedIpAddress('8.8.8.8')).toBe(false);
    await expect(resolveAndValidateImage({
      source: 'https://127.0.0.1/private.png', role: 'style_reference', order: 0
    })).rejects.toThrow(/私网|回环|保留/);
    await expect(resolveAndValidateImage({
      source: 'http://example.com/image.png', role: 'style_reference', order: 0
    })).rejects.toThrow(/仅允许 HTTPS/);
    await expect(assertSafeRemoteUrl('https://localhost/image.png')).rejects.toThrow(/本机|局域网/);
  });

  it('wires role-aware Gemini payloads, output_format and bounded request sizes', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'server.ts'), 'utf8');
    expect(source).toContain("generationConfig.responseModalities = ['TEXT', 'IMAGE']");
    expect(source).toContain("formData.append('output_format', imgFormat)");
    expect(source).toContain('modelAdapter.buildJsonPayload');
    expect(source).toContain("express.json({ limit: '150mb' })");
    expect(source).not.toContain("express.json({ limit: '500mb' })");
    const secondaryEntry = fs.readFileSync(path.join(process.cwd(), 'server/app.ts'), 'utf8');
    expect(secondaryEntry).toContain("express.json({ limit: '150mb' })");
  });
});
