import dns from 'node:dns/promises';
import net from 'node:net';
import sharp from 'sharp';
import { ProviderError } from './providerError';
import type { NormalizedImageReference } from './imageRequest';

export const MAX_SINGLE_IMAGE_BYTES = 50 * 1024 * 1024;
export const MAX_MASK_BYTES = 4 * 1024 * 1024;
export const MAX_TOTAL_IMAGE_BYTES = 100 * 1024 * 1024;
export const MAX_PROMPT_BYTES = 1024 * 1024;
const MAX_REDIRECTS = 3;

export interface ResolvedImageReference extends NormalizedImageReference {
  cleanB64: string;
  buffer: Buffer;
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
  width: number;
  height: number;
  hasAlpha: boolean;
  publicUrl?: string;
}

const isBlockedIpv4 = (ip: string) => {
  const octets = ip.split('.').map(Number);
  if (octets.length !== 4 || octets.some(value => !Number.isInteger(value) || value < 0 || value > 255)) return true;
  return octets[0] === 10 || octets[0] === 127 || octets[0] === 0 ||
    (octets[0] === 169 && octets[1] === 254) ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168) ||
    (octets[0] === 192 && octets[1] === 0 && (octets[2] === 0 || octets[2] === 2)) ||
    (octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127) ||
    (octets[0] === 198 && (octets[1] === 18 || octets[1] === 19)) ||
    (octets[0] === 198 && octets[1] === 51 && octets[2] === 100) ||
    (octets[0] === 203 && octets[1] === 0 && octets[2] === 113) ||
    octets[0] >= 224;
};

export const isBlockedIpAddress = (ip: string) => {
  if (net.isIPv4(ip)) return isBlockedIpv4(ip);
  if (!net.isIPv6(ip)) return true;
  const normalized = ip.toLowerCase();
  const mappedIpv4 = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (mappedIpv4) return isBlockedIpv4(mappedIpv4);
  return normalized === '::1' || normalized === '::' || normalized.startsWith('fc') ||
    normalized.startsWith('fd') || /^fe[89ab]/.test(normalized) || normalized.startsWith('ff') ||
    normalized.startsWith('2001:db8:') || normalized === '2001:db8::' ||
    normalized.startsWith('2001:0:') || normalized.startsWith('2002:') ||
    !/^[23][0-9a-f]{3}:/.test(normalized);
};

export async function assertSafeRemoteUrl(value: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ProviderError('远程图片 URL 无效。', 'invalid_image_input', 400, false);
  }
  if (url.protocol !== 'https:') {
    throw new ProviderError('远程参考图仅允许 HTTPS URL。', 'invalid_image_input', 400, false);
  }
  if (url.username || url.password) {
    throw new ProviderError('远程图片 URL 不得包含用户凭据。', 'invalid_image_input', 400, false);
  }
  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) {
    throw new ProviderError('已阻止访问本机或局域网图片地址。', 'invalid_image_input', 400, false);
  }
  const addresses = await dns.lookup(host, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some(item => isBlockedIpAddress(item.address))) {
    throw new ProviderError('已阻止解析到私网、回环或保留地址的图片 URL。', 'invalid_image_input', 400, false);
  }
  return url;
}

async function fetchRemoteImage(value: string, redirectCount = 0): Promise<{ buffer: Buffer; contentType: string; finalUrl: string }> {
  const url = await assertSafeRemoteUrl(value);
  const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(15_000) });
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get('location');
    if (!location || redirectCount >= MAX_REDIRECTS) {
      throw new ProviderError('远程图片重定向无效或次数过多。', 'invalid_image_input', 400, false);
    }
    return fetchRemoteImage(new URL(location, url).toString(), redirectCount + 1);
  }
  if (!response.ok) {
    throw new ProviderError(`远程图片下载失败（HTTP ${response.status}）。`, 'invalid_image_input', 400, false);
  }
  const contentLength = Number(response.headers.get('content-length') || 0);
  if (contentLength > MAX_SINGLE_IMAGE_BYTES) {
    throw new ProviderError('远程图片超过单图 50MB 限制。', 'payload_too_large', 413, false);
  }
  const contentType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!contentType.startsWith('image/')) {
    throw new ProviderError('远程 URL 返回的内容不是图片。', 'invalid_image_input', 400, false);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > MAX_SINGLE_IMAGE_BYTES) {
    throw new ProviderError('远程图片超过单图 50MB 限制。', 'payload_too_large', 413, false);
  }
  return { buffer, contentType, finalUrl: url.toString() };
}

function decodeBase64(value: string): { buffer: Buffer; declaredMimeType?: string } {
  let encoded = value.trim();
  let declaredMimeType: string | undefined;
  if (encoded.startsWith('data:')) {
    const match = encoded.match(/^data:([^;,]+);base64,([A-Za-z0-9+/=\s]+)$/);
    if (!match) throw new ProviderError('图片 Data URL 格式无效。', 'invalid_image_input', 400, false);
    declaredMimeType = match[1].toLowerCase();
    encoded = match[2];
  } else if (encoded.includes(',')) {
    encoded = encoded.slice(encoded.indexOf(',') + 1);
  }
  if (!/^[A-Za-z0-9+/=\s]+$/.test(encoded)) {
    throw new ProviderError('图片 Base64 数据包含非法字符。', 'invalid_image_input', 400, false);
  }
  const buffer = Buffer.from(encoded, 'base64');
  if (buffer.length === 0) throw new ProviderError('图片 Base64 数据为空。', 'invalid_image_input', 400, false);
  return { buffer, declaredMimeType };
}

function normalizeMimeType(mime?: string): string | undefined {
  if (!mime) return undefined;
  const lower = mime.toLowerCase().trim();
  if (lower === 'image/jpg' || lower === 'image/pjpeg' || lower === 'image/jpeg') return 'image/jpeg';
  if (lower === 'image/png' || lower === 'image/x-png') return 'image/png';
  if (lower === 'image/webp') return 'image/webp';
  if (lower === 'application/octet-stream' || lower === 'binary/octet-stream' || lower === 'image/*' || lower === 'image/unknown') return undefined;
  return lower;
}

export function detectImageMimeType(buffer: Buffer): ResolvedImageReference['mimeType'] | null {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

export async function resolveAndValidateImage(reference: NormalizedImageReference): Promise<ResolvedImageReference> {
  const isRemote = /^https?:\/\//i.test(reference.source);
  const fetched = isRemote ? await fetchRemoteImage(reference.source) : null;
  const decoded = fetched ? null : decodeBase64(reference.source);
  const buffer = fetched?.buffer || decoded!.buffer;
  if (buffer.length > MAX_SINGLE_IMAGE_BYTES) {
    throw new ProviderError('参考图超过单图 50MB 限制。', 'payload_too_large', 413, false);
  }
  const mimeType = detectImageMimeType(buffer);
  if (!mimeType) throw new ProviderError('参考图文件签名无效，仅支持 PNG、JPEG、WebP。', 'invalid_image_input', 400, false);
  
  const explicitDeclared = normalizeMimeType(reference.declaredMimeType);
  if (explicitDeclared && explicitDeclared !== mimeType) {
    throw new ProviderError('参考图声明的 MIME 与真实文件内容不一致。', 'invalid_image_input', 400, false);
  }
  let metadata: sharp.Metadata;
  try {
    metadata = await sharp(buffer, { failOn: 'error' }).metadata();
  } catch {
    throw new ProviderError('参考图无法解码或文件已损坏。', 'invalid_image_input', 400, false);
  }
  if (!metadata.width || !metadata.height) throw new ProviderError('无法读取参考图尺寸。', 'invalid_image_input', 400, false);
  return {
    ...reference,
    cleanB64: buffer.toString('base64'),
    buffer,
    mimeType,
    width: metadata.width,
    height: metadata.height,
    hasAlpha: Boolean(metadata.hasAlpha),
    publicUrl: fetched?.finalUrl
  };
}

export async function resolveAndValidateImages(references: NormalizedImageReference[], prompt: string): Promise<ResolvedImageReference[]> {
  if (Buffer.byteLength(prompt || '', 'utf8') > MAX_PROMPT_BYTES) {
    throw new ProviderError('Prompt 超过 1MB 限制。', 'payload_too_large', 413, false);
  }
  const resolved: ResolvedImageReference[] = [];
  let total = 0;
  for (const reference of references) {
    const image = await resolveAndValidateImage(reference);
    total += image.buffer.length;
    if (total > MAX_TOTAL_IMAGE_BYTES) {
      throw new ProviderError('参考图合计超过 100MB 限制。', 'payload_too_large', 413, false);
    }
    resolved.push(image);
  }
  return resolved;
}

export async function validateMask(maskValue: unknown, firstImage: ResolvedImageReference) {
  if (firstImage.mimeType !== 'image/png') {
    throw new ProviderError('使用 Mask 时，第一张目标图也必须为 PNG，以保证目标图与 Mask 格式一致。', 'invalid_image_input', 400, false);
  }
  const targetReferenceAssetId = typeof maskValue === 'object'
    ? (maskValue as any)?.targetReferenceAssetId
    : undefined;
  if (targetReferenceAssetId && targetReferenceAssetId !== firstImage.referenceAssetId) {
    throw new ProviderError('Mask 只能作用于排序后的第一张目标图，targetReferenceAssetId 与第一张图不一致。', 'invalid_image_input', 400, false);
  }
  const raw = typeof maskValue === 'string' ? maskValue : (maskValue as any)?.data || (maskValue as any)?.base64Data;
  if (!raw) throw new ProviderError('Mask 缺少有效图像数据。', 'invalid_image_input', 400, false);
  const reference: NormalizedImageReference = {
    source: raw,
    declaredMimeType: typeof maskValue === 'object' ? (maskValue as any)?.mimeType : 'image/png',
    role: 'primary_product',
    order: 0
  };
  const mask = await resolveAndValidateImage(reference);
  if (mask.buffer.length > MAX_MASK_BYTES) throw new ProviderError('Mask 超过 4MB 限制。', 'payload_too_large', 413, false);
  if (mask.mimeType !== 'image/png') throw new ProviderError('Mask 必须为真实 PNG 文件。', 'invalid_image_input', 400, false);
  if (!mask.hasAlpha) throw new ProviderError('Mask PNG 必须包含 Alpha 透明通道。', 'invalid_image_input', 400, false);
  if (mask.width !== firstImage.width || mask.height !== firstImage.height) {
    throw new ProviderError(`Mask 尺寸 ${mask.width}x${mask.height} 必须与第一张目标图 ${firstImage.width}x${firstImage.height} 一致。`, 'invalid_image_input', 400, false);
  }
  return mask;
}
