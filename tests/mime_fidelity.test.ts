import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import {
  detectMimeFromBase64,
  resolveClientImageDetailed,
  resolveClientImageToBase64
} from '../src/services/geminiService';
import {
  resolveAndValidateImage,
  resolveAndValidateImages
} from '../server/ai/imageInputSecurity';

const createPngBuffer = async () => sharp({
  create: { width: 8, height: 8, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } }
}).png().toBuffer();

const createJpegBuffer = async () => sharp({
  create: { width: 8, height: 8, channels: 3, background: { r: 0, g: 255, b: 0 } }
}).jpeg().toBuffer();

const createWebpBuffer = async () => sharp({
  create: { width: 8, height: 8, channels: 4, background: { r: 0, g: 0, b: 255, alpha: 1 } }
}).webp().toBuffer();

describe('Reference Image MIME Fidelity & Security', () => {
  it('1. PNG Data URL input correctly resolves to image/png', async () => {
    const pngBuffer = await createPngBuffer();
    const dataUrl = `data:image/png;base64,${pngBuffer.toString('base64')}`;
    const res = await resolveClientImageDetailed(dataUrl);
    expect(res.mimeType).toBe('image/png');
    expect(res.base64Data).toBe(pngBuffer.toString('base64'));
  });

  it('2. JPEG Data URL input correctly resolves to image/jpeg', async () => {
    const jpegBuffer = await createJpegBuffer();
    const dataUrl = `data:image/jpeg;base64,${jpegBuffer.toString('base64')}`;
    const res = await resolveClientImageDetailed(dataUrl);
    expect(res.mimeType).toBe('image/jpeg');
    expect(res.base64Data).toBe(jpegBuffer.toString('base64'));
  });

  it('3. WebP Data URL input correctly resolves to image/webp', async () => {
    const webpBuffer = await createWebpBuffer();
    const dataUrl = `data:image/webp;base64,${webpBuffer.toString('base64')}`;
    const res = await resolveClientImageDetailed(dataUrl);
    expect(res.mimeType).toBe('image/webp');
    expect(res.base64Data).toBe(webpBuffer.toString('base64'));
  });

  it('4. File / Blob MIME can be read accurately', async () => {
    const pngBuffer = await createPngBuffer();
    const blob = new Blob([pngBuffer], { type: 'image/png' });
    const res = await resolveClientImageDetailed(blob);
    expect(res.mimeType).toBe('image/png');
    expect(res.base64Data).toBe(pngBuffer.toString('base64'));
  });

  it('5. Pure Base64 is NOT forcibly declared as image/jpeg if it is PNG or WebP', async () => {
    const pngBuffer = await createPngBuffer();
    const rawB64 = pngBuffer.toString('base64');
    expect(detectMimeFromBase64(rawB64)).toBe('image/png');

    const res = await resolveClientImageDetailed(rawB64);
    expect(res.mimeType).toBe('image/png');

    const webpBuffer = await createWebpBuffer();
    const webpB64 = webpBuffer.toString('base64');
    expect(detectMimeFromBase64(webpB64)).toBe('image/webp');
    const webpRes = await resolveClientImageDetailed(webpB64);
    expect(webpRes.mimeType).toBe('image/webp');
  });

  it('6. PNG Base64 does not generate data:image/jpeg prefix', async () => {
    const pngBuffer = await createPngBuffer();
    const pngB64 = pngBuffer.toString('base64');
    const res = await resolveClientImageDetailed(pngB64);
    const prefix = `data:${res.mimeType || 'image/png'};base64,`;
    expect(prefix).toBe('data:image/png;base64,');
    expect(prefix).not.toContain('image/jpeg');
  });

  it('7. Server continues to reject declared JPEG, real PNG malicious mismatch', async () => {
    const pngBuffer = await createPngBuffer();
    const source = pngBuffer.toString('base64');
    await expect(resolveAndValidateImage({
      source,
      role: 'primary_product',
      order: 0,
      declaredMimeType: 'image/jpeg'
    })).rejects.toThrow(/MIME/);
  });
});
