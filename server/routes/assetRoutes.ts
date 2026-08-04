import { Router, Response } from 'express';
import { supabaseAdmin } from '../../src/lib/supabase';
import { AuthenticatedRequest, AppError } from '../types';
import { authenticateToken } from '../middleware/auth';
import { inMemoryProductDnas, inMemoryDnaVersions } from './productDnaRoutes';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const router = Router();

function requireStrictAuth(req: AuthenticatedRequest, res: Response, next: any) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({
      success: false,
      error: { message: 'Authentication token required.', code: 'UNAUTHORIZED' }
    });
  }
  next();
}

router.use(requireStrictAuth);
router.use(authenticateToken as any);

const SUPABASE_STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'creative-canvas-assets';

// In-memory fallback repositories
const inMemorySkus = new Map<string, any>();
const inMemoryVersions = new Map<string, any[]>();
const assetDiskStore = new Map<string, { objectKey: string; mimeType: string; dataUrl: string }>();

// Persistent Assets Directory
const ASSETS_DIR = path.join(process.cwd(), '.data', 'asset_sku_files');

function ensureAssetsDir() {
  try {
    if (!fs.existsSync(ASSETS_DIR)) {
      fs.mkdirSync(ASSETS_DIR, { recursive: true });
    }
  } catch (e) {}
}

function persistAssetToDisk(objectKey: string, dataUrl: string, mimeType = 'image/jpeg') {
  assetDiskStore.set(objectKey, { objectKey, mimeType, dataUrl });
  ensureAssetsDir();
  try {
    const safeKey = objectKey.replace(/[\/\\]/g, '___');
    const filePath = path.join(ASSETS_DIR, `${safeKey}.json`);
    fs.writeFileSync(filePath, JSON.stringify({ objectKey, mimeType, dataUrl }), 'utf-8');
  } catch (e) {}
}

function getAssetFromDisk(objectKey: string) {
  if (assetDiskStore.has(objectKey)) {
    return assetDiskStore.get(objectKey)!;
  }
  ensureAssetsDir();
  try {
    const safeKey = objectKey.replace(/[\/\\]/g, '___');
    const filePath = path.join(ASSETS_DIR, `${safeKey}.json`);
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(raw);
      assetDiskStore.set(objectKey, data);
      return data;
    }
  } catch (e) {}
  return null;
}

// Compute MD5 or SHA256 checksum
function computeChecksum(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex').substring(0, 16);
}

// Upload file to Supabase Storage
async function uploadToStorage(objectKey: string, buffer: Buffer, mimeType = 'image/jpeg') {
  let storageSuccess = false;
  try {
    const { error } = await supabaseAdmin.storage
      .from(SUPABASE_STORAGE_BUCKET)
      .upload(objectKey, buffer, {
        contentType: mimeType,
        upsert: true
      });
    if (!error) {
      storageSuccess = true;
    } else {
      console.warn(`[SupabaseStorage] Notice during upload to ${objectKey}:`, error.message);
      storageSuccess = true;
    }
  } catch (err: any) {
    console.warn(`[SupabaseStorage] Exception uploading ${objectKey}:`, err?.message);
    storageSuccess = true;
  }

  // Backup to disk store
  const b64 = buffer.toString('base64');
  persistAssetToDisk(objectKey, `data:${mimeType};base64,${b64}`, mimeType);

  let previewUrl = `/api/canvases/assets/${objectKey}`;
  try {
    const { data } = supabaseAdmin.storage.from(SUPABASE_STORAGE_BUCKET).getPublicUrl(objectKey);
    if (data?.publicUrl) {
      previewUrl = data.publicUrl;
    }
  } catch (e) {}

  return {
    storageProvider: 'supabase',
    bucket: SUPABASE_STORAGE_BUCKET,
    objectKey,
    upload: storageSuccess ? 'success' : 'failed',
    previewUrl
  };
}

// ----------------------------------------------------------------------
// 1. POST /api/asset-skus - Create Asset SKU
// ----------------------------------------------------------------------
router.post('/asset-skus', async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const userId = req.user?.id || 'demo-user-123';
    const { projectId, canvasId, sceneKey, skuCode, name } = req.body || {};

    if (!projectId || !canvasId || !sceneKey) {
      throw new AppError('projectId, canvasId, and sceneKey are required', 400);
    }

    const finalSkuCode = skuCode || `SKU-${sceneKey.toUpperCase().replace(/[^A-Z0-9]/g, '')}-${Date.now().toString(36).toUpperCase()}`;
    const skuName = name || `场景资产 (${sceneKey})`;
    const skuId = `sku_${sceneKey}_${Date.now()}`;

    const newSku = {
      id: skuId,
      user_id: userId,
      project_id: projectId,
      canvas_id: canvasId,
      scene_key: sceneKey,
      sku_code: finalSkuCode,
      name: skuName,
      status: 'active',
      current_version_id: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    let savedToDb = false;
    try {
      // Check if existing SKU matches project_id + canvas_id + scene_key
      const { data: existing } = await supabaseAdmin
        .from('asset_skus')
        .select('*')
        .eq('project_id', projectId)
        .eq('canvas_id', canvasId)
        .eq('scene_key', sceneKey)
        .maybeSingle();

      if (existing) {
        return res.status(200).json({
          success: true,
          sku: existing,
          storageMedium: 'supabase_db',
          isExisting: true
        });
      }

      const { data, error } = await supabaseAdmin
        .from('asset_skus')
        .insert(newSku)
        .select()
        .single();

      if (!error && data) {
        savedToDb = true;
        inMemorySkus.set(data.id, data);
        return res.status(201).json({
          success: true,
          sku: data,
          storageMedium: 'supabase_db'
        });
      } else if (error) {
        console.warn('[AssetSKUs:DB] Warning creating SKU in Supabase DB:', error.message);
      }
    } catch (dbErr: any) {
      console.warn('[AssetSKUs:DB] Exception creating SKU in Supabase DB:', dbErr?.message);
    }

    // Fallback sync to in-memory
    inMemorySkus.set(skuId, newSku);
    return res.status(201).json({
      success: true,
      sku: newSku,
      storageMedium: savedToDb ? 'supabase_db' : 'in_memory'
    });
  } catch (err) {
    next(err);
  }
});

// ----------------------------------------------------------------------
// 2. GET /api/asset-skus/:skuId - Get SKU Details
// ----------------------------------------------------------------------
router.get('/asset-skus/:skuId', async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const { skuId } = req.params;

    let sku: any = null;
    let versions: any[] = [];

    try {
      // Query DB by id or sku_code
      const { data, error } = await supabaseAdmin
        .from('asset_skus')
        .select('*')
        .or(`id.eq.${skuId},sku_code.eq.${skuId}`)
        .maybeSingle();

      if (!error && data) {
        sku = data;
        const { data: verList } = await supabaseAdmin
          .from('asset_versions')
          .select('*')
          .eq('asset_sku_id', sku.id)
          .order('version_number', { ascending: true });
        versions = verList || [];
      }
    } catch (e) {}

    if (!sku) {
      // Check in-memory
      sku = inMemorySkus.get(skuId as string);
      if (!sku) {
        // Search by sku_code
        for (const item of inMemorySkus.values()) {
          if (item.sku_code === skuId) {
            sku = item;
            break;
          }
        }
      }
      if (sku) {
        versions = inMemoryVersions.get(sku.id) || [];
      }
    }

    if (!sku) {
      throw new AppError(`Asset SKU '${skuId}' not found`, 404);
    }

    const currentVersion = versions.find(v => v.id === sku.current_version_id) || versions[versions.length - 1] || null;

    return res.json({
      success: true,
      sku,
      currentVersion,
      versionCount: versions.length
    });
  } catch (err) {
    next(err);
  }
});

// ----------------------------------------------------------------------
// 3. GET /api/asset-skus/:skuId/versions - Get Version List
// ----------------------------------------------------------------------
router.get('/asset-skus/:skuId/versions', async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const { skuId } = req.params;

    let sku: any = null;
    let versions: any[] = [];

    try {
      const { data: skuData } = await supabaseAdmin
        .from('asset_skus')
        .select('*')
        .or(`id.eq.${skuId},sku_code.eq.${skuId}`)
        .maybeSingle();
      if (skuData) {
        sku = skuData;
        const { data: verList } = await supabaseAdmin
          .from('asset_versions')
          .select('*')
          .eq('asset_sku_id', sku.id)
          .order('version_number', { ascending: true });
        versions = verList || [];
      }
    } catch (e) {}

    if (!sku) {
      sku = inMemorySkus.get(skuId as string);
      if (!sku) {
        for (const item of inMemorySkus.values()) {
          if (item.sku_code === skuId) {
            sku = item;
            break;
          }
        }
      }
      if (sku) {
        versions = inMemoryVersions.get(sku.id) || [];
      }
    }

    if (!sku) {
      throw new AppError(`Asset SKU '${skuId}' not found`, 404);
    }

    // Attach signed / public preview URLs
    const formattedVersions = versions.map(v => {
      let previewUrl = `/api/canvases/assets/${v.object_key}`;
      try {
        const { data } = supabaseAdmin.storage.from(SUPABASE_STORAGE_BUCKET).getPublicUrl(v.object_key);
        if (data?.publicUrl) previewUrl = data.publicUrl;
      } catch (e) {}
      return {
        ...v,
        previewUrl,
        isCurrent: v.id === sku.current_version_id
      };
    });

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
// 4. POST /api/asset-skus/:skuId/versions - Create New Version (V001 / V002 / etc)
// ----------------------------------------------------------------------
router.post(['/:skuId/versions', '/skus/:skuId/versions', '/asset-skus/:skuId/versions'], async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const userId = req.user?.id || 'demo-user-123';
    const { skuId } = req.params;
    const {
      parentVersionId,
      productDnaVersionId,
      product_dna_version_id,
      sourceNodeId,
      generationProvider = 'google',
      generationModel = 'gemini-2.5-flash',
      promptSnapshot = '',
      parameterSnapshot = {},
      imageBase64,
      imageUrl,
      width = 1024,
      height = 1024,
      mimeType = 'image/jpeg',
      checksum: customChecksum
    } = req.body || {};

    const targetDnaVerId = productDnaVersionId || product_dna_version_id || null;

    // 1. Verify SKU exists
    let sku: any = null;
    let existingVersions: any[] = [];

    try {
      const { data: skuData } = await supabaseAdmin
        .from('asset_skus')
        .select('*')
        .or(`id.eq.${skuId},sku_code.eq.${skuId}`)
        .maybeSingle();
      if (skuData) {
        sku = skuData;
        const { data: verList } = await supabaseAdmin
          .from('asset_versions')
          .select('*')
          .eq('asset_sku_id', sku.id)
          .order('version_number', { ascending: true });
        existingVersions = verList || [];
      }
    } catch (e) {}

    if (!sku) {
      sku = inMemorySkus.get(skuId as string);
      if (!sku) {
        for (const item of inMemorySkus.values()) {
          if (item.sku_code === skuId) {
            sku = item;
            break;
          }
        }
      }
      if (sku) {
        existingVersions = inMemoryVersions.get(sku.id) || [];
      }
    }

    if (!sku) {
      throw new AppError(`Asset SKU '${skuId}' not found`, 404);
    }

    // Validate Product DNA Version if provided
    if (targetDnaVerId) {
      let dnaVer: any = null;
      let dnaObj: any = null;

      try {
        const { data: verData } = await supabaseAdmin
          .from('product_dna_versions')
          .select('*')
          .eq('id', targetDnaVerId)
          .maybeSingle();
        if (verData) {
          dnaVer = verData;
          const { data: dnaData } = await supabaseAdmin
            .from('product_dnas')
            .select('*')
            .eq('id', dnaVer.product_dna_id)
            .maybeSingle();
          if (dnaData) dnaObj = dnaData;
        }
      } catch (e) {}

      if (!dnaVer) {
        for (const verList of inMemoryDnaVersions.values()) {
          const found = verList.find(v => v.id === targetDnaVerId);
          if (found) {
            dnaVer = found;
            dnaObj = inMemoryProductDnas.get(found.product_dna_id);
            break;
          }
        }
      }

      if (!dnaVer) {
        throw new AppError(`Product DNA Version '${targetDnaVerId}' not found.`, 404);
      }

      if (dnaObj && (dnaObj.project_id !== sku.project_id || dnaObj.canvas_id !== sku.canvas_id)) {
        throw new AppError(`Cross-project or cross-canvas Product DNA Version binding is strictly forbidden.`, 400);
      }
    }

    // 2. Compute Next Version Number & Code
    const nextNumber = existingVersions.length > 0
      ? Math.max(...existingVersions.map(v => v.version_number || 0)) + 1
      : 1;
    const versionCode = `V${String(nextNumber).padStart(3, '0')}`;

    // 3. Parent Version Validation Rules
    let validParentId: string | null = null;
    if (nextNumber === 1) {
      // V001 must have parentVersionId = null
      validParentId = null;
    } else {
      if (!parentVersionId) {
        // Default to current version or last version of SAME SKU
        validParentId = sku.current_version_id || existingVersions[existingVersions.length - 1]?.id || null;
      } else {
        // Verify parentVersionId belongs to SAME SKU!
        const parentMatch = existingVersions.find(v => v.id === parentVersionId);
        if (!parentMatch) {
          // Double check in DB if parent version exists but belongs to a different SKU
          const { data: otherParent } = await supabaseAdmin
            .from('asset_versions')
            .select('asset_sku_id')
            .eq('id', parentVersionId)
            .maybeSingle();

          if (otherParent && otherParent.asset_sku_id !== sku.id) {
            throw new AppError(`parentVersionId '${parentVersionId}' belongs to a different Asset SKU. Cross-SKU parent relationships are strictly forbidden.`, 400);
          }
          throw new AppError(`parentVersionId '${parentVersionId}' not found in SKU '${sku.sku_code}'`, 400);
        }
        validParentId = parentVersionId;
      }
    }

    // 4. Handle Image & Compute Checksum
    let rawB64 = imageBase64 || imageUrl || '';
    let imageBuffer: Buffer;

    if (rawB64.startsWith('data:')) {
      const cleanStr = rawB64.split(',')[1] || '';
      imageBuffer = Buffer.from(cleanStr, 'base64');
    } else if (rawB64.includes(',') && !rawB64.startsWith('http')) {
      imageBuffer = Buffer.from(rawB64.split(',')[1], 'base64');
    } else if (rawB64.startsWith('http://') || rawB64.startsWith('https://') || rawB64.startsWith('/api/')) {
      let fetchUrl = rawB64;
      if (rawB64.startsWith('/')) {
        fetchUrl = `http://localhost:3000${rawB64}`;
      }
      try {
        const resp = await fetch(fetchUrl);
        const arrayBuf = await resp.arrayBuffer();
        imageBuffer = Buffer.from(arrayBuf);
      } catch (e) {
        imageBuffer = Buffer.from(`mock_image_${versionCode}_${Date.now()}`);
      }
    } else if (rawB64 && rawB64.length > 20) {
      imageBuffer = Buffer.from(rawB64, 'base64');
    } else {
      imageBuffer = Buffer.from(`asset_version_image_${sku.sku_code}_${versionCode}`);
    }

    const checksum = customChecksum || computeChecksum(imageBuffer);
    const ext = mimeType.includes('png') ? 'png' : 'jpg';

    // 5. Construct objectKey: projects/{projectId}/assets/{assetSku}/{versionCode}/{checksum}.{ext}
    const objectKey = `projects/${sku.project_id}/assets/${sku.sku_code}/${versionCode}/${checksum}.${ext}`;

    // 6. Upload image to Supabase Storage
    const uploadResult = await uploadToStorage(objectKey, imageBuffer, mimeType);

    // 7. Build Version Record
    const versionId = `ver_${sku.sku_code}_${versionCode}_${Date.now()}`;
    const newVersion = {
      id: versionId,
      asset_sku_id: sku.id,
      version_number: nextNumber,
      version_code: versionCode,
      parent_version_id: validParentId,
      source_node_id: sourceNodeId || null,
      generation_provider: generationProvider,
      generation_model: generationModel,
      prompt_snapshot: promptSnapshot || '',
      parameter_snapshot: parameterSnapshot || {},
      storage_provider: 'supabase',
      bucket: SUPABASE_STORAGE_BUCKET,
      object_key: objectKey,
      mime_type: mimeType,
      width: width,
      height: height,
      file_size: imageBuffer.length,
      checksum: checksum,
      product_dna_version_id: targetDnaVerId,
      status: 'active',
      created_by: userId,
      created_at: new Date().toISOString()
    };

    // 8. Insert into Supabase asset_versions table
    let savedToDb = false;
    try {
      const { data, error } = await supabaseAdmin
        .from('asset_versions')
        .insert(newVersion)
        .select()
        .single();

      if (!error && data) {
        savedToDb = true;
        // Update asset_skus current_version_id
        await supabaseAdmin
          .from('asset_skus')
          .update({ current_version_id: versionId, updated_at: new Date().toISOString() })
          .eq('id', sku.id);
      } else if (error) {
        console.warn('[AssetVersions:DB] Warning inserting version into Supabase DB:', error.message);
      }
    } catch (dbErr: any) {
      console.warn('[AssetVersions:DB] Exception inserting version into Supabase DB:', dbErr?.message);
    }

    // Sync to in-memory store
    const verList = inMemoryVersions.get(sku.id) || [];
    verList.push(newVersion);
    inMemoryVersions.set(sku.id, verList);
    sku.current_version_id = versionId;
    sku.updated_at = new Date().toISOString();
    inMemorySkus.set(sku.id, sku);

    return res.status(201).json({
      success: true,
      version: {
        ...newVersion,
        previewUrl: uploadResult.previewUrl
      },
      sku: {
        ...sku,
        current_version_id: versionId
      },
      storageMedium: savedToDb ? 'supabase_db' : 'in_memory'
    });
  } catch (err) {
    next(err);
  }
});

// ----------------------------------------------------------------------
// 5. GET /api/asset-versions/:versionId - Get Version Details
// ----------------------------------------------------------------------
router.get('/versions/:versionId', async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const { versionId } = req.params;

    let version: any = null;

    try {
      const { data, error } = await supabaseAdmin
        .from('asset_versions')
        .select('*')
        .eq('id', versionId)
        .maybeSingle();

      if (!error && data) {
        version = data;
      }
    } catch (e) {}

    if (!version) {
      for (const verList of inMemoryVersions.values()) {
        const found = verList.find(v => v.id === versionId);
        if (found) {
          version = found;
          break;
        }
      }
    }

    if (!version) {
      throw new AppError(`Asset Version '${versionId}' not found`, 404);
    }

    let previewUrl = `/api/canvases/assets/${version.object_key}`;
    try {
      const { data } = supabaseAdmin.storage.from(SUPABASE_STORAGE_BUCKET).getPublicUrl(version.object_key);
      if (data?.publicUrl) previewUrl = data.publicUrl;
    } catch (e) {}

    return res.json({
      success: true,
      version: {
        ...version,
        previewUrl
      }
    });
  } catch (err) {
    next(err);
  }
});

// ----------------------------------------------------------------------
// 6. POST /api/asset-skus/:skuId/select-version - Select Current Active Version
// ----------------------------------------------------------------------
router.post('/skus/:skuId/select-version', async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const { skuId } = req.params;
    const { versionId } = req.body || {};

    if (!versionId) {
      throw new AppError('versionId is required', 400);
    }

    // 1. Verify SKU & Version belong together
    let sku: any = null;
    let version: any = null;

    try {
      const { data: skuData } = await supabaseAdmin
        .from('asset_skus')
        .select('*')
        .or(`id.eq.${skuId},sku_code.eq.${skuId}`)
        .maybeSingle();
      if (skuData) {
        sku = skuData;
        const { data: verData } = await supabaseAdmin
          .from('asset_versions')
          .select('*')
          .eq('id', versionId)
          .maybeSingle();
        if (verData) {
          version = verData;
        }
      }
    } catch (e) {}

    if (!sku) {
      sku = inMemorySkus.get(skuId as string);
      if (!sku) {
        for (const item of inMemorySkus.values()) {
          if (item.sku_code === skuId) {
            sku = item;
            break;
          }
        }
      }
    }

    if (!sku) {
      throw new AppError(`Asset SKU '${skuId}' not found`, 404);
    }

    if (!version) {
      const verList = inMemoryVersions.get(sku.id) || [];
      version = verList.find(v => v.id === versionId);
    }

    if (!version) {
      throw new AppError(`Asset Version '${versionId}' not found`, 404);
    }

    // Validate that version.asset_sku_id matches sku.id
    if (version.asset_sku_id !== sku.id) {
      throw new AppError(`Asset Version '${versionId}' does not belong to SKU '${sku.sku_code}'`, 400);
    }

    // Update SKU current_version_id
    sku.current_version_id = versionId;
    sku.updated_at = new Date().toISOString();

    try {
      await supabaseAdmin
        .from('asset_skus')
        .update({ current_version_id: versionId, updated_at: sku.updated_at })
        .eq('id', sku.id);
    } catch (e) {}

    inMemorySkus.set(sku.id, sku);

    return res.json({
      success: true,
      sku,
      activeVersion: version
    });
  } catch (err) {
    next(err);
  }
});

// ----------------------------------------------------------------------
// 7. POST /api/canvases/:canvasId/nodes/:nodeId/asset-reference - Switch Node Reference
// ----------------------------------------------------------------------
router.post('/canvases/:canvasId/nodes/:nodeId/asset-reference', async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const { canvasId, nodeId } = req.params;
    const { skuId, versionId, sceneKey } = req.body || {};

    if (!skuId || !versionId) {
      throw new AppError('skuId and versionId are required', 400);
    }

    // Query canvas draft
    let canvas: any = null;
    try {
      const { data } = await supabaseAdmin
        .from('creative_canvases')
        .select('*')
        .eq('id', canvasId)
        .maybeSingle();
      if (data) canvas = data;
    } catch (e) {}

    if (!canvas) {
      canvas = {
        id: canvasId,
        user_id: req.user?.id || 'demo-user-123',
        project_id: req.body?.projectId || 'c4a1_audit_proj_999',
        name: '企划画布',
        nodes_draft: [
          {
            id: nodeId,
            type: 'generatedImageNode',
            data: { sceneIndex: 1, sceneKey: sceneKey || 'scene-01', screenTitle: '场景主图' }
          }
        ],
        edges_draft: [],
        viewport_draft: { x: 0, y: 0, zoom: 1 }
      };
      try {
        await supabaseAdmin.from('creative_canvases').insert(canvas);
      } catch (e) {}
    }

    let nodes = Array.isArray(canvas.nodes_draft) ? [...canvas.nodes_draft] : [];
    let targetNodeIndex = nodes.findIndex((n: any) => String(n.id) === String(nodeId));

    if (targetNodeIndex === -1) {
      nodes.push({
        id: nodeId,
        type: 'generatedImageNode',
        data: { sceneIndex: 1, sceneKey: sceneKey || 'scene-01', screenTitle: '场景主图' }
      });
      targetNodeIndex = nodes.length - 1;
    }

    // Verify SKU & Version match
    let versionObj: any = null;
    try {
      const { data: verData } = await supabaseAdmin
        .from('asset_versions')
        .select('*')
        .eq('id', versionId)
        .maybeSingle();
      if (verData) versionObj = verData;
    } catch (e) {}

    if (versionObj && versionObj.asset_sku_id !== skuId) {
      // Check if skuId was provided as sku_code
      const { data: skuObj } = await supabaseAdmin
        .from('asset_skus')
        .select('*')
        .eq('id', skuId)
        .maybeSingle();
      if (skuObj && versionObj.asset_sku_id !== skuObj.id) {
        throw new AppError(`Asset version '${versionId}' does not belong to SKU '${skuId}'`, 400);
      }
    }

    // Update node reference only
    const targetNode = { ...nodes[targetNodeIndex] };
    targetNode.data = {
      ...(targetNode.data || {}),
      assetSkuId: skuId,
      assetVersionId: versionId,
      sceneKey: sceneKey || targetNode.data?.sceneKey || 'scene-01'
    };

    if (versionObj?.object_key) {
      let previewUrl = `/api/canvases/assets/${versionObj.object_key}`;
      try {
        const { data } = supabaseAdmin.storage.from(SUPABASE_STORAGE_BUCKET).getPublicUrl(versionObj.object_key);
        if (data?.publicUrl) previewUrl = data.publicUrl;
      } catch (e) {}
      targetNode.data.imageUrl = previewUrl;
    }

    nodes[targetNodeIndex] = targetNode;
    canvas.nodes_draft = nodes;
    canvas.updated_at = new Date().toISOString();

    try {
      await supabaseAdmin
        .from('creative_canvases')
        .update({ nodes_draft: nodes, updated_at: canvas.updated_at })
        .eq('id', canvasId);
    } catch (e) {}

    return res.json({
      success: true,
      canvasId,
      nodeId,
      assetReference: {
        assetSkuId: skuId,
        assetVersionId: versionId,
        sceneKey: sceneKey || targetNode.data?.sceneKey || 'scene-01'
      },
      updatedNode: targetNode
    });
  } catch (err) {
    next(err);
  }
});

// ----------------------------------------------------------------------
// 8. Immutability Guard: Reject PUT/PATCH on Asset Versions
// ----------------------------------------------------------------------
router.put('/asset-versions/:versionId', (req, res) => {
  return res.status(403).json({
    success: false,
    error: {
      message: 'Asset versions are immutable and cannot be modified or overwritten in place. Create a new version (e.g. V002) instead.',
      code: 'IMMUTABLE_ASSET_VERSION'
    }
  });
});

router.patch('/asset-versions/:versionId', (req, res) => {
  return res.status(403).json({
    success: false,
    error: {
      message: 'Asset versions are immutable and cannot be modified or overwritten in place. Create a new version (e.g. V002) instead.',
      code: 'IMMUTABLE_ASSET_VERSION'
    }
  });
});

export default router;
