import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { AppError } from '../types';
import { IMAGE_MODEL_REGISTRY, resolveImageModel } from '../ai/modelRegistry';

const DATA_DIR = path.join(process.cwd(), '.data');
const STORAGE_FILE = path.join(DATA_DIR, 'paid_authorizations.json');

export interface PaidAuthorizationRecord {
  paidAuthorizationId: string;
  workspaceId: string;
  scope: 'single_image_smoke';
  maxProviderCalls: number;
  consumedProviderCalls: number;
  remainingProviderCalls: number;
  status: 'active' | 'consumed' | 'revoked';
  createdAt: string;
  consumedAt?: string;
  lastRequestedBy?: string;
}

export interface PaidCallGateParams {
  executionMode?: string;
  confirmPaidCalls?: boolean;
  paidAuthorizationId?: string;
  paidAuthorizationScope?: string;
  screenIndexes?: number[];
  concurrency?: number;
  maxProviderCalls?: number;
  resolution?: string;
  provider?: string;
  model?: string;
  providerFallbackEnabled?: boolean;
  maxRetries?: number;
  workspaceId: string;
  dryRun?: boolean;
}

export interface PaidCallGateResult {
  valid: boolean;
  authorization?: PaidAuthorizationRecord;
  reason?: string;
}

export class PaidAuthorizationGateService {
  private static instance: PaidAuthorizationGateService;
  private store = new Map<string, PaidAuthorizationRecord>();

  constructor() {
    this.loadFromDisk();
  }

  public static getInstance(): PaidAuthorizationGateService {
    if (!PaidAuthorizationGateService.instance) {
      PaidAuthorizationGateService.instance = new PaidAuthorizationGateService();
    }
    return PaidAuthorizationGateService.instance;
  }

  private saveToDisk(): void {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      const data = Array.from(this.store.entries());
      fs.writeFileSync(STORAGE_FILE, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      console.error('[PaidAuthorizationGate] Failed to persist data to disk:', err);
    }
  }

  private loadFromDisk(): void {
    try {
      if (fs.existsSync(STORAGE_FILE)) {
        const raw = fs.readFileSync(STORAGE_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          this.store = new Map(parsed);
        }
        console.log(`[PaidAuthorizationGate] Restored ${this.store.size} authorization records from disk.`);
      }
    } catch (err) {
      console.error('[PaidAuthorizationGate] Failed to load data from disk:', err);
    }
  }

  /**
   * Provision a single_image_smoke authorization grant (1 max call).
   */
  public createAuthorizationGrant(workspaceId: string): PaidAuthorizationRecord {
    const paidAuthorizationId = `auth_smoke_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const record: PaidAuthorizationRecord = {
      paidAuthorizationId,
      workspaceId,
      scope: 'single_image_smoke',
      maxProviderCalls: 1,
      consumedProviderCalls: 0,
      remainingProviderCalls: 1,
      status: 'active',
      createdAt: new Date().toISOString()
    };

    this.store.set(paidAuthorizationId, record);
    this.saveToDisk();
    return record;
  }

  public registerCustomAuthorizationGrant(paidAuthorizationId: string, workspaceId: string): PaidAuthorizationRecord {
    const existing = this.store.get(paidAuthorizationId);
    if (existing) return existing;

    const record: PaidAuthorizationRecord = {
      paidAuthorizationId,
      workspaceId,
      scope: 'single_image_smoke',
      maxProviderCalls: 1,
      consumedProviderCalls: 0,
      remainingProviderCalls: 1,
      status: 'active',
      createdAt: new Date().toISOString()
    };

    this.store.set(paidAuthorizationId, record);
    this.saveToDisk();
    return record;
  }

  public getAuthorization(paidAuthorizationId: string): PaidAuthorizationRecord | null {
    return this.store.get(paidAuthorizationId) || null;
  }

  /**
   * Validates all required gate rules for real image smoke calls.
   * Throws AppError with specific error codes if any rule is violated.
   */
  public validatePaidCallGate(params: PaidCallGateParams): PaidCallGateResult {
    const {
      executionMode = 'real_smoke',
      confirmPaidCalls,
      paidAuthorizationId,
      paidAuthorizationScope,
      screenIndexes = [1],
      concurrency = 1,
      maxProviderCalls = 1,
      resolution = '1K',
      provider = 'vectorengine',
      model = 'gpt-image-2',
      providerFallbackEnabled = false,
      maxRetries = 0,
      workspaceId,
      dryRun = false
    } = params;

    // 1. Confirm executionMode for real smoke
    if (executionMode !== 'real_smoke' && !dryRun) {
      throw new AppError('请求模式不匹配真实冒烟预检', 400, 'PAID_CALL_NOT_AUTHORIZED');
    }

    // 2. confirmPaidCalls must be strictly true
    if (confirmPaidCalls !== true) {
      throw new AppError('付费接口调用未获得确认授权 (confirmPaidCalls 必须为 true)', 400, 'PAID_CALL_NOT_AUTHORIZED');
    }

    // 3. paidAuthorizationId must exist
    if (!paidAuthorizationId || typeof paidAuthorizationId !== 'string' || paidAuthorizationId.trim() === '') {
      throw new AppError('缺少有效的付费授权 ID (paidAuthorizationId)', 400, 'PAID_CALL_NOT_AUTHORIZED');
    }

    // 4. paidAuthorizationScope must equal 'single_image_smoke'
    if (paidAuthorizationScope !== 'single_image_smoke') {
      throw new AppError('付费授权 Scope 无效 (必须为 single_image_smoke)', 400, 'PAID_AUTHORIZATION_SCOPE_INVALID');
    }

    // 5. screenIndexes length must equal 1
    if (!Array.isArray(screenIndexes) || screenIndexes.length !== 1) {
      throw new AppError('单屏真实冒烟预检仅允许 1 个屏幕编号', 400, 'REAL_SMOKE_SINGLE_SCREEN_REQUIRED');
    }

    // 6. concurrency must equal 1
    if (concurrency !== 1) {
      throw new AppError('真实冒烟预检并发数必须等于 1', 400, 'REAL_SMOKE_CONCURRENCY_INVALID');
    }

    // 7. maxProviderCalls must equal 1
    if (maxProviderCalls !== 1) {
      throw new AppError('真实冒烟预检最大调用次数必须等于 1', 400, 'REAL_SMOKE_CALL_LIMIT_INVALID');
    }

    // 8. resolution must equal '1K'
    if (resolution !== '1K') {
      throw new AppError('真实冒烟预检分辨率当前仅允许 1K', 400, 'REAL_SMOKE_RESOLUTION_INVALID');
    }

    // 9. providerFallbackEnabled must be false
    if (providerFallbackEnabled === true) {
      throw new AppError('真实冒烟预检禁止开启 Provider 自动回退', 400, 'PROVIDER_FALLBACK_FORBIDDEN');
    }

    // 10. maxRetries must be 0
    if (maxRetries > 0) {
      throw new AppError('真实冒烟预检禁止自动重试 (maxRetries 必须为 0)', 400, 'PROVIDER_FALLBACK_FORBIDDEN');
    }

    // 11. Verified Capability Check for Provider & Model
    try {
      const def = resolveImageModel(model, 'text_to_image');
      if (!def.supportedProviders.includes(provider)) {
        throw new AppError(`模型“${model}”未在 Provider“${provider}”能力列表中验证`, 400, 'IMAGE_MODEL_UNVERIFIED');
      }
    } catch (err: any) {
      if (err instanceof AppError) throw err;
      throw new AppError(`模型“${model}”未在图像能力注册表中注册`, 400, 'IMAGE_MODEL_UNVERIFIED');
    }

    // 12. Check Authorization record existence & workspace isolation & replay guard
    const authRecord = this.getAuthorization(paidAuthorizationId);
    if (!authRecord) {
      throw new AppError('未找到指定的付费授权记录', 400, 'PAID_CALL_NOT_AUTHORIZED');
    }

    if (authRecord.workspaceId !== workspaceId) {
      throw new AppError('付费授权 ID 与当前 Workspace 归属不一致', 403, 'AUTHORIZATION_WORKSPACE_MISMATCH');
    }

    if (authRecord.status === 'consumed' || authRecord.consumedProviderCalls >= authRecord.maxProviderCalls) {
      throw new AppError('付费授权额度已消费，禁止重复重放调用', 400, 'AUTHORIZATION_REPLAY_FORBIDDEN');
    }

    return {
      valid: true,
      authorization: authRecord
    };
  }

  /**
   * Atomically consumes single_image_smoke call budget for a paidAuthorizationId.
   */
  public consumeAtomicBudget(paidAuthorizationId: string, workspaceId: string): PaidAuthorizationRecord {
    const authRecord = this.getAuthorization(paidAuthorizationId);
    if (!authRecord) {
      throw new AppError('未找到指定的付费授权记录', 400, 'PAID_CALL_NOT_AUTHORIZED');
    }

    if (authRecord.workspaceId !== workspaceId) {
      throw new AppError('付费授权 ID 与当前 Workspace 归属不一致', 403, 'AUTHORIZATION_WORKSPACE_MISMATCH');
    }

    if (authRecord.status === 'consumed' || authRecord.consumedProviderCalls >= authRecord.maxProviderCalls) {
      throw new AppError('付费授权额度已被消费，禁止重复调用', 400, 'AUTHORIZATION_REPLAY_FORBIDDEN');
    }

    authRecord.consumedProviderCalls += 1;
    authRecord.remainingProviderCalls = Math.max(0, authRecord.maxProviderCalls - authRecord.consumedProviderCalls);
    authRecord.status = 'consumed';
    authRecord.consumedAt = new Date().toISOString();

    this.store.set(paidAuthorizationId, authRecord);
    this.saveToDisk();

    return authRecord;
  }
}

export const paidAuthorizationGate = PaidAuthorizationGateService.getInstance();

/**
 * Utility function to sanitize and redact sensitive keys and base64 strings from log outputs.
 */
export function redactSensitiveData(obj: any): any {
  if (obj === null || obj === undefined) return obj;

  if (typeof obj === 'string') {
    // Redact base64 image data strings
    if (obj.startsWith('data:image/') || (obj.length > 100 && /^[A-Za-z0-9+/=]+$/.test(obj))) {
      return '[BASE64_IMAGE_DATA_REDACTED]';
    }
    // Redact API key / Authorization patterns
    if (obj.includes('Bearer ') || obj.startsWith('sk-') || obj.startsWith('ai-')) {
      return '[SENSITIVE_KEY_REDACTED]';
    }
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(redactSensitiveData);
  }

  if (typeof obj === 'object') {
    const redacted: Record<string, any> = {};
    for (const key of Object.keys(obj)) {
      const lowerKey = key.toLowerCase();
      if (
        lowerKey.includes('key') ||
        lowerKey.includes('token') ||
        lowerKey.includes('auth') ||
        lowerKey.includes('secret') ||
        lowerKey === 'b64_json' ||
        lowerKey === 'base64'
      ) {
        redacted[key] = '***REDACTED***';
      } else {
        redacted[key] = redactSensitiveData(obj[key]);
      }
    }
    return redacted;
  }

  return obj;
}
