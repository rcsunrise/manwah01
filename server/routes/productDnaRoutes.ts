import { Router, Response } from 'express';
import { supabaseAdmin } from '../../src/lib/supabase';
import { AuthenticatedRequest, AppError } from '../types';
import { optionalAuthenticateToken } from '../middleware/auth';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const router = Router();

router.use(optionalAuthenticateToken as any);

const SUPABASE_STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'creative-canvas-assets';

// Persistent Product DNA Disk Directory
const DNA_DIR = path.join(process.cwd(), '.data', 'product_dnas');

function ensureDnaDir() {
  try {
    if (!fs.existsSync(DNA_DIR)) {
      fs.mkdirSync(DNA_DIR, { recursive: true });
    }
  } catch (e) {}
}

// In-memory fallback stores
export const inMemoryProductDnas = new Map<string, any>();
export const inMemoryDnaVersions = new Map<string, any[]>(); // productDnaId -> array of versions

function persistDnaToDisk(dna: any, versions: any[]) {
  ensureDnaDir();
  try {
    const filePath = path.join(DNA_DIR, `${dna.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify({ dna, versions }), 'utf-8');
  } catch (e) {}
}

function loadDnasFromDisk() {
  ensureDnaDir();
  try {
    const files = fs.readdirSync(DNA_DIR);
    for (const file of files) {
      if (file.endsWith('.json')) {
        const raw = fs.readFileSync(path.join(DNA_DIR, file), 'utf-8');
        const { dna, versions } = JSON.parse(raw);
        if (dna?.id) {
          inMemoryProductDnas.set(dna.id, dna);
          inMemoryDnaVersions.set(dna.id, versions || []);
        }
      }
    }
  } catch (e) {}
}

loadDnasFromDisk();

function defaultDnaSnapshot(productName = '敏华真皮沙发', productCategory = '家具/客厅沙发') {
  return {
    identity: {
      productName,
      productCategory,
      modelCode: 'MH-2026-X'
    },
    appearance: {
      primaryColor: '#C8A97E',
      secondaryColors: ['#3C2A21', '#F5EBE0'],
      materials: ['头层牛皮', '实木框架', '高回弹海绵'],
      surfaceTexture: '细腻皮革纹理'
    },
    structure: {
      productType: 'L型组合沙发',
      proportionRules: ['坐深60cm', '靠背高度85cm'],
      structuralAnchors: ['双缝线扶手', '电镀扶手支架'],
      functionalParts: ['可调节电动脚托', '隐藏式杯架']
    },
    brandRules: {
      logoRequired: true,
      logoPosition: '扶手侧面金属标',
      logoTreatment: '压印金属铭牌'
    },
    mustPreserve: ['头层牛皮质感', '双缝线扶手特征', '品牌金属铭牌'],
    forbiddenChanges: ['修改沙发主体颜色为亮色', '删除扶手缝线细节'],
    promptConstraints: ['Maintain strict product consistency with DNA']
  };
}

function validateDnaSnapshot(snapshot: any): boolean {
  if (!snapshot || typeof snapshot !== 'object') return false;
  const { identity, appearance, structure, brandRules, mustPreserve, forbiddenChanges } = snapshot;
  if (!identity || !appearance || !structure || !brandRules) return false;
  if (typeof identity.productName !== 'string') return false;
  if (typeof appearance.primaryColor !== 'string') return false;
  if (!Array.isArray(mustPreserve) || !Array.isArray(forbiddenChanges)) return false;
  return true;
}

function computeSnapshotChecksum(snapshot: any, referenceAssets: any[]): string {
  const norm = JSON.stringify({ snapshot, referenceAssets });
  return crypto.createHash('sha256').update(norm).digest('hex').substring(0, 16);
}

// sanitize reference assets snapshot (strip base64, blob, signedUrl, local path)
function sanitizeReferenceAssets(assets: any[], projectId: string, dnaCode: string) {
  if (!Array.isArray(assets)) return [];
  return assets.map((asset, idx) => {
    const checksum = asset.checksum || `chk_ref_${idx + 1}_${Date.now()}`;
    const objectKey = asset.objectKey || `projects/${projectId}/product-dna/${dnaCode}/references/${checksum}.jpg`;
    return {
      storageProvider: 'supabase',
      bucket: SUPABASE_STORAGE_BUCKET,
      objectKey,
      mimeType: asset.mimeType || 'image/jpeg',
      width: asset.width || 1024,
      height: asset.height || 1024,
      fileSize: asset.fileSize || 102400,
      checksum,
      role: asset.role || 'main_reference'
    };
  });
}

// ----------------------------------------------------------------------
// 1. POST /api/product-dnas - Create Product DNA & Initial DNA-V001
// ----------------------------------------------------------------------
router.post(['/', '/product-dnas'], async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id || 'system';
    const {
      projectId,
      canvasId,
      productName = '敏华真皮沙发',
      productCategory = '家具/客厅沙发',
      initialSnapshot,
      referenceAssets = []
    } = req.body;

    if (!projectId || !canvasId) {
      return res.status(400).json({
        success: false,
        error: { message: 'projectId and canvasId are required', code: 'MISSING_PARAMETERS' }
      });
    }

    // Check if Product DNA already exists for this project + canvas
    let existingDna = null;
    try {
      const { data } = await supabaseAdmin
        .from('product_dnas')
        .select('*')
        .eq('project_id', projectId)
        .eq('canvas_id', canvasId)
        .single();
      if (data) existingDna = data;
    } catch (e) {}

    if (!existingDna) {
      for (const item of inMemoryProductDnas.values()) {
        if (item.project_id === projectId && item.canvas_id === canvasId) {
          existingDna = item;
          break;
        }
      }
    }

    if (existingDna) {
      let versions = inMemoryDnaVersions.get(existingDna.id) || [];
      const currentVer = versions.find(v => v.id === existingDna.current_version_id) || versions[versions.length - 1];
      return res.status(200).json({
        success: true,
        productDna: existingDna,
        currentVersion: currentVer,
        message: 'Product DNA already exists for this canvas'
      });
    }

    const timestamp = Date.now();
    const dnaId = `dna_${canvasId}_${timestamp}`;
    const dnaCode = `DNA-${canvasId.replace(/[^a-zA-Z0-9]/g, '').slice(-6).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    const snapshot = initialSnapshot || defaultDnaSnapshot(productName, productCategory);
    if (!validateDnaSnapshot(snapshot)) {
      return res.status(400).json({
        success: false,
        error: { message: 'Invalid Product DNA Snapshot schema.', code: 'INVALID_SNAPSHOT' }
      });
    }

    const sanitizedRefs = sanitizeReferenceAssets(referenceAssets, projectId, dnaCode);
    const checksum = computeSnapshotChecksum(snapshot, sanitizedRefs);

    const version1Id = `ver_${dnaCode}_V001_${timestamp}`;
    const version1Record = {
      id: version1Id,
      product_dna_id: dnaId,
      version_number: 1,
      version_code: 'V001',
      parent_version_id: null,
      schema_version: '1.0',
      dna_snapshot: snapshot,
      reference_assets_snapshot: sanitizedRefs,
      checksum,
      created_by: userId,
      created_at: new Date().toISOString()
    };

    const dnaRecord = {
      id: dnaId,
      user_id: userId,
      project_id: projectId,
      canvas_id: canvasId,
      dna_code: dnaCode,
      product_name: productName,
      product_category: productCategory,
      current_version_id: version1Id,
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    let storageMedium = 'in_memory';

    // Try Supabase insert
    try {
      const { error: dnaErr } = await supabaseAdmin.from('product_dnas').insert(dnaRecord);
      if (!dnaErr) {
        const { error: verErr } = await supabaseAdmin.from('product_dna_versions').insert(version1Record);
        if (!verErr) storageMedium = 'supabase';
      }
    } catch (e) {}

    // Save in-memory & disk
    inMemoryProductDnas.set(dnaId, dnaRecord);
    inMemoryDnaVersions.set(dnaId, [version1Record]);
    persistDnaToDisk(dnaRecord, [version1Record]);

    // Update canvas current DNA reference
    try {
      await supabaseAdmin
        .from('creative_canvases')
        .update({
          product_dna_id: dnaId,
          product_dna_version_id: version1Id,
          updated_at: new Date().toISOString()
        })
        .eq('id', canvasId);
    } catch (e) {}

    return res.status(201).json({
      success: true,
      productDna: dnaRecord,
      currentVersion: version1Record,
      storageMedium
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: { message: err.message || 'Failed to create Product DNA', code: 'INTERNAL_ERROR' }
    });
  }
});

// ----------------------------------------------------------------------
// 2. GET /api/product-dnas/:dnaId - Read Product DNA & Current Version
// ----------------------------------------------------------------------
router.get(['/:dnaId', '/product-dnas/:dnaId'], async (req: AuthenticatedRequest, res: Response, next: any) => {
  try {
    const dnaId = String(req.params.dnaId);

    let dna = null;
    let versions: any[] = [];

    try {
      const { data } = await supabaseAdmin.from('product_dnas').select('*').eq('id', dnaId).single();
      if (data) dna = data;
    } catch (e) {}

    if (!dna) {
      dna = inMemoryProductDnas.get(dnaId);
      if (!dna) {
        for (const item of inMemoryProductDnas.values()) {
          if (item.dna_code === dnaId || item.canvas_id === dnaId) {
            dna = item;
            break;
          }
        }
      }
    }

    if (!dna) {
      if (req.baseUrl === '/api' && !req.path.startsWith('/product-dnas/')) {
        return next();
      }
      return res.status(404).json({
        success: false,
        error: { message: `Product DNA '${dnaId}' not found.`, code: 'PRODUCT_DNA_NOT_FOUND' }
      });
    }

    // Load versions
    try {
      const { data } = await supabaseAdmin
        .from('product_dna_versions')
        .select('*')
        .eq('product_dna_id', dna.id)
        .order('version_number', { ascending: true });
      if (data && data.length > 0) versions = data;
    } catch (e) {}

    if (versions.length === 0) {
      versions = inMemoryDnaVersions.get(dna.id) || [];
    }

    const currentVersion = versions.find(v => v.id === dna.current_version_id) || versions[versions.length - 1];

    return res.status(200).json({
      success: true,
      productDna: dna,
      currentVersion,
      versionCount: versions.length
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: { message: err.message, code: 'INTERNAL_ERROR' }
    });
  }
});

// ----------------------------------------------------------------------
// 3. GET /api/product-dnas/:dnaId/versions - Read Version List
// ----------------------------------------------------------------------
router.get(['/:dnaId/versions', '/product-dnas/:dnaId/versions'], async (req: AuthenticatedRequest, res: Response) => {
  try {
    const dnaId = String(req.params.dnaId);

    let versions: any[] = [];
    try {
      const { data } = await supabaseAdmin
        .from('product_dna_versions')
        .select('*')
        .eq('product_dna_id', dnaId)
        .order('version_number', { ascending: true });
      if (data && data.length > 0) versions = data;
    } catch (e) {}

    if (versions.length === 0) {
      versions = inMemoryDnaVersions.get(dnaId) || [];
    }

    return res.status(200).json({
      success: true,
      versions
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: { message: err.message, code: 'INTERNAL_ERROR' }
    });
  }
});

// ----------------------------------------------------------------------
// 4. POST /api/product-dnas/:dnaId/versions - Derive New Version (e.g. DNA-V002)
// ----------------------------------------------------------------------
router.post(['/:dnaId/versions', '/product-dnas/:dnaId/versions'], async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id || 'system';
    const dnaId = String(req.params.dnaId);
    const { parentVersionId, dnaSnapshot, referenceAssets = [] } = req.body;

    if (!parentVersionId) {
      return res.status(400).json({
        success: false,
        error: { message: 'parentVersionId is required when deriving a new Product DNA Version.', code: 'MISSING_PARENT_VERSION' }
      });
    }

    // Fetch Product DNA
    let dna = null;
    try {
      const { data } = await supabaseAdmin.from('product_dnas').select('*').eq('id', dnaId).single();
      if (data) dna = data;
    } catch (e) {}

    if (!dna) dna = inMemoryProductDnas.get(dnaId);

    if (!dna) {
      return res.status(404).json({
        success: false,
        error: { message: `Product DNA '${dnaId}' not found.`, code: 'PRODUCT_DNA_NOT_FOUND' }
      });
    }

    // Fetch parent version
    let existingVersions: any[] = [];
    try {
      const { data } = await supabaseAdmin
        .from('product_dna_versions')
        .select('*')
        .eq('product_dna_id', dna.id)
        .order('version_number', { ascending: true });
      if (data && data.length > 0) existingVersions = data;
    } catch (e) {}

    if (existingVersions.length === 0) {
      existingVersions = inMemoryDnaVersions.get(dna.id) || [];
    }

    const parentVersion = existingVersions.find(v => v.id === parentVersionId);
    if (!parentVersion) {
      return res.status(400).json({
        success: false,
        error: {
          message: `Parent Version '${parentVersionId}' does not exist or does not belong to Product DNA '${dnaId}'.`,
          code: 'INVALID_PARENT_VERSION'
        }
      });
    }

    if (parentVersion.product_dna_id !== dna.id) {
      return res.status(400).json({
        success: false,
        error: {
          message: `Cross-Product DNA parent-child relationships are strictly forbidden.`,
          code: 'CROSS_DNA_PARENT_FORBIDDEN'
        }
      });
    }

    const nextVerNum = parentVersion.version_number + 1;
    const nextVerCode = `V${String(nextVerNum).padStart(3, '0')}`;

    const snapshot = dnaSnapshot || parentVersion.dna_snapshot;
    if (!validateDnaSnapshot(snapshot)) {
      return res.status(400).json({
        success: false,
        error: { message: 'Invalid Product DNA Snapshot schema.', code: 'INVALID_SNAPSHOT' }
      });
    }

    const sanitizedRefs = sanitizeReferenceAssets(
      referenceAssets.length > 0 ? referenceAssets : (parentVersion.reference_assets_snapshot || []),
      dna.project_id,
      dna.dna_code
    );

    const checksum = computeSnapshotChecksum(snapshot, sanitizedRefs);
    const timestamp = Date.now();
    const newVersionId = `ver_${dna.dna_code}_${nextVerCode}_${timestamp}`;

    const newVerRecord = {
      id: newVersionId,
      product_dna_id: dna.id,
      version_number: nextVerNum,
      version_code: nextVerCode,
      parent_version_id: parentVersion.id,
      schema_version: '1.0',
      dna_snapshot: snapshot,
      reference_assets_snapshot: sanitizedRefs,
      checksum,
      created_by: userId,
      created_at: new Date().toISOString()
    };

    // Update product_dna current_version_id
    const updatedDna = {
      ...dna,
      current_version_id: newVersionId,
      updated_at: new Date().toISOString()
    };

    try {
      await supabaseAdmin.from('product_dna_versions').insert(newVerRecord);
      await supabaseAdmin.from('product_dnas').update({
        current_version_id: newVersionId,
        updated_at: new Date().toISOString()
      }).eq('id', dna.id);
    } catch (e) {}

    // Update in-memory & disk
    inMemoryProductDnas.set(dna.id, updatedDna);
    const versionList = [...existingVersions, newVerRecord];
    inMemoryDnaVersions.set(dna.id, versionList);
    persistDnaToDisk(updatedDna, versionList);

    // Update Canvas current DNA version
    try {
      await supabaseAdmin.from('creative_canvases').update({
        product_dna_version_id: newVersionId,
        updated_at: new Date().toISOString()
      }).eq('id', dna.canvas_id);
    } catch (e) {}

    return res.status(201).json({
      success: true,
      version: newVerRecord,
      productDna: updatedDna
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: { message: err.message, code: 'INTERNAL_ERROR' }
    });
  }
});

// ----------------------------------------------------------------------
// 5. GET /api/product-dna-versions/:versionId - Read Specific DNA Version
// ----------------------------------------------------------------------
router.get(['/product-dna-versions/:versionId', '/versions/:versionId'], async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { versionId } = req.params;

    let version = null;
    try {
      const { data } = await supabaseAdmin.from('product_dna_versions').select('*').eq('id', versionId).single();
      if (data) version = data;
    } catch (e) {}

    if (!version) {
      for (const verList of inMemoryDnaVersions.values()) {
        const found = verList.find(v => v.id === versionId);
        if (found) {
          version = found;
          break;
        }
      }
    }

    if (!version) {
      return res.status(404).json({
        success: false,
        error: { message: `Product DNA Version '${versionId}' not found.`, code: 'VERSION_NOT_FOUND' }
      });
    }

    return res.status(200).json({
      success: true,
      version
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: { message: err.message, code: 'INTERNAL_ERROR' }
    });
  }
});

// ----------------------------------------------------------------------
// 6. POST /api/product-dnas/:dnaId/select-version - Switch Canvas DNA Version
// ----------------------------------------------------------------------
router.post(['/:dnaId/select-version', '/product-dnas/:dnaId/select-version'], async (req: AuthenticatedRequest, res: Response) => {
  try {
    const dnaId = String(req.params.dnaId);
    const { versionId } = req.body;

    if (!versionId) {
      return res.status(400).json({
        success: false,
        error: { message: 'versionId is required.', code: 'MISSING_VERSION_ID' }
      });
    }

    let dna = inMemoryProductDnas.get(dnaId);
    if (!dna) {
      try {
        const { data } = await supabaseAdmin.from('product_dnas').select('*').eq('id', dnaId).single();
        if (data) dna = data;
      } catch (e) {}
    }

    if (!dna) {
      return res.status(404).json({
        success: false,
        error: { message: `Product DNA '${dnaId}' not found.`, code: 'PRODUCT_DNA_NOT_FOUND' }
      });
    }

    let versions = inMemoryDnaVersions.get(dna.id) || [];
    if (versions.length === 0) {
      try {
        const { data } = await supabaseAdmin.from('product_dna_versions').select('*').eq('product_dna_id', dna.id);
        if (data) versions = data;
      } catch (e) {}
    }

    const selectedVer = versions.find(v => v.id === versionId);
    if (!selectedVer) {
      return res.status(400).json({
        success: false,
        error: { message: `Version '${versionId}' does not belong to Product DNA '${dnaId}'.`, code: 'INVALID_VERSION' }
      });
    }

    const updatedDna = { ...dna, current_version_id: versionId, updated_at: new Date().toISOString() };
    inMemoryProductDnas.set(dna.id, updatedDna);
    persistDnaToDisk(updatedDna, versions);

    try {
      await supabaseAdmin.from('product_dnas').update({
        current_version_id: versionId,
        updated_at: new Date().toISOString()
      }).eq('id', dna.id);

      await supabaseAdmin.from('creative_canvases').update({
        product_dna_version_id: versionId,
        updated_at: new Date().toISOString()
      }).eq('id', dna.canvas_id);
    } catch (e) {}

    return res.status(200).json({
      success: true,
      productDna: updatedDna,
      currentVersion: selectedVer
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: { message: err.message, code: 'INTERNAL_ERROR' }
    });
  }
});

// ----------------------------------------------------------------------
// 7. Immutability Guard: Reject PUT/PATCH on Product DNA Versions
// ----------------------------------------------------------------------
const rejectImmutable = (req: AuthenticatedRequest, res: Response) => {
  return res.status(403).json({
    success: false,
    error: {
      message: 'Product DNA Versions are strictly immutable and cannot be modified or overwritten in place. Create a new version (e.g. DNA-V002) instead.',
      code: 'IMMUTABLE_PRODUCT_DNA_VERSION'
    }
  });
};

router.put('/product-dna-versions/:versionId', rejectImmutable);
router.patch('/product-dna-versions/:versionId', rejectImmutable);
router.put('/:dnaId/versions/:versionId', rejectImmutable);
router.patch('/:dnaId/versions/:versionId', rejectImmutable);

export default router;
