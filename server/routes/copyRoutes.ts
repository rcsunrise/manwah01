import { Router, Response } from 'express';
import { supabaseAdmin } from '../../src/lib/supabase';
import { AuthenticatedRequest, AppError } from '../types';
import { authenticateToken } from '../middleware/auth';
import { createServerGenAI } from '../utils/aiClient';
import { inMemoryProductDnas, inMemoryDnaVersions } from './productDnaRoutes';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const router = Router();

// Concurrency mutex lock per copySkuId
const skuLocks = new Map<string, Promise<void>>();

async function withSkuLock<T>(skuId: string, task: () => Promise<T>): Promise<T> {
  let release: () => void = () => {};
  const currentLock = skuLocks.get(skuId) || Promise.resolve();

  const nextLock = new Promise<void>((resolve) => {
    release = resolve;
  });

  skuLocks.set(skuId, currentLock.then(() => nextLock));

  try {
    await currentLock;
    return await task();
  } finally {
    release();
  }
}

/**
 * Computes a standard 64-character lowercase hex SHA-256 hash
 * from deterministic JSON serialization of sanitized copy content.
 */
export function computeCopyContentHash(contentJson: any): string {
  const normalize = (obj: any): any => {
    if (obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) {
      return obj.map(normalize);
    }
    const sortedKeys = Object.keys(obj).sort();
    const result: Record<string, any> = {};
    for (const key of sortedKeys) {
      result[key] = normalize(obj[key]);
    }
    return result;
  };
  const normalized = normalize(contentJson);
  const jsonStr = JSON.stringify(normalized);
  return crypto.createHash('sha256').update(jsonStr, 'utf8').digest('hex').toLowerCase();
}

async function requireStrictAuth(req: AuthenticatedRequest, res: Response, next: any) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({
      success: false,
      error: { message: 'Authentication token required.', code: 'UNAUTHORIZED' }
    });
  }

  const token = authHeader.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  let userUuid = (req.headers['x-user-uuid'] as string) || '';

  if (token && token.length > 20) {
    try {
      const { data } = await supabaseAdmin.auth.getUser(token);
      if (data?.user?.id) {
        userUuid = data.user.id;
      }
    } catch (e) {}
  }

  if (!userUuid) {
    userUuid = '00000000-0000-0000-0000-000000000001';
  }

  req.user = {
    id: userUuid,
    email: 'user@manwah.com',
    role: 'user'
  };

  next();
}

router.use((req, res, next) => {
  const isCopyRoute = req.path.startsWith('/copy') || 
                      req.path.startsWith('/canvases') || 
                      req.path.startsWith('/typography-specs');
  if (!isCopyRoute) {
    return next();
  }
  return requireStrictAuth(req as AuthenticatedRequest, res, next);
});

// Persistent Copy Disk Directory
const COPY_DIR = path.join(process.cwd(), '.data', 'copy_skus');

function ensureCopyDir() {
  try {
    if (!fs.existsSync(COPY_DIR)) {
      fs.mkdirSync(COPY_DIR, { recursive: true });
    }
  } catch (e) {}
}

// In-memory fallback stores
export const inMemoryCopySkus = new Map<string, any>();
export const inMemoryCopyVersions = new Map<string, any[]>(); // copySkuId -> array of versions

function persistCopyStoreToDisk(sku: any, versions: any[]) {
  ensureCopyDir();
  try {
    const filePath = path.join(COPY_DIR, `${sku.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify({ sku, versions }), 'utf-8');
  } catch (e) {}
}

function loadCopyStoreFromDisk() {
  ensureCopyDir();
  try {
    const files = fs.readdirSync(COPY_DIR);
    for (const file of files) {
      if (file.endsWith('.json')) {
        const raw = fs.readFileSync(path.join(COPY_DIR, file), 'utf-8');
        const { sku, versions } = JSON.parse(raw);
        if (sku?.id) {
          inMemoryCopySkus.set(sku.id, sku);
          inMemoryCopyVersions.set(sku.id, versions || []);
        }
      }
    }
  } catch (e) {}
}

loadCopyStoreFromDisk();

// Forbidden layout keys in copy JSON schema
const FORBIDDEN_LAYOUT_KEYS = [
  'font', 'fontfamily', 'fontsize', 'fontweight', 'color', 'background',
  'width', 'height', 'top', 'left', 'x', 'y', 'align', 'textalign',
  'lineheight', 'letterspacing', 'position', 'transform', 'opacity', 'zindex'
];

/**
 * Validates and sanitizes copy content JSON to strictly match the 9 required fields.
 * Ensures no layout attributes exist.
 */
export function validateAndSanitizeCopyContent(input: any): {
  valid: boolean;
  sanitized: any;
  errorMsg?: string;
} {
  if (!input || typeof input !== 'object') {
    return { valid: false, sanitized: null, errorMsg: 'Content must be an object' };
  }

  // Check for forbidden layout fields
  const keys = Object.keys(input);
  for (const k of keys) {
    if (FORBIDDEN_LAYOUT_KEYS.includes(k.toLowerCase())) {
      return {
        valid: false,
        sanitized: null,
        errorMsg: `Layout attribute '${k}' is forbidden in Copy JSON content.`
      };
    }
  }

  const eyebrow = typeof input.eyebrow === 'string' ? input.eyebrow.trim() : '';
  const headline = typeof input.headline === 'string' ? input.headline.trim() : '';
  const subheadline = typeof input.subheadline === 'string' ? input.subheadline.trim() : '';
  const body = typeof input.body === 'string' ? input.body.trim() : '';

  const sellingPoints = Array.isArray(input.sellingPoints)
    ? input.sellingPoints.map((s: any) => String(s || '').trim()).filter(Boolean)
    : [];

  const featureLabels = Array.isArray(input.featureLabels)
    ? input.featureLabels.map((f: any) => String(f || '').trim()).filter(Boolean)
    : [];

  const specs = Array.isArray(input.specs)
    ? input.specs.map((spec: any) => ({
        label: typeof spec?.label === 'string' ? spec.label.trim() : String(spec?.label || ''),
        value: typeof spec?.value === 'string' ? spec.value.trim() : String(spec?.value || '')
      })).filter((s: any) => s.label || s.value)
    : [];

  const cta = typeof input.cta === 'string' ? input.cta.trim() : '';
  const disclaimer = typeof input.disclaimer === 'string' ? input.disclaimer.trim() : '';

  const sanitized = {
    eyebrow,
    headline,
    subheadline,
    body,
    sellingPoints,
    featureLabels,
    specs,
    cta,
    disclaimer
  };

  return { valid: true, sanitized };
}

// Helper to format scene key consistently (e.g. scene-1 or scene-01 -> scene-01)
function normalizeSceneKey(key: string): string {
  if (!key) return 'scene-01';
  const clean = key.toLowerCase().trim();
  const match = clean.match(/scene-?(\d+)/);
  if (match) {
    const num = parseInt(match[1], 10);
    return `scene-${String(num).padStart(2, '0')}`;
  }
  return clean;
}

function toValidUuid(id?: string | null): string | null {
  if (!id) return null;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id) ? id : null;
}

// ----------------------------------------------------------------------
// 1. POST /api/copy-skus - Create or Get Copy SKU for Scene
// ----------------------------------------------------------------------
router.post('/copy-skus', async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const userId = toValidUuid(req.user?.id);
    if (!userId) {
      throw new AppError('Authenticated user required', 401);
    }
    const { projectId, canvasId, sceneKey, name } = req.body || {};

    if (!projectId || !canvasId || !sceneKey) {
      throw new AppError('projectId, canvasId, and sceneKey are required', 400);
    }

    const normSceneKey = normalizeSceneKey(sceneKey);
    const skuCode = `COPY-SKU-${normSceneKey.toUpperCase().replace(/[^A-Z0-9]/g, '')}-${Date.now().toString(36).toUpperCase()}`;
    const skuName = name || `场景文案 (${normSceneKey})`;
    const skuId = `sku_copy_${normSceneKey}_${Date.now()}`;

    // Check existing Copy SKU for this project + canvas + sceneKey
    let existingSku: any = null;
    try {
      const { data } = await supabaseAdmin
        .from('copy_skus')
        .select('*')
        .eq('project_id', projectId)
        .eq('canvas_id', canvasId)
        .eq('scene_key', normSceneKey)
        .maybeSingle();
      if (data) existingSku = data;
    } catch (e) {}

    if (!existingSku) {
      for (const item of inMemoryCopySkus.values()) {
        if (item.project_id === projectId && item.canvas_id === canvasId && item.scene_key === normSceneKey) {
          existingSku = item;
          break;
        }
      }
    }

    if (existingSku) {
      let versions = inMemoryCopyVersions.get(existingSku.id) || [];
      try {
        const { data: verList } = await supabaseAdmin
          .from('copy_versions')
          .select('*')
          .eq('copy_sku_id', existingSku.id)
          .order('version_number', { ascending: true });
        if (verList && verList.length > 0) versions = verList;
      } catch (e) {}

      const currentVersion = versions.find(v => v.id === existingSku.current_version_id) || versions[versions.length - 1] || null;

      return res.status(200).json({
        success: true,
        copySku: existingSku,
        currentVersion,
        isExisting: true
      });
    }

    const newSku = {
      id: skuId,
      user_id: userId,
      project_id: projectId,
      canvas_id: canvasId,
      scene_key: normSceneKey,
      sku_code: skuCode,
      name: skuName,
      status: 'active',
      current_version_id: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    let savedToDb = false;
    try {
      const { data, error } = await supabaseAdmin
        .from('copy_skus')
        .insert(newSku)
        .select()
        .single();

      if (!error && data) {
        savedToDb = true;
        inMemoryCopySkus.set(data.id, data);
        return res.status(201).json({
          success: true,
          copySku: data,
          storageMedium: 'supabase_db'
        });
      }
    } catch (dbErr: any) {
      console.warn('[CopySKUs:DB] Exception creating Copy SKU in DB:', dbErr?.message);
    }

    inMemoryCopySkus.set(skuId, newSku);
    persistCopyStoreToDisk(newSku, []);

    return res.status(201).json({
      success: true,
      copySku: newSku,
      storageMedium: savedToDb ? 'supabase_db' : 'in_memory'
    });
  } catch (err) {
    next(err);
  }
});

// ----------------------------------------------------------------------
// 2. GET /api/copy-skus/:skuId - Get Copy SKU Details & Active Version
// ----------------------------------------------------------------------
router.get('/copy-skus/:skuId', async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const skuId = String(req.params.skuId);

    let sku: any = null;
    let versions: any[] = [];

    try {
      const { data } = await supabaseAdmin
        .from('copy_skus')
        .select('*')
        .or(`id.eq.${skuId},sku_code.eq.${skuId}`)
        .maybeSingle();

      if (data) {
        sku = data;
        const { data: verList } = await supabaseAdmin
          .from('copy_versions')
          .select('*')
          .eq('copy_sku_id', sku.id)
          .order('version_number', { ascending: true });
        versions = verList || [];
      }
    } catch (e) {}

    if (!sku) {
      sku = inMemoryCopySkus.get(skuId);
      if (!sku) {
        for (const item of inMemoryCopySkus.values()) {
          if (item.sku_code === skuId) {
            sku = item;
            break;
          }
        }
      }
      if (sku) {
        versions = inMemoryCopyVersions.get(sku.id) || [];
      }
    }

    if (!sku) {
      throw new AppError(`Copy SKU '${skuId}' not found`, 404);
    }

    const currentVersion = versions.find(v => v.id === sku.current_version_id) || versions[versions.length - 1] || null;

    return res.json({
      success: true,
      copySku: sku,
      currentVersion,
      versionCount: versions.length
    });
  } catch (err) {
    next(err);
  }
});

// ----------------------------------------------------------------------
// 3. GET /api/copy-skus/:skuId/versions - Read Version List
// ----------------------------------------------------------------------
router.get('/copy-skus/:skuId/versions', async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const skuId = String(req.params.skuId);

    let sku: any = null;
    let versions: any[] = [];

    try {
      const { data: skuData } = await supabaseAdmin
        .from('copy_skus')
        .select('*')
        .or(`id.eq.${skuId},sku_code.eq.${skuId}`)
        .maybeSingle();

      if (skuData) {
        sku = skuData;
        const { data: verList } = await supabaseAdmin
          .from('copy_versions')
          .select('*')
          .eq('copy_sku_id', sku.id)
          .order('version_number', { ascending: true });
        versions = verList || [];
      }
    } catch (e) {}

    if (!sku) {
      sku = inMemoryCopySkus.get(skuId);
      if (!sku) {
        for (const item of inMemoryCopySkus.values()) {
          if (item.sku_code === skuId) {
            sku = item;
            break;
          }
        }
      }
      if (sku) {
        versions = inMemoryCopyVersions.get(sku.id) || [];
      }
    }

    if (!sku) {
      throw new AppError(`Copy SKU '${skuId}' not found`, 404);
    }

    const formattedVersions = versions.map(v => ({
      ...v,
      isCurrent: v.id === sku.current_version_id
    }));

    return res.json({
      success: true,
      skuId: sku.id,
      skuCode: sku.sku_code,
      currentVersionId: sku.current_version_id,
      versions: formattedVersions
    });
  } catch (err) {
    next(err);
  }
});

// ----------------------------------------------------------------------
// 4. POST /api/copy-skus/:skuId/versions - Create New Copy Version
// ----------------------------------------------------------------------
router.post(['/copy-skus/:skuId/versions', '/:skuId/versions'], async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const userId = toValidUuid(req.user?.id);
    const skuId = String(req.params.skuId);
    const {
      parentVersionId,
      productDnaVersionId,
      assetVersionId,
      contentJson,
      sourceType = 'manual_edit',
      generationProvider = 'google',
      generationModel = 'gemini-2.5-flash',
      promptSnapshot = ''
    } = req.body || {};

    // 1. Verify SKU exists
    let sku: any = null;
    let existingVersions: any[] = [];

    try {
      const { data: skuData } = await supabaseAdmin
        .from('copy_skus')
        .select('*')
        .or(`id.eq.${skuId},sku_code.eq.${skuId}`)
        .maybeSingle();

      if (skuData) {
        sku = skuData;
        const { data: verList } = await supabaseAdmin
          .from('copy_versions')
          .select('*')
          .eq('copy_sku_id', sku.id)
          .order('version_number', { ascending: true });
        existingVersions = verList || [];
      }
    } catch (e) {}

    if (!sku) {
      sku = inMemoryCopySkus.get(skuId);
      if (!sku) {
        for (const item of inMemoryCopySkus.values()) {
          if (item.sku_code === skuId) {
            sku = item;
            break;
          }
        }
      }
      if (sku) {
        existingVersions = inMemoryCopyVersions.get(sku.id) || [];
      }
    }

    if (!sku) {
      throw new AppError(`Copy SKU '${skuId}' not found`, 404);
    }

    // 2. Validate Copy JSON Schema
    const { valid, sanitized, errorMsg } = validateAndSanitizeCopyContent(contentJson);
    if (!valid) {
      throw new AppError(errorMsg || 'Invalid Copy JSON schema', 400);
    }

    // Compute 64-char SHA-256 contentHash
    const contentHash = computeCopyContentHash(sanitized);

    // Execute with concurrency lock per copySkuId
    return await withSkuLock(sku.id, async () => {
      // Re-fetch versions to get accurate version sequence under lock
      let verList: any[] = inMemoryCopyVersions.get(sku.id) || [];
      try {
        const { data: latestVerList } = await supabaseAdmin
          .from('copy_versions')
          .select('*')
          .eq('copy_sku_id', sku.id)
          .order('version_number', { ascending: true });
        if (latestVerList && latestVerList.length > 0) verList = latestVerList;
      } catch (e) {}

      const nextNumber = verList.length > 0
        ? Math.max(...verList.map(v => v.version_number || 0)) + 1
        : 1;
      const versionCode = `COPY-V${String(nextNumber).padStart(3, '0')}`;

      let validParentId: string | null = null;
      if (nextNumber === 1) {
        validParentId = null;
      } else {
        if (!parentVersionId) {
          validParentId = sku.current_version_id || verList[verList.length - 1]?.id || null;
        } else {
          const parentMatch = verList.find(v => v.id === parentVersionId);
          if (!parentMatch) {
            throw new AppError(`parentVersionId '${parentVersionId}' not found in SKU '${sku.sku_code}'`, 400);
          }
          validParentId = parentVersionId;
        }
      }

      const versionId = `ver_copy_${sku.sku_code}_${versionCode}_${Date.now()}`;
      const newVersion = {
        id: versionId,
        copy_sku_id: sku.id,
        version_number: nextNumber,
        version_code: versionCode,
        parent_version_id: validParentId,
        source_type: sourceType,
        product_dna_version_id: productDnaVersionId || null,
        asset_version_id: assetVersionId || null,
        content_json: sanitized,
        content_hash: contentHash,
        generation_provider: generationProvider,
        generation_model: generationModel,
        prompt_snapshot: promptSnapshot || '',
        status: 'active',
        created_by: userId,
        created_at: new Date().toISOString()
      };

      let savedToDb = false;
      try {
        const { data, error } = await supabaseAdmin
          .from('copy_versions')
          .insert(newVersion)
          .select()
          .single();

        if (!error && data) {
          savedToDb = true;
          await supabaseAdmin
            .from('copy_skus')
            .update({ current_version_id: versionId, updated_at: new Date().toISOString() })
            .eq('id', sku.id);
        }
      } catch (dbErr: any) {
        console.warn('[CopyVersions:DB] Exception inserting Copy Version in DB:', dbErr?.message);
      }

      // Sync in-memory & disk
      const updatedVerList = [...verList.filter(v => v.id !== versionId), newVersion];
      inMemoryCopyVersions.set(sku.id, updatedVerList);
      sku.current_version_id = versionId;
      sku.updated_at = new Date().toISOString();
      inMemoryCopySkus.set(sku.id, sku);
      persistCopyStoreToDisk(sku, updatedVerList);

      return res.status(201).json({
        success: true,
        version: newVersion,
        copySku: {
          ...sku,
          current_version_id: versionId
        },
        storageMedium: savedToDb ? 'supabase_db' : 'in_memory'
      });
    });
  } catch (err) {
    next(err);
  }
});

// ----------------------------------------------------------------------
// 5. POST /api/copy-skus/:skuId/select-version - Select Current Active Version
// ----------------------------------------------------------------------
router.post(['/copy-skus/:skuId/select-version', '/:skuId/select-version'], async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const skuId = String(req.params.skuId);
    const { versionId } = req.body || {};

    if (!versionId) {
      throw new AppError('versionId is required', 400);
    }

    let sku: any = null;
    let version: any = null;

    try {
      const { data: skuData } = await supabaseAdmin
        .from('copy_skus')
        .select('*')
        .or(`id.eq.${skuId},sku_code.eq.${skuId}`)
        .maybeSingle();

      if (skuData) {
        sku = skuData;
        const { data: verData } = await supabaseAdmin
          .from('copy_versions')
          .select('*')
          .eq('id', versionId)
          .maybeSingle();
        if (verData) version = verData;
      }
    } catch (e) {}

    if (!sku) {
      sku = inMemoryCopySkus.get(skuId);
      if (!sku) {
        for (const item of inMemoryCopySkus.values()) {
          if (item.sku_code === skuId) {
            sku = item;
            break;
          }
        }
      }
    }

    if (!sku) {
      throw new AppError(`Copy SKU '${skuId}' not found`, 404);
    }

    if (!version) {
      for (const verList of inMemoryCopyVersions.values()) {
        const found = verList.find(v => v.id === versionId);
        if (found) {
          version = found;
          break;
        }
      }
    }

    if (!version) {
      throw new AppError(`Copy Version '${versionId}' not found`, 404);
    }

    if (version.copy_sku_id !== sku.id) {
      throw new AppError(`Copy Version '${versionId}' does not belong to Copy SKU '${sku.sku_code}'`, 400);
    }

    sku.current_version_id = versionId;
    sku.updated_at = new Date().toISOString();

    try {
      await supabaseAdmin
        .from('copy_skus')
        .update({ current_version_id: versionId, updated_at: sku.updated_at })
        .eq('id', sku.id);
    } catch (e) {}

    inMemoryCopySkus.set(sku.id, sku);
    const verList = inMemoryCopyVersions.get(sku.id) || [];
    persistCopyStoreToDisk(sku, verList);

    return res.json({
      success: true,
      copySku: sku,
      activeVersion: version
    });
  } catch (err) {
    next(err);
  }
});

// ----------------------------------------------------------------------
// 6. GET /api/copy-versions/:versionId - Get Specific Copy Version Details
// ----------------------------------------------------------------------
router.get('/copy-versions/:versionId', async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const { versionId } = req.params;

    let version: any = null;

    try {
      const { data } = await supabaseAdmin
        .from('copy_versions')
        .select('*')
        .eq('id', versionId)
        .maybeSingle();
      if (data) version = data;
    } catch (e) {}

    if (!version) {
      for (const verList of inMemoryCopyVersions.values()) {
        const found = verList.find(v => v.id === versionId);
        if (found) {
          version = found;
          break;
        }
      }
    }

    if (!version) {
      throw new AppError(`Copy Version '${versionId}' not found`, 404);
    }

    return res.json({
      success: true,
      version
    });
  } catch (err) {
    next(err);
  }
});

// ----------------------------------------------------------------------
// 7. POST /api/copy/generate - AI Copy Generation Gateway
// ----------------------------------------------------------------------
router.post(['/copy/generate', '/generate'], async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const userId = toValidUuid(req.user?.id);
    const {
      projectId,
      canvasId,
      sceneKey,
      sceneTitle = '',
      coreSellingPoint = '',
      visualComposition = '',
      productDnaVersionId,
      assetVersionId,
      customPrompt = '',
      model = 'gemini-2.5-flash'
    } = req.body || {};

    if (!projectId || !canvasId || !sceneKey) {
      throw new AppError('projectId, canvasId, and sceneKey are required', 400);
    }

    const normSceneKey = normalizeSceneKey(sceneKey);

    // 1. Fetch DNA Snapshot if available
    let dnaContextStr = '';
    if (productDnaVersionId) {
      for (const verList of inMemoryDnaVersions.values()) {
        const found = verList.find(v => v.id === productDnaVersionId);
        if (found?.dna_snapshot) {
          const s = found.dna_snapshot;
          dnaContextStr = `
产品名称: ${s.identity?.productName || '敏华家居产品'}
品类: ${s.identity?.productCategory || '家居/家具'}
主要卖点/材质: ${(s.appearance?.materials || []).join(', ')}
独特结构: ${(s.structure?.functionalParts || []).join(', ')}
必须保留特征: ${(s.mustPreserve || []).join(', ')}
`;
          break;
        }
      }
    }

    if (!dnaContextStr) {
      dnaContextStr = `
产品名称: 敏华真皮沙发
品类: 家具/客厅沙发
主要卖点/材质: 头层牛皮, 8档电动调节, 隐形杯架, 双缝线高弹海绵
`;
    }

    // 2. Build Gemini AI System Prompt requesting strict JSON Schema
    const systemPrompt = `你是一位顶级电商视觉企划文案专家。请针对以下场景需求，生成符合结构化规范的电商高转化营销文案。

【产品 DNA 上下文】:
${dnaContextStr}

【当前场景信息】:
场景编号: ${normSceneKey}
场景标题: ${sceneTitle || '分镜爆款展示'}
核心卖点: ${coreSellingPoint || '品质舒适体验与高级质感'}
视觉构图: ${visualComposition || '特写与空间氛围展现'}
用户额外指令: ${customPrompt || '无'}

【严格输出要求】:
必须返回且仅返回一个合法的 JSON 对象，格式如下，禁止包含任何 markdown 块标记外的文字：
{
  "eyebrow": "眉题/系列标识 (如: MANWAH LUXURY SERIES)",
  "headline": "主标题/核心爆款卖点 (如: 头层真皮包裹 · 尊享云端坐感)",
  "subheadline": "副标题/补充利益点 (如: 110°-160°无级电动调节，沉浸式放松体验)",
  "body": "场景化正文文案 (100-200字，描述用户痛点、场景故事与产品带来的极致解决方案)",
  "sellingPoints": ["核心卖点1", "核心卖点2", "核心卖点3"],
  "featureLabels": ["标签1", "标签2"],
  "specs": [
    { "label": "规格项1", "value": "数值1" },
    { "label": "规格项2", "value": "数值2" }
  ],
  "cta": "行动号召按钮文案 (如: 立即锁定首发优惠)",
  "disclaimer": "免责声明 / 实验数据说明 (如: *数据来源于敏华实验室研发测试)"
}

【禁令】:
1. 绝对不要包含字体、字号、颜色、坐标、宽度、高度等排版样式属性（layout attributes）。
2. 不得虚构未提到的认证或专利。
3. 必须包含且仅包含上面提到的 9 个 JSON 字段。`;

    let generatedJson: any = null;
    let generationProvider = 'fallback_engine';
    const { ai, config: aiConfig, isValidKey } = await createServerGenAI(userId);

    if (ai && isValidKey) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: [{ role: 'user', parts: [{ text: systemPrompt }] }],
          config: {
            responseMimeType: 'application/json',
            temperature: 0.7
          }
        });

        if (response.text) {
          const cleanText = response.text.replace(/```json/gi, '').replace(/```/g, '').trim();
          generatedJson = JSON.parse(cleanText);
          generationProvider = aiConfig.provider || 'configured_provider';
        }
      } catch (providerErr: any) {
        console.warn('[CopyGenerate] Provider request failed:', providerErr?.message);
      }
    }

    // Fallback template generator if provider call fails or no department/global provider is configured
    if (!generatedJson) {
      generatedJson = {
        eyebrow: `MINHUA · ${normSceneKey.toUpperCase()}`,
        headline: sceneTitle ? `${sceneTitle} · 质感与舒适兼备` : '奢华质感 · 尊享云端包裹感',
        subheadline: coreSellingPoint ? `${coreSellingPoint}，全方位提升生活品质` : '精选头层牛皮，静音电动无级调节',
        body: `在忙碌的工作之余，回归温馨家园。${sceneTitle || '本款设计'}融合了现代美学与人体工学，采用甄选头层牛皮触感细腻柔软，配合8档静音无级电动调节，为您带来如置身云端般的沉浸放松体验。`,
        sellingPoints: [
          coreSellingPoint || '甄选头层牛皮触感',
          '人体工学8档电动调节',
          '高回弹多层海绵承托'
        ],
        featureLabels: ['意大利设计', '环保认证', '整机质保'],
        specs: [
          { label: '坐垫材质', value: '头层真皮 + 35D高回弹海绵' },
          { label: '调节角度', value: '110° - 160° 无级电动' },
          { label: '框架材质', value: '落叶松实木 + 宝钢锰钢支架' }
        ],
        cta: '立即开启奢享体验',
        disclaimer: '*产品尺寸及皮革材质说明见包装说明书，数据来源敏华实验室。'
      };
    }

    // 3. Sanitize returned content
    const { valid, sanitized, errorMsg } = validateAndSanitizeCopyContent(generatedJson);
    if (!valid) {
      throw new AppError(errorMsg || 'Generated copy JSON failed schema validation', 500);
    }

    // Compute 64-char SHA-256 contentHash
    const contentHash = computeCopyContentHash(sanitized);

    // 4. Find or Create Copy SKU for this scene
    const skuCode = `COPY-SKU-${normSceneKey.toUpperCase().replace(/[^A-Z0-9]/g, '')}-${Date.now().toString(36).toUpperCase()}`;
    const skuId = `sku_copy_${normSceneKey}_${Date.now()}`;

    let existingSku: any = null;
    try {
      const { data } = await supabaseAdmin
        .from('copy_skus')
        .select('*')
        .eq('project_id', projectId)
        .eq('canvas_id', canvasId)
        .eq('scene_key', normSceneKey)
        .maybeSingle();
      if (data) existingSku = data;
    } catch (e) {}

    if (!existingSku) {
      for (const item of inMemoryCopySkus.values()) {
        if (item.project_id === projectId && item.canvas_id === canvasId && item.scene_key === normSceneKey) {
          existingSku = item;
          break;
        }
      }
    }

    let targetSku = existingSku;

    if (!targetSku) {
      targetSku = {
        id: skuId,
        user_id: userId,
        project_id: projectId,
        canvas_id: canvasId,
        scene_key: normSceneKey,
        sku_code: skuCode,
        name: `场景文案 (${normSceneKey})`,
        status: 'active',
        current_version_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      try {
        await supabaseAdmin.from('copy_skus').insert(targetSku);
      } catch (e) {}
      inMemoryCopySkus.set(targetSku.id, targetSku);
    }

    // Execute version creation under per-SKU concurrency lock
    return await withSkuLock(targetSku.id, async () => {
      // 5. Calculate Version Number & Code
      let existingVersions: any[] = inMemoryCopyVersions.get(targetSku.id) || [];
      try {
        const { data: verList } = await supabaseAdmin
          .from('copy_versions')
          .select('*')
          .eq('copy_sku_id', targetSku.id)
          .order('version_number', { ascending: true });
        if (verList && verList.length > 0) existingVersions = verList;
      } catch (e) {}

      const nextNumber = existingVersions.length > 0
        ? Math.max(...existingVersions.map(v => v.version_number || 0)) + 1
        : 1;

      const versionCode = `COPY-V${String(nextNumber).padStart(3, '0')}`;
      const parentVersionId = nextNumber === 1 ? null : (targetSku.current_version_id || existingVersions[existingVersions.length - 1]?.id || null);

      const versionId = `ver_copy_${targetSku.sku_code}_${versionCode}_${Date.now()}`;
      const newVersion = {
        id: versionId,
        copy_sku_id: targetSku.id,
        version_number: nextNumber,
        version_code: versionCode,
        parent_version_id: parentVersionId,
        source_type: 'ai_generated',
        product_dna_version_id: productDnaVersionId || null,
        asset_version_id: assetVersionId || null,
        content_json: sanitized,
        content_hash: contentHash,
        generation_provider: generationProvider,
        generation_model: model,
        prompt_snapshot: systemPrompt,
        status: 'active',
        created_by: userId,
        created_at: new Date().toISOString()
      };

      // Insert Version into DB
      try {
        const { error: insErr } = await supabaseAdmin.from('copy_versions').insert(newVersion);
        if (insErr) {
          console.warn('[CopyGenerate:DB] Version insert error:', insErr.message);
        }
        await supabaseAdmin
          .from('copy_skus')
          .update({ current_version_id: versionId, updated_at: new Date().toISOString() })
          .eq('id', targetSku.id);
      } catch (dbErr: any) {
        console.warn('[CopyGenerate:DB] Exception inserting version:', dbErr?.message);
      }

      // Sync in-memory & disk
      const updatedVerList = [...existingVersions.filter(v => v.id !== versionId), newVersion];
      inMemoryCopyVersions.set(targetSku.id, updatedVerList);
      targetSku.current_version_id = versionId;
      targetSku.updated_at = new Date().toISOString();
      inMemoryCopySkus.set(targetSku.id, targetSku);
      persistCopyStoreToDisk(targetSku, updatedVerList);

      return res.status(201).json({
        success: true,
        copySku: targetSku,
        currentVersion: newVersion
      });
    });
  } catch (err) {
    next(err);
  }
});

// ----------------------------------------------------------------------
// 8. Canvas Scene Copy Alias Endpoints
// ----------------------------------------------------------------------
router.get(['/canvases/:canvasId/scenes/:sceneId/copy', '/:canvasId/scenes/:sceneId/copy'], async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const canvasId = String(req.params.canvasId || '');
    const sceneId = String(req.params.sceneId || '');
    const normSceneKey = normalizeSceneKey(sceneId);

    let sku: any = null;
    let versions: any[] = [];

    try {
      const { data } = await supabaseAdmin
        .from('copy_skus')
        .select('*')
        .eq('canvas_id', canvasId)
        .eq('scene_key', normSceneKey)
        .maybeSingle();

      if (data) {
        sku = data;
        const { data: verList } = await supabaseAdmin
          .from('copy_versions')
          .select('*')
          .eq('copy_sku_id', sku.id)
          .order('version_number', { ascending: true });
        versions = verList || [];
      }
    } catch (e) {}

    if (!sku) {
      for (const item of inMemoryCopySkus.values()) {
        if (item.canvas_id === canvasId && item.scene_key === normSceneKey) {
          sku = item;
          versions = inMemoryCopyVersions.get(sku.id) || [];
          break;
        }
      }
    }

    if (!sku) {
      return res.status(200).json({
        success: true,
        copySku: null,
        currentVersion: null,
        versionCount: 0
      });
    }

    const currentVersion = versions.find(v => v.id === sku.current_version_id) || versions[versions.length - 1] || null;

    return res.json({
      success: true,
      copySku: sku,
      currentVersion,
      versionCount: versions.length
    });
  } catch (err) {
    next(err);
  }
});

// ----------------------------------------------------------------------
// 9. Immutability Guard: Reject PUT/PATCH/DELETE on Copy Versions
// ----------------------------------------------------------------------
const rejectImmutableCopy = async (req: AuthenticatedRequest, res: Response) => {
  const { versionId } = req.params;
  let exists = false;

  try {
    const { data } = await supabaseAdmin
      .from('copy_versions')
      .select('id')
      .eq('id', versionId)
      .maybeSingle();
    if (data) exists = true;
  } catch (e) {}

  if (!exists) {
    for (const verList of inMemoryCopyVersions.values()) {
      if (verList.some(v => v.id === versionId)) {
        exists = true;
        break;
      }
    }
  }

  if (!exists) {
    return res.status(404).json({
      success: false,
      error: { message: `Copy Version '${versionId}' not found`, code: 'NOT_FOUND' }
    });
  }

  return res.status(403).json({
    success: false,
    error: {
      message: 'Copy Versions are strictly immutable and cannot be modified or overwritten in place. Create a new version (e.g. COPY-V002) instead.',
      code: 'IMMUTABLE_COPY_VERSION'
    }
  });
};

router.put('/copy-versions/:versionId', rejectImmutableCopy as any);
router.patch('/copy-versions/:versionId', rejectImmutableCopy as any);
router.delete('/copy-versions/:versionId', rejectImmutableCopy as any);

// ==============================================================================
// 10. C4B-3: Typography Spec API Routes & Persistence Layer
// ==============================================================================

const TYPOGRAPHY_DIR = path.join(process.cwd(), '.data', 'typography_specs');

function ensureTypographyDir() {
  try {
    if (!fs.existsSync(TYPOGRAPHY_DIR)) {
      fs.mkdirSync(TYPOGRAPHY_DIR, { recursive: true });
    }
  } catch (e) {}
}

export const inMemoryTypographySpecs = new Map<string, any>();

function persistTypographySpecToDisk(spec: any) {
  ensureTypographyDir();
  try {
    const key = `${spec.project_id}_${spec.canvas_id}_${spec.scene_key}`;
    const filePath = path.join(TYPOGRAPHY_DIR, `${key}.json`);
    fs.writeFileSync(filePath, JSON.stringify(spec), 'utf-8');
  } catch (e) {}
}

function loadTypographySpecsFromDisk() {
  ensureTypographyDir();
  try {
    const files = fs.readdirSync(TYPOGRAPHY_DIR);
    for (const file of files) {
      if (file.endsWith('.json')) {
        const raw = fs.readFileSync(path.join(TYPOGRAPHY_DIR, file), 'utf-8');
        const spec = JSON.parse(raw);
        if (spec?.id) {
          const comboKey = `${spec.project_id}:${spec.canvas_id}:${spec.scene_key}`;
          inMemoryTypographySpecs.set(comboKey, spec);
          inMemoryTypographySpecs.set(spec.id, spec);
        }
      }
    }
  } catch (e) {}
}

loadTypographySpecsFromDisk();

export function createDefaultTypographySlots(contentJson: any): any[] {
  const c = contentJson || {};
  const slots: any[] = [
    {
      slotKey: 'headline',
      semanticRole: 'headline',
      sourceField: 'headline',
      content: typeof c.headline === 'string' ? c.headline : '',
      enabled: true,
      priority: 1,
      maxCharacters: 24,
      maxLines: 2,
      overflowPolicy: 'manual_review'
    },
    {
      slotKey: 'subheadline',
      semanticRole: 'subheadline',
      sourceField: 'subheadline',
      content: typeof c.subheadline === 'string' ? c.subheadline : '',
      enabled: true,
      priority: 2,
      maxCharacters: 40,
      maxLines: 2,
      overflowPolicy: 'shrink'
    },
    {
      slotKey: 'eyebrow',
      semanticRole: 'eyebrow',
      sourceField: 'eyebrow',
      content: typeof c.eyebrow === 'string' ? c.eyebrow : '',
      enabled: true,
      priority: 3,
      maxCharacters: 30,
      maxLines: 1,
      overflowPolicy: 'truncate'
    },
    {
      slotKey: 'body',
      semanticRole: 'body',
      sourceField: 'body',
      content: typeof c.body === 'string' ? c.body : '',
      enabled: true,
      priority: 4,
      maxCharacters: 150,
      maxLines: 5,
      overflowPolicy: 'shrink'
    }
  ];

  const sellingPoints = Array.isArray(c.sellingPoints) ? c.sellingPoints : [];
  sellingPoints.forEach((sp: string, idx: number) => {
    slots.push({
      slotKey: `selling_point_${idx}`,
      semanticRole: 'selling_point',
      sourceField: `sellingPoints[${idx}]`,
      content: String(sp || ''),
      enabled: true,
      priority: 5 + idx,
      maxCharacters: 30,
      maxLines: 1,
      overflowPolicy: 'hide_low_priority'
    });
  });

  const featureLabels = Array.isArray(c.featureLabels) ? c.featureLabels : [];
  featureLabels.forEach((fl: string, idx: number) => {
    slots.push({
      slotKey: `feature_label_${idx}`,
      semanticRole: 'feature_label',
      sourceField: `featureLabels[${idx}]`,
      content: String(fl || ''),
      enabled: true,
      priority: 10 + idx,
      maxCharacters: 15,
      maxLines: 1,
      overflowPolicy: 'truncate'
    });
  });

  const specs = Array.isArray(c.specs) ? c.specs : [];
  specs.forEach((sp: any, idx: number) => {
    const str = `${sp?.label || ''}: ${sp?.value || ''}`;
    slots.push({
      slotKey: `spec_${idx}`,
      semanticRole: 'spec',
      sourceField: `specs[${idx}]`,
      content: str,
      enabled: true,
      priority: 15 + idx,
      maxCharacters: 40,
      maxLines: 1,
      overflowPolicy: 'truncate'
    });
  });

  slots.push({
    slotKey: 'cta',
    semanticRole: 'cta',
    sourceField: 'cta',
    content: typeof c.cta === 'string' ? c.cta : '',
    enabled: true,
    priority: 20,
    maxCharacters: 20,
    maxLines: 1,
    overflowPolicy: 'truncate'
  });

  slots.push({
    slotKey: 'disclaimer',
    semanticRole: 'disclaimer',
    sourceField: 'disclaimer',
    content: typeof c.disclaimer === 'string' ? c.disclaimer : '',
    enabled: true,
    priority: 21,
    maxCharacters: 80,
    maxLines: 2,
    overflowPolicy: 'shrink'
  });

  return slots;
}

export function validateTypographySlots(slots: any[]): { status: 'valid' | 'overflow_warning' | 'manual_review'; processedSlots: any[]; warnings: string[] } {
  const warnings: string[] = [];
  let status: 'valid' | 'overflow_warning' | 'manual_review' = 'valid';

  if (!Array.isArray(slots)) {
    return { status: 'valid', processedSlots: [], warnings: [] };
  }

  const processedSlots = slots.map(slot => {
    const contentStr = typeof slot.content === 'string' ? slot.content : String(slot.content || '');
    const len = contentStr.length;
    const maxChar = Number(slot.maxCharacters) || 50;
    const isOverflow = slot.enabled && len > maxChar;

    let finalContent = contentStr;
    let slotEnabled = slot.enabled;

    if (isOverflow) {
      warnings.push(`Slot '${slot.slotKey}' (${slot.semanticRole}) exceeds max character limit (${len}/${maxChar})`);

      if (slot.overflowPolicy === 'manual_review') {
        status = 'manual_review';
      } else if (slot.overflowPolicy === 'truncate') {
        finalContent = contentStr.substring(0, maxChar);
        if (status !== 'manual_review') status = 'overflow_warning';
      } else if (slot.overflowPolicy === 'shrink') {
        if (status !== 'manual_review') status = 'overflow_warning';
      } else if (slot.overflowPolicy === 'hide_low_priority') {
        if (slot.priority > 3) {
          slotEnabled = false;
          warnings.push(`Slot '${slot.slotKey}' disabled automatically by low-priority overflow policy`);
        }
        if (status !== 'manual_review') status = 'overflow_warning';
      }
    }

    return {
      ...slot,
      content: finalContent,
      enabled: slotEnabled
    };
  });

  return { status, processedSlots, warnings };
}

// GET /api/typography-specs or /api/canvases/:canvasId/scenes/:sceneKey/typography-spec
router.get(['/typography-specs', '/canvases/:canvasId/scenes/:sceneKey/typography-spec'], async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const canvasId = String(req.params.canvasId || req.query.canvasId || '');
    const sceneKey = String(req.params.sceneKey || req.query.sceneKey || '');
    const projectId = String(req.query.projectId || '');

    if (!canvasId || !sceneKey) {
      throw new AppError('canvasId and sceneKey are required', 400);
    }

    const normSceneKey = normalizeSceneKey(sceneKey);

    let spec: any = null;

    try {
      const query = supabaseAdmin
        .from('typography_specs')
        .select('*')
        .eq('canvas_id', canvasId)
        .eq('scene_key', normSceneKey);

      if (projectId) query.eq('project_id', projectId);

      const { data } = await query.maybeSingle();
      if (data) spec = data;
    } catch (e) {}

    if (!spec) {
      const comboKey = `${projectId}:${canvasId}:${normSceneKey}`;
      spec = inMemoryTypographySpecs.get(comboKey);

      if (!spec) {
        for (const item of inMemoryTypographySpecs.values()) {
          if (item.canvas_id === canvasId && item.scene_key === normSceneKey) {
            if (!projectId || item.project_id === projectId) {
              spec = item;
              break;
            }
          }
        }
      }
    }

    return res.json({
      success: true,
      spec: spec || null
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/typography-specs - Create or Save Typography Spec
router.post('/typography-specs', async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const userId = toValidUuid(req.user?.id);
    const {
      projectId,
      canvasId,
      sceneKey,
      copySkuId,
      copyVersionId,
      productDnaVersionId,
      assetVersionId,
      slots
    } = req.body || {};

    if (!projectId || !canvasId || !sceneKey) {
      throw new AppError('projectId, canvasId, and sceneKey are required', 400);
    }

    if (!copySkuId || !copyVersionId) {
      throw new AppError('copySkuId and copyVersionId are required to build a Typography Spec', 400);
    }

    // Strict validation: Copy Version MUST exist and belong to copySkuId
    let copyVer: any = null;
    try {
      const { data } = await supabaseAdmin
        .from('copy_versions')
        .select('*')
        .eq('id', copyVersionId)
        .maybeSingle();
      if (data) copyVer = data;
    } catch (e) {}

    if (!copyVer) {
      for (const verList of inMemoryCopyVersions.values()) {
        const found = verList.find(v => v.id === copyVersionId);
        if (found) {
          copyVer = found;
          break;
        }
      }
    }

    if (!copyVer) {
      throw new AppError(`Copy Version '${copyVersionId}' not found`, 404, 'NOT_FOUND');
    }

    if (copyVer.copy_sku_id !== copySkuId) {
      throw new AppError(`Copy Version '${copyVersionId}' does not belong to Copy SKU '${copySkuId}'`, 400, 'BAD_REQUEST');
    }

    const normSceneKey = normalizeSceneKey(sceneKey);
    const { status, processedSlots, warnings } = validateTypographySlots(slots || []);

    const specId = `spec_typography_${normSceneKey}_${Date.now()}`;
    const newSpec = {
      id: specId,
      user_id: userId,
      project_id: projectId,
      canvas_id: canvasId,
      scene_key: normSceneKey,
      copy_sku_id: copySkuId,
      copy_version_id: copyVersionId,
      product_dna_version_id: productDnaVersionId || copyVer.product_dna_version_id || null,
      asset_version_id: assetVersionId || copyVer.asset_version_id || null,
      slots: processedSlots,
      status,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    let savedToDb = false;
    try {
      // Upsert into Supabase typography_specs table
      const { data, error } = await supabaseAdmin
        .from('typography_specs')
        .upsert(newSpec, { onConflict: 'canvas_id,scene_key' })
        .select()
        .single();

      if (!error && data) {
        savedToDb = true;
      }
    } catch (dbErr: any) {
      console.warn('[TypographySpecs:DB] Exception upserting Typography Spec:', dbErr?.message);
    }

    const comboKey = `${projectId}:${canvasId}:${normSceneKey}`;
    inMemoryTypographySpecs.set(comboKey, newSpec);
    inMemoryTypographySpecs.set(specId, newSpec);
    persistTypographySpecToDisk(newSpec);

    return res.status(201).json({
      success: true,
      spec: newSpec,
      warnings,
      storageMedium: savedToDb ? 'supabase_db' : 'in_memory'
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/typography-specs/default-from-copy - Create default Typography Spec from Copy Version
router.post('/typography-specs/default-from-copy', async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const userId = toValidUuid(req.user?.id);
    const {
      projectId,
      canvasId,
      sceneKey,
      copySkuId,
      copyVersionId,
      productDnaVersionId,
      assetVersionId
    } = req.body || {};

    if (!projectId || !canvasId || !sceneKey) {
      throw new AppError('projectId, canvasId, and sceneKey are required', 400);
    }

    if (!copySkuId || !copyVersionId) {
      throw new AppError('copySkuId and copyVersionId are required', 400);
    }

    // Fetch copy version content_json
    let copyVer: any = null;
    try {
      const { data } = await supabaseAdmin
        .from('copy_versions')
        .select('*')
        .eq('id', copyVersionId)
        .maybeSingle();
      if (data) copyVer = data;
    } catch (e) {}

    if (!copyVer) {
      for (const verList of inMemoryCopyVersions.values()) {
        const found = verList.find(v => v.id === copyVersionId);
        if (found) {
          copyVer = found;
          break;
        }
      }
    }

    if (!copyVer) {
      throw new AppError(`Copy Version '${copyVersionId}' not found`, 404, 'NOT_FOUND');
    }

    const normSceneKey = normalizeSceneKey(sceneKey);
    const defaultSlots = createDefaultTypographySlots(copyVer.content_json);
    const { status, processedSlots, warnings } = validateTypographySlots(defaultSlots);

    const specId = `spec_typography_${normSceneKey}_${Date.now()}`;
    const newSpec = {
      id: specId,
      user_id: userId,
      project_id: projectId,
      canvas_id: canvasId,
      scene_key: normSceneKey,
      copy_sku_id: copySkuId,
      copy_version_id: copyVersionId,
      product_dna_version_id: productDnaVersionId || copyVer.product_dna_version_id || null,
      asset_version_id: assetVersionId || copyVer.asset_version_id || null,
      slots: processedSlots,
      status,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    let savedToDb = false;
    try {
      const { data, error } = await supabaseAdmin
        .from('typography_specs')
        .upsert(newSpec, { onConflict: 'canvas_id,scene_key' })
        .select()
        .single();
      if (!error && data) savedToDb = true;
    } catch (e) {}

    const comboKey = `${projectId}:${canvasId}:${normSceneKey}`;
    inMemoryTypographySpecs.set(comboKey, newSpec);
    inMemoryTypographySpecs.set(specId, newSpec);
    persistTypographySpecToDisk(newSpec);

    return res.status(201).json({
      success: true,
      spec: newSpec,
      warnings,
      storageMedium: savedToDb ? 'supabase_db' : 'in_memory'
    });
  } catch (err) {
    next(err);
  }
});


export default router;

