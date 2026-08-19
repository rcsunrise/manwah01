import express from 'express';
import { createServer as createViteServer } from 'vite';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import sharp from 'sharp';
import fs from 'fs';
import { supabaseAdmin} from './src/lib/supabase';
import adminRoutes from './server/routes/adminRoutes';
import projectRoutes from './server/routes/projectRoutes';
import agentRoutes from './server/routes/agentRoutes';
import agentConversationRoutes from './server/routes/agentConversationRoutes';
import canvasRoutes from './server/routes/canvasRoutes';
import assetRoutes from './server/routes/assetRoutes';
import productDnaRoutes from './server/routes/productDnaRoutes';
import copyRoutes from './server/routes/copyRoutes';
import layoutManifestRoutes from './server/routes/layoutManifestRoutes';
import { authenticateToken } from './server/middleware/auth';
import {
  getFallbackConfig,
  getUserApiConfig,
  isProviderKeyValid,
  resolveApiConfig
} from './server/ai/providerConfig';
import {
  assertProviderModelCompatibility,
  resolveImageModel,
  type ImageIntent
} from './server/ai/modelRegistry';
import { getImageProviderAdapter } from './server/ai/imageProviderAdapter';
import {
  normalizeProviderError,
  providerErrorFromStatus,
  ProviderError,
  serializeProviderError
} from './server/ai/providerError';
import {
  buildNormalizedImageResponse,
  hasValidImages,
  normalizeGeminiImageResponse
} from './server/ai/imageResponse';
import {
  buildImageRoleManifest,
  IMAGE_ROLE_LABELS,
  normalizeImageReferences,
  parseGenerationIntent
} from './server/ai/imageRequest';
import {
  resolveAndValidateImage,
  resolveAndValidateImages,
  validateMask,
  type ResolvedImageReference
} from './server/ai/imageInputSecurity';

function fileLog(msg: string) {
  try { fs.appendFileSync('debug.log', msg + '\n'); } catch (e) {}
  console.log(msg);
}


const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';

const modelPrices: Record<string, { input: number, output: number, per_image?: number }> = {
  // 基于汇率: 1 USD = 10,000 点
  
  'gemini-3.1-pro-preview': { input: 12500, output: 50000 }, // $1.25/$5 -> 12,500/50,000 pts per 1M
  'gemini-3.1-flash-preview': { input: 1400, output: 1400 }, // $0.14 -> 1,400 pts per 1M
  'gemini-2.0-flash': { input: 1000, output: 4000 },
  'gemini-1.5-pro': { input: 12500, output: 50000 },
  'gemini-1.5-flash': { input: 1000, output: 4000 },
  
  // 用户指定的高级计费示例 (生图 resolution 映射)
  'gemini-3-pro-4k': { input: 50000, output: 50000, per_image: 400 }, // 1K 为基准 400
  'gemini-2.5-flash-1k': { input: 4000, output: 4000, per_image: 400 },
  'gemini-3.1-flash-2k': { input: 14000, output: 14000, per_image: 400 },
  
  // 生图计费 (点数/张)
  'gemini-3-pro-image-preview': { input: 0, output: 0, per_image: 400 }, 
  'gemini-3.1-flash-image-preview': { input: 0, output: 0, per_image: 400 }, 
  'gemini-3-pro-image': { input: 0, output: 0, per_image: 400 }, 
  'gemini-3.1-flash-image': { input: 0, output: 0, per_image: 400 }, 
};

// Map unknown or slightly different model names to known price keys
function getPriceData(model: string) {
  if (modelPrices[model]) return modelPrices[model];
  
  const lower = model.toLowerCase();
  if (lower.includes('pro')) return modelPrices['gemini-1.5-pro'];
  if (lower.includes('flash')) return modelPrices['gemini-1.5-flash'];
  
  return { input: 1000, output: 4000 }; // 默认 Flash 计费
}


// 基于 1 USD = 10,000 点的精细化计价函数
function getImagePoints(model: string, resolution: string): number {
  const modelKey = model.toLowerCase();
  const res = resolution || '1K';

  // 1. 极速版 (v2.5 Flash) - 0.02W
  if (modelKey.includes('2.5') || modelKey.includes('极速')) {
    return 200; 
  }
  
  // 2. 标准版 (v3.1 Flash) - 2K 锚点 0.22W (2200)
  if (modelKey.includes('3.1') || modelKey.includes('标准')) {
    if (res === '1K') return 1100; // 0.11W
    if (res === '4K') return 4400; // 0.44W
    return 2200; // 默认 (按 2K 锚点计费)
  }
  
  // 3. 旗舰版 (v3.0 Pro) - 4K 锚点 0.5W (5000)
  if (modelKey.includes('3.0') || modelKey.includes('3-pro') || modelKey.includes('旗舰')) {
    if (res === '1K') return 1250;  // 0.125W (梯度起点)
    if (res === '2K') return 2500;  // 0.25W (梯度中点)
    return 5000; // 4K 终点
  }

  // 4. GPT 画图 (gpt-image)
  if (modelKey.includes('gpt-image')) {
    if (res === '1K') return 1500;
    if (res === '2K') return 3000;
    if (res === '4K') return 6000;
    return 3000;
  }

  return 550; // 默认按标准 1K 兜底
}

async function chargeUser(userId: string, tokens: number, model: string, resolution: string | null, deptId: string | null, type: 'chat' | 'image_generation' = 'image_generation', inputTokens: number = 0, outputTokens: number = 0, providerMarker: string = '') {
  if (!userId || userId === 'system') return;
  
  let pointsToDeduct = 0;

  if (tokens === 0) {
    pointsToDeduct = 0;
  } else if (type === 'image_generation' && resolution) {
    pointsToDeduct = getImagePoints(model, resolution);
  } else {
    const priceData = getPriceData(model);
    // Chat billing: (Input * PricePer1M + Output * PricePer1M) / 1,000,000
    const inTokens = inputTokens || Math.round((tokens || 0) * 0.3);
    const outTokens = outputTokens || Math.round((tokens || 0) * 0.7);
    pointsToDeduct = Math.round((inTokens * priceData.input + outTokens * priceData.output) / 1000000);
    // 注意：此处 / 1,000,000 是因为 input/outputTokens 为实际数，而价格是每 1M tokens 的点数。
    // 价格已换算为点数（1 USD = 10,000 点），例如 $1.25 = 12,500 点。
    // 计算公式：(Token数 / 1,000,000) * 每百万Token点数
  }
  
  if (isNaN(pointsToDeduct)) pointsToDeduct = 0;

  try {
    // 1. 获取最新信息 (不再手动更新 quota_used，由数据库触发器维护)
    const { data: profile } = await supabaseAdmin.from('profiles').select('quota_used, dept_id').eq('id', userId).single();
    const finalDeptId = deptId || profile?.dept_id || null;
    
    // await supabaseAdmin.from('profiles').update({ quota_used: currentUsed + pointsToDeduct }).eq('id', userId);

    const now = new Date().toISOString();
    const modelResValue = resolution || (type === 'chat' ? 'Token' : 'Standard');

    // Create marked and formatted model name
    let markedModelName = model;
    if (type === 'image_generation') {
      const cleanM = model.replace('google/', '').toLowerCase();
      if (cleanM === 'gemini-3.1-flash-image') {
        markedModelName = `[⚡新闪电·正式版] ${model}`;
      } else if (cleanM === 'gemini-3.1-flash-image-preview') {
        markedModelName = `[⚡新闪电·预览版] ${model}`;
      } else if (cleanM === 'gemini-3-pro-image' || cleanM === 'google/gemini-3-pro-image' || model.includes('gemini-3-pro-image')) {
        if (model.includes('3-pro-image-preview') || model.includes('旗舰·预览版')) {
          markedModelName = `[💎新旗舰·预览版] ${model}`;
        } else {
          markedModelName = `[💎新旗舰·正式版] ${model}`;
        }
      } else if (cleanM === 'gemini-3-pro-image-preview' || cleanM === 'google/gemini-3-pro-image-preview') {
        markedModelName = `[💎新旗舰·预览版] ${model}`;
      } else if (cleanM.includes('2.5') || cleanM.includes('极速')) {
        markedModelName = `[🚀极速版·v2.5] ${model}`;
      } else if (cleanM.includes('gpt-image-2')) {
        markedModelName = `[渠道·2.0] ${model}`;
      } else if (cleanM.includes('gpt-image-1.5')) {
        markedModelName = `[渠道·1.5] ${model}`;
      } else if (cleanM.includes('gpt-image-1')) {
        markedModelName = `[渠道·1.0] ${model}`;
      } else if (cleanM.includes('flux')) {
        markedModelName = `[FLUX] ${model}`;
      } else if (cleanM.includes('midjourney')) {
        markedModelName = `[Midjourney] ${model}`;
      }
    }

    const displayModel = providerMarker ? `${markedModelName} ${providerMarker}` : markedModelName;

    // 2. 插入详细日志 usage_logs (主看板使用，必须成功)
    await supabaseAdmin.from('usage_logs').insert([{
      user_id: userId,
      dept_id: finalDeptId, 
      tokens_used: pointsToDeduct,
      cost_usd: pointsToDeduct / 10000,
      model: displayModel,
      model_res: modelResValue,
      type: type,
      created_at: now
    }]);

    // 4. 滚动清理：保持 usage_logs 数据量在合理范围
    const { count } = await supabaseAdmin.from('usage_logs').select('*', { count: 'exact', head: true }).eq('user_id', userId);
    if (count && count > 1000) {
      const { data: oldRecords } = await supabaseAdmin
        .from('usage_logs')
        .select('id')
        .eq('user_id', userId)
        .order('created_at', { ascending: true })
        .limit(Math.min(100, count - 1000));
      
      if (oldRecords && oldRecords.length > 0) {
        await supabaseAdmin.from('usage_logs').delete().in('id', oldRecords.map(r => r.id));
      }
    }

    console.log(`[Billing] Charged ${pointsToDeduct} points to user ${userId} for ${model}`);
  } catch (err) {
    console.error("[Billing] Critical error during charging:", err);
  }
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 2, fileSize: 50 * 1024 * 1024, fields: 10 }
});

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT || 3000);

  app.use(cors());
  // 100MB decoded image budget needs roughly 134MB as Base64 JSON. Keep a
  // bounded margin while rejecting the former unbounded 500MB request shape.
  app.use(express.json({ limit: '150mb' }));
  app.use(express.urlencoded({ limit: '150mb', extended: true }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'manwah-ai-studio' });
  });

  app.get('/api/health/persistence', async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const checks: Record<string, string> = {
      creativeProjects: 'unknown',
      creativeCanvases: 'unknown',
      canvasRevisions: 'unknown',
      agentConversations: 'unknown',
      agentMessages: 'unknown'
    };

    let overallReady = true;

    const isPlaceholder = (val: string | undefined) => !val || val.includes('在这里填入') || val.includes('placeholder');
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
    const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
    const isConfigured = !isPlaceholder(url) && !isPlaceholder(anonKey);
    const storageMedium = isConfigured ? 'supabase_db' : 'in_memory';

    if (!isConfigured) {
      overallReady = false;
      checks.creativeProjects = 'unconfigured';
      checks.creativeCanvases = 'unconfigured';
      checks.canvasRevisions = 'unconfigured';
      checks.agentConversations = 'unconfigured';
      checks.agentMessages = 'unconfigured';
    } else {
      const tablesMap: Record<string, string> = {
        creativeProjects: 'creative_projects',
        creativeCanvases: 'creative_canvases',
        canvasRevisions: 'canvas_revisions',
        agentConversations: 'agent_conversations',
        agentMessages: 'agent_messages'
      };

      for (const [checkKey, tableName] of Object.entries(tablesMap)) {
        try {
          const { error } = await supabaseAdmin.from(tableName).select('id').limit(1);
          if (error) {
            overallReady = false;
            if (
              error.message?.includes('Could not find the table') ||
              error.message?.includes('relation') ||
              error.code === '42P01'
            ) {
              checks[checkKey] = 'missing_table';
            } else {
              checks[checkKey] = 'error';
            }
          } else {
            checks[checkKey] = 'ready';
          }
        } catch (err) {
          overallReady = false;
          checks[checkKey] = 'error';
        }
      }
    }

    const missingTables = Object.entries(checks)
      .filter(([_k, status]) => status !== 'ready')
      .map(([k]) => k);

    return res.status(overallReady ? 200 : 503).json({
      ready: overallReady,
      schemaVersion: 'BASELINE-M1-R1',
      storageMedium,
      checks,
      ...(overallReady ? {} : { missingTables })
    });
  });

  // Runtime Config Endpoint for client-side Supabase initialization
  app.get('/api/runtime-config', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
    const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

    const isPlaceholder = (val: string | undefined) => !val || val.includes('在这里填入') || val.includes('placeholder');
    const isConfigured = !isPlaceholder(url) && !isPlaceholder(anonKey);

    let projectRef = '';
    if (url) {
      try {
        const match = url.match(/https?:\/\/([^.]+)\.supabase/);
        if (match && match[1]) {
          projectRef = match[1];
        }
      } catch (e) {}
    }

    res.json({
      supabaseUrl: isConfigured ? url : '',
      supabaseAnonKey: isConfigured ? anonKey : '',
      configured: isConfigured,
      projectRef,
      storageMedium: isConfigured ? 'supabase_db' : 'in_memory'
    });
  });

  // Mount modular API routers
  app.use('/api/admin', adminRoutes);
  app.use('/api/projects', projectRoutes);
  app.use('/api/agent', agentConversationRoutes);
  app.use('/api/agent', agentRoutes);
  app.use('/api/canvases', canvasRoutes);
  app.use('/api/canvases', layoutManifestRoutes);
  app.use('/api/layout-manifests', layoutManifestRoutes);
  app.use('/api/asset-skus', assetRoutes);
  app.use('/api/asset-versions', assetRoutes);
  app.use('/api/product-dnas', productDnaRoutes);
  app.use('/api/product-dna-versions', productDnaRoutes);
  app.use('/api', productDnaRoutes);
  app.use('/api', assetRoutes);
  app.use('/api', copyRoutes);

  // API Route for uploading mask and clean image
  app.post('/api/pre_process/mask', authenticateToken as any, upload.fields([{ name: 'clean_image', maxCount: 1 }, { name: 'mask_image', maxCount: 1 }]), async (req, res) => {
    try {
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      const cleanImageFile = files['clean_image']?.[0];
      const maskImageFile = files['mask_image']?.[0];

      if (!cleanImageFile || !maskImageFile) {
        return res.status(400).json({ error: 'Missing clean_image or mask_image' });
      }

      const timestamp = Date.now();
      const cleanImagePath = `assets/clean_${timestamp}.jpg`;
      const maskImagePath = `masks/mask_${timestamp}.png`;

      // Process and compress images if they exist
      let cleanImageBuffer = cleanImageFile.buffer;
      let maskImageBuffer = maskImageFile.buffer;

      try {
        // Compress clean image (convert to jpeg for better compression)
        cleanImageBuffer = await sharp(cleanImageFile.buffer)
          .resize(2048, 2048, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 85 })
          .toBuffer();
          
        // Compress mask image (keep png as it often needs to be precise, but resize if it's huge)
        maskImageBuffer = await sharp(maskImageFile.buffer)
          .resize(2048, 2048, { fit: 'inside', withoutEnlargement: true })
          .png({ palette: true, quality: 80 })
          .toBuffer();
      } catch (err) {
        console.warn('Image optimization failed, using original buffers:', err);
      }

      // Get public URLs or use dummy ones if placeholder
      let cleanImageUrl = '';
      let maskImageUrl = '';
      let logData: any = [{ id: 'dummy', created_at: new Date().toISOString() }];
      
      const isPlaceholder = !supabaseUrl || supabaseUrl.includes('placeholder.supabase.co');
      
      if (isPlaceholder) {
        cleanImageUrl = `dummy_clean_${Date.now()}.png`;
        maskImageUrl = `dummy_mask_${Date.now()}.png`;
      } else {
        // Ensure buckets exist - simplified and safer
        const ensureBucket = async (name: string) => {
          try {
            const { data: buckets, error: listError } = await supabaseAdmin.storage.listBuckets();
            if (listError) {
              console.warn(`Error listing buckets while ensuring ${name}:`, listError.message);
              return;
            }
            if (buckets && !buckets.find(b => b.name === name)) {
              console.log(`Creating missing bucket: ${name}`);
              await supabaseAdmin.storage.createBucket(name, { public: true });
            }
          } catch (e) {
            console.warn(`Caught error in ensureBucket(${name}):`, e);
          }
        };

        await ensureBucket('assets');
        await ensureBucket('masks');

        // 1. Upload clean image to Supabase Storage
        const { data: cleanData, error: cleanError } = await supabaseAdmin.storage
          .from('assets')
          .upload(cleanImagePath, cleanImageBuffer, {
            contentType: 'image/jpeg',
            upsert: true
          });

        if (cleanError) {
          console.error('Clean image upload error:', cleanError);
          throw new Error(`Failed to upload clean image: ${cleanError.message}`);
        }

        // 2. Upload mask image to Supabase Storage
        const { data: maskData, error: maskError } = await supabaseAdmin.storage
          .from('masks')
          .upload(maskImagePath, maskImageBuffer, {
            contentType: 'image/png',
            upsert: true
          });

        if (maskError) {
          console.error('Mask image upload error:', maskError);
          throw new Error(`Failed to upload mask image: ${maskError.message}`);
        }

        // Get public URLs
        cleanImageUrl = supabaseAdmin.storage.from('assets').getPublicUrl(cleanImagePath).data.publicUrl;
        maskImageUrl = supabaseAdmin.storage.from('masks').getPublicUrl(maskImagePath).data.publicUrl;

        // 3. Insert into pre_process_logs table - USE supabaseAdmin to bypass RLS issues
        const { data: realLogData, error: logError } = await supabaseAdmin
          .from('pre_process_logs')
          .insert([
            {
              plugin_id: 'mhyf_mask_tool_v1',
              clean_image_url: cleanImageUrl,
              mask_image_url: maskImageUrl,
              created_at: new Date().toISOString()
            }
          ])
          .select();

        if (logError) {
          console.error('Pre-process log insertion error:', logError);
          // Don't necessarily throw here if images were uploaded, but let's be strict
          throw new Error(`Failed to save log: ${logError.message}`);
        }
        if (realLogData) logData = realLogData;
      }

      res.json({
        success: true,
        data: {
          clean_image_url: cleanImageUrl,
          mask_image_url: maskImageUrl,
          log: logData[0]
        }
      });
    } catch (error: any) {
      console.error('Error in mask pre-processing:', error);
      res.status(500).json({ error: error.message || 'Internal server error' });
    }
  });

  // Helper to resolve raw data, data URLs, asset URLs, or object keys to clean base64 and mimeType
  async function resolveImageToBase64(rawData: string): Promise<{ cleanB64: string; mimeType: string }> {
    if (!rawData || typeof rawData !== 'string') {
      return { cleanB64: '', mimeType: 'image/jpeg' };
    }

    const trimmed = rawData.trim();

    // 1. Data URL format: data:image/png;base64,iVBORw...
    if (trimmed.startsWith('data:')) {
      const splitParts = trimmed.split(',');
      const header = splitParts[0];
      const cleanB64 = splitParts[1] || '';
      let mimeType = 'image/jpeg';
      if (header.includes('image/png')) mimeType = 'image/png';
      else if (header.includes('image/webp')) mimeType = 'image/webp';
      else if (header.includes('image/jpeg') || header.includes('image/jpg')) mimeType = 'image/jpeg';
      return { cleanB64, mimeType };
    }

    // 2. Comma separated base64
    if (trimmed.includes(',')) {
      const parts = trimmed.split(',');
      return { cleanB64: parts[1] || parts[0], mimeType: 'image/jpeg' };
    }

    // 3. Internal asset URL or object key. External URLs are handled by the
    // SSRF-safe resolver below and plain HTTP is never accepted.
    if (trimmed.startsWith('/api/') || trimmed.startsWith('obj_')) {
      let fetchUrl = trimmed;
      if (trimmed.startsWith('obj_')) {
        fetchUrl = `http://localhost:3000/api/canvases/assets/${trimmed}`;
      } else if (trimmed.startsWith('/')) {
        fetchUrl = `http://localhost:3000${trimmed}`;
      }

      try {
        const resp = await fetch(fetchUrl);
        if (resp.ok) {
          const arrayBuf = await resp.arrayBuffer();
          const buf = Buffer.from(arrayBuf);
          const contentType = resp.headers.get('content-type') || 'image/png';
          let mimeType = 'image/jpeg';
          if (contentType.includes('image/png')) mimeType = 'image/png';
          else if (contentType.includes('image/webp')) mimeType = 'image/webp';
          else if (contentType.includes('image/jpeg') || contentType.includes('image/jpg')) mimeType = 'image/jpeg';
          return { cleanB64: buf.toString('base64'), mimeType };
        }
      } catch (err: any) {
        console.warn(`[resolveImageToBase64] Warning fetching asset from ${fetchUrl}:`, err?.message);
      }
    }

    if (trimmed.startsWith('https://')) {
      const resolved = await resolveAndValidateImage({
        source: trimmed,
        role: 'style_reference',
        order: 0
      });
      return { cleanB64: resolved.cleanB64, mimeType: resolved.mimeType };
    }
    if (trimmed.startsWith('http://')) {
      throw new ProviderError('远程参考图仅允许 HTTPS URL。', 'invalid_image_input', 400, false);
    }

    // 4. Fallback: treat as raw base64 string
    return { cleanB64: trimmed, mimeType: 'image/jpeg' };
  }

  // API Route to proxy to API Gateway
  // Endpoint: /api/gateway/generate-image
  app.post('/api/gateway/generate-image', authenticateToken as any, async (req, res) => {
    try {
      let { prompt, model = "google/gemini-3-pro-image-preview", generationIntent, aspectRatio = "1:1", images = [], resolution = "1K", seed, size, quality, format, output_format, background, moderation, mask } = req.body;
      const user = (req as any).user;
      const userUuid = user?.id || 'system';
      const requestId = (req.headers['x-request-id'] as string) || `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      images = Array.isArray(images) ? images : [];
      let normalizedReferences;
      let intent: ImageIntent;
      try {
        normalizedReferences = normalizeImageReferences(images);
        intent = parseGenerationIntent(generationIntent, normalizedReferences.length);
      } catch (error) {
        const normalized = normalizeProviderError(error, { model });
        return res.status(normalized.statusCode).json(serializeProviderError(normalized, requestId));
      }
      let selectedModel;
      try {
        selectedModel = resolveImageModel(model, intent);
      } catch (error) {
        const normalized = normalizeProviderError(error, { model });
        return res.status(normalized.statusCode).json(serializeProviderError(normalized, requestId));
      }
      model = selectedModel.id;

      if (normalizedReferences.length > selectedModel.capabilities.maxInputImages) {
        const error = new ProviderError(
          `模型“${model}”最多支持 ${selectedModel.capabilities.maxInputImages} 张参考图。`,
          'invalid_image_input',
          400,
          false,
          undefined,
          model
        );
        return res.status(400).json(serializeProviderError(error, requestId));
      }

      if (mask && intent !== 'image_edit') {
        const error = new ProviderError('Mask 只能用于 image_edit 请求。', 'invalid_request', 400, false, undefined, model);
        return res.status(400).json(serializeProviderError(error, requestId));
      }
      if (mask && !selectedModel.capabilities.mask) {
        const error = new ProviderError(`模型“${model}”不支持 Mask 编辑。`, 'capability_unsupported', 400, false, undefined, model);
        return res.status(400).json(serializeProviderError(error, requestId));
      }

      // Helper to calculate exact dimension string for OpenAI/VectorEngine based on aspect ratio
      const computeOpenAiImageSize = (ratioStr: string, resStr: string): string => {
        const is2K = resStr === '2K';
        const is4K = resStr === '4K';

        if (!ratioStr || ratioStr === 'Auto' || ratioStr === '1:1') {
          return (is2K || is4K) ? "2048x2048" : "1024x1024";
        }

        const parts = String(ratioStr).trim().split(':');
        if (parts.length === 2) {
          const w = parseFloat(parts[0]);
          const h = parseFloat(parts[1]);
          if (!isNaN(w) && !isNaN(h) && w > 0 && h > 0) {
            const ratio = w / h;

            if (Math.abs(ratio - 1.0) < 0.05) {
              return (is2K || is4K) ? "2048x2048" : "1024x1024";
            }

            // Map to standard supported OpenAI / VectorEngine image sizes
            // 16:9 landscape (~1.777)
            if (Math.abs(ratio - (16 / 9)) < 0.05 || Math.abs(ratio - 1.777) < 0.05) {
              return (is2K || is4K) ? "2560x1440" : "1792x1024";
            }
            // 9:16 portrait (~0.5625)
            if (Math.abs(ratio - (9 / 16)) < 0.05 || Math.abs(ratio - 0.5625) < 0.05) {
              return (is2K || is4K) ? "1440x2560" : "1024x1792";
            }
            // 4:3 (~1.333)
            if (Math.abs(ratio - (4 / 3)) < 0.05 || Math.abs(ratio - 1.333) < 0.05) {
              return (is2K || is4K) ? "2048x1536" : "1472x1104";
            }
            // 3:4 (~0.75)
            if (Math.abs(ratio - (3 / 4)) < 0.05 || Math.abs(ratio - 0.75) < 0.05) {
              return (is2K || is4K) ? "1536x2048" : "1104x1472";
            }
            // 3:2 (~1.5)
            if (Math.abs(ratio - 1.5) < 0.05) {
              return (is2K || is4K) ? "2048x1365" : "1536x1024";
            }
            // 2:3 (~0.666)
            if (Math.abs(ratio - (2 / 3)) < 0.05) {
              return (is2K || is4K) ? "1365x2048" : "1024x1536";
            }
            // 21:9 (~2.333)
            if (Math.abs(ratio - (21 / 9)) < 0.05 || ratio >= 2.0) {
              return (is2K || is4K) ? "2560x1080" : "1792x768";
            }

            // Fallbacks
            if (ratio > 1.2) {
              return (is2K || is4K) ? "2560x1440" : "1792x1024";
            } else if (ratio < 0.8) {
              return (is2K || is4K) ? "1440x2560" : "1024x1792";
            } else {
              return (is2K || is4K) ? "2048x2048" : "1024x1024";
            }
          }
        }

        return (is2K || is4K) ? "2048x2048" : "1024x1024";
      };

      // Helper to match the closest supported aspect ratio for Google Imagen model to prevent API errors
      const getClosestSupportedAspectRatio = (ratioStr: string): string => {
        const uppercaseRatio = String(ratioStr).trim();
        const supported = ['1:1', '1:4', '1:8', '2:3', '3:2', '3:4', '4:1', '4:3', '4:5', '5:4', '8:1', '9:16', '16:9', '21:9'];
        if (supported.includes(uppercaseRatio)) {
          return uppercaseRatio;
        }

        const parts = uppercaseRatio.split(':');
        if (parts.length === 2) {
          const w = parseFloat(parts[0]);
          const h = parseFloat(parts[1]);
          if (!isNaN(w) && !isNaN(h) && h !== 0) {
            const targetVal = w / h;
            const SUPPORTED_RATIOS = [
              { name: '1:1', value: 1.0 },
              { name: '1:4', value: 0.25 },
              { name: '1:8', value: 0.125 },
              { name: '2:3', value: 2/3 },
              { name: '3:2', value: 1.5 },
              { name: '3:4', value: 0.75 },
              { name: '4:1', value: 4.0 },
              { name: '4:3', value: 4/3 },
              { name: '4:5', value: 0.8 },
              { name: '5:4', value: 1.25 },
              { name: '8:1', value: 8.0 },
              { name: '9:16', value: 9/16 },
              { name: '16:9', value: 16/9 },
              { name: '21:9', value: 21/9 }
            ];
            let bestMatch = SUPPORTED_RATIOS[0];
            let minDiff = Math.abs(bestMatch.value - targetVal);
            for (let i = 1; i < SUPPORTED_RATIOS.length; i++) {
              const diff = Math.abs(SUPPORTED_RATIOS[i].value - targetVal);
              if (diff < minDiff) {
                minDiff = diff;
                bestMatch = SUPPORTED_RATIOS[i];
              }
            }
            return bestMatch.name;
          }
        }
        return '1:1';
      };

      const originalAspectRatio = aspectRatio;
      let targetWidth: number | null = null;
      let targetHeight: number | null = null;

      // Check if original ratio is a custom ratio (e.g. "3974:1533")
      if (originalAspectRatio && originalAspectRatio !== 'Auto') {
        const parts = String(originalAspectRatio).split(':');
        if (parts.length === 2) {
          const w = parseInt(parts[0], 10);
          const h = parseInt(parts[1], 10);
          if (!isNaN(w) && !isNaN(h) && w > 0 && h > 0) {
            targetWidth = w;
            targetHeight = h;
          }
        }
      }

      // If Auto mode, attempt to extract dimensions from the first reference image (Window 1)
      if (originalAspectRatio === 'Auto' && images && images.length > 0) {
        try {
          const rawData0 = typeof images[0] === 'string' ? images[0] : (images[0]?.data || images[0]?.base64Data || images[0]?.url || '');
          const { cleanB64 } = await resolveImageToBase64(rawData0);
          if (cleanB64) {
            const firstImgBuffer = Buffer.from(cleanB64, 'base64');
            const meta = await sharp(firstImgBuffer).metadata();
            if (meta.width && meta.height) {
              targetWidth = meta.width;
              targetHeight = meta.height;
              console.log(`[Auto Aspect Ratio] Automatically detected reference image dimension: ${targetWidth}x${targetHeight}`);
            }
          }
        } catch (metaErr) {
          console.error("Failed to extract metadata from reference image:", metaErr);
        }
      }

      // If a specific target dimension is detected (either via Custom or Auto mode from reference image),
      // we map it to the closest supported Gemini aspect ratio to ensure Gemini generates a natively matching layout, preventing heavy cropping.
      if (targetWidth && targetHeight) {
        aspectRatio = getClosestSupportedAspectRatio(`${targetWidth}:${targetHeight}`);
        console.log(`[Aspect Ratio] Target dimension: ${targetWidth}x${targetHeight} mapped to closest supported Gemini aspect ratio: ${aspectRatio}`);
      } else {
        // Fallback sanitize
        if (originalAspectRatio !== 'Auto' && originalAspectRatio !== 'Custom') {
          aspectRatio = getClosestSupportedAspectRatio(originalAspectRatio);
        } else {
          aspectRatio = '1:1';
        }
      }

      if (originalAspectRatio !== aspectRatio && originalAspectRatio && originalAspectRatio !== 'Auto' && originalAspectRatio !== 'Custom') {
        prompt = `${prompt} [Desired Specific Aspect Ratio: ${originalAspectRatio}]`;
      }

      // 1. DYNAMIC CONFIG FETCHING
      let { apiKey, baseUrl, deptId, provider, routingMode, method1Key } = await resolveApiConfig(userUuid);
      
      if (!isProviderKeyValid(apiKey)) {
        const error = new ProviderError(
          '系统或所属部门未配置有效的 Provider，请联系管理员在控制面板设置。',
          'authentication',
          503,
          false,
          provider,
          model
        );
        return res.status(503).json(serializeProviderError(error, requestId));
      }
      try {
        assertProviderModelCompatibility(selectedModel, provider, intent);
      } catch (error) {
        const normalized = normalizeProviderError(error, { provider, model });
        return res.status(normalized.statusCode).json(serializeProviderError(normalized, requestId));
      }

      if (baseUrl && !baseUrl.startsWith('http')) {
        baseUrl = 'https://' + baseUrl;
      }
      
      // For Gemini native calls via RouterHub/VectorEngine, we specifically need /v1beta
      if (baseUrl.includes('routerhub') || baseUrl.includes('vectorengine')) {
        if (!baseUrl.includes('/v1beta')) {
           if (baseUrl.includes('/v1')) {
              baseUrl = baseUrl.replace('/v1', '/v1beta');
           } else {
              baseUrl = baseUrl.replace(/\/+$/, '') + '/v1beta';
           }
        }
      }

      // === SYSTEM TRIGGER HOOK: LINEART TRANSFORM ===
      let dynamicImageControlStrength: number | undefined = undefined;
      let dynamicNegativePrompt: string | undefined = undefined;

      if (prompt && (prompt.includes('[SYSTEM_TRIGGER:LINEART_TRANSFORM]') || prompt.includes('[SYSTEM_TRIGGER:PATENT_ISOLATION]'))) {
        try {
          console.log("[Pipeline] 检测到高级系统钩子，自动触发 Stage 1 (多模态理解与高级逻辑推演)...");
          
          if (images.length === 0) {
             throw new Error("高级处理需要上传参考图片");
          }

          let stage1Instruction = '';
          let userPrompt = prompt;

          if (prompt.includes('[SYSTEM_TRIGGER:PATENT_ISOLATION]')) {
             stage1Instruction = `You are the Lead Industrial Furniture AI Analyst at MANWAH. Analyze the sketch or image.
- PATENT ISOLATION AND BACKGROUND PURGING (STRICT):
  1. If the prompt contains '[SYSTEM_TRIGGER:PATENT_ISOLATION]', it means the output is for official patent review. The background must be absolutely sterile and flat pure white (#FFFFFF).
  2. ANTI-FLOOR RULE: Explicitly forbid the engine from rendering a "floor", "ground plane", "horizon line", or "studio backdrops". The sofa must appear floating in a vacuum, grounded ONLY by microscopic ambient occlusion shadows strictly limited to the absolute bottom tip of the legs.
  3. NO ARTIFACTS OR ACCIDENTAL MORPHING: The industrial details—such as control panels, recliners, metal mechanisms, or logos—must be preserved down to the pixel level. Do NOT add decorative wrinkles, puffiness, or change button placements.
  4. Force keywords into Stage 2 prompt: "Product isolated on absolute pure white background #FFFFFF, commercial photography cut-out, sharp crisp edges, zero floor reflection, zero gray gradients, microscopic ambient occlusion contact shadow, untouched manufacturer hardware details."
Output ONLY the finalized premium English prompt for generating a photorealistic commercial render.`;
             userPrompt = prompt.replace('[SYSTEM_TRIGGER:PATENT_ISOLATION]', '').trim();
          } else {
             stage1Instruction = `You are the Lead Industrial Furniture AI Analyst at MANWAH. Analyze the sketch: freeze the exact seat count (e.g. 'Strictly 2-seater straight, NO sectional extension'), detect vertical seam lines for 'double-needle contrast stitching', and identify recliners/headrests.
- ABSOLUTE CAMERA PERSPECTIVE LOCK (STRICT):
  1. The camera viewpoint MUST strictly mimic the input sketch's exact 3/4 angled isometric/perspective view. 
  2. CRITICAL: Do NOT auto-correct or change the camera angle to a flat, centered straight-front view. The left armrest side profile must be visibly extruded and foreshortened in 3D depth as drawn.
  3. Force keywords into Stage 2 prompt: "Captured from a cinematic 3/4 angled perspective view, dynamic three-quarter studio product shot showing left armrest depth, angled sofa silhouette, perfect 3D depth forecasting."
- DETECT BACKREST CORNER DETAILS: If the sketch shows pointed folds, triangular lines, or ear-like protrusions at the top corners of the backrest (as seen in image_6ded06), it STRICTLY indicates premium "pinch-pleated tailored corners (pinched ears)" and "radiating natural cushion compression wrinkles". 
- You MUST force-inject these exact keywords into the output prompt: "distinct pinch-pleat tailoring on the upper corners of the backrest cushions, heavy organic vertical compression wrinkles along the back seams, ultra-plump volumetric filling". 
- NEVER let the generation engine smooth out these structural corners.
- ADAPTIVE SEAM SEMANTICS (RESET GLOBAL WEIGHTS):
  1. DO NOT force "upward/downward tufting curves" onto linear geometric designs.
  2. If the sketch features sharp, straight diagonal intersecting lines (as seen in image_904fa0), class it as "Modern Geometric Tech Style". 
  3. These lines must be rendered STRICTLY as "elegant, flush, double-needle contrast topstitching lines" (明车缝工艺) embedded on a taut, smooth leather panel, exactly like the pristine purple reference. 
  4. FORBID destructive deep puckering, crater-like tufting, or artificial leather blooming around these straight lines. Keep the cushion surfaces firm and tailored.
Output ONLY the finalized premium English prompt for generating a photorealistic commercial render.`;
             userPrompt = prompt.replace('[SYSTEM_TRIGGER:LINEART_TRANSFORM]', '').trim();
          }

          const stage1Url = `${baseUrl.replace(/\/+$/, '')}/models/gemini-2.5-flash:generateContent${provider === 'google' ? `?key=${apiKey}` : ''}`;
          
          const rawStage1Data = images[0]?.data || images[0]?.base64Data || images[0]?.url || '';
          const { cleanB64: cleanStage1B64, mimeType: stage1Mime } = await resolveImageToBase64(rawStage1Data);

          const stage1Payload = {
            systemInstruction: {
              parts: [{ text: stage1Instruction }]
            },
            contents: [
              {
                role: "user",
                parts: [
                  {
                    inlineData: {
                      mimeType: stage1Mime,
                      data: cleanStage1B64
                    }
                  },
                  { text: userPrompt }
                ]
              }
            ],
            generationConfig: { temperature: 0.2 }
          };

          const stage1Headers: any = { "Content-Type": "application/json" };
          if (provider === "routerhub" || provider === "vectorengine") {
             stage1Headers["Authorization"] = `Bearer ${apiKey}`;
          } else {
             stage1Headers["x-goog-api-key"] = apiKey;
          }

          const stage1Res = await fetch(stage1Url, {
            method: 'POST',
            headers: stage1Headers,
            body: JSON.stringify(stage1Payload)
          });

          if (stage1Res.ok) {
            const stage1Data = await stage1Res.json();
            const highPrecisionPrompt = stage1Data?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (highPrecisionPrompt) {
               prompt = highPrecisionPrompt.trim();
               console.log("[Pipeline] Stage 1 智能解构完成。生成的黄金提示词为:", prompt);
               dynamicImageControlStrength = 0.95;
               dynamicNegativePrompt = "sectional, corner sofa, extra seats, distorted mechanism, low-res leather";
            }
          } else {
             console.log("[Pipeline] Stage 1 请求失败，启动安全降级", await stage1Res.text());
          }
        } catch (stage1Err) {
          console.error("[Pipeline] 线稿转绘底层链路报错，启动安全降级:", stage1Err);
        }
      }
      // === END SYSTEM TRIGGER HOOK ===

      // 2. PRE-GENERATION QUOTA CHECK
      if (userUuid !== 'system') {
        const { data: profile } = await supabaseAdmin
          .from('profiles')
          .select('quota_limit, quota_used')
          .eq('id', userUuid)
          .single();

        if (profile) {
          const limit = profile.quota_limit || 0;
          const currentUsed = profile.quota_used || 0;
          const estimatedTokens = getImagePoints(model, resolution);

          if (limit > 0 && (limit - currentUsed) < estimatedTokens) {
             return res.status(402).json({ 
               error: '余额不足', 
               message: `本次操作按计划需 ${(estimatedTokens / 10000).toFixed(4)}W 额度，您的余额不足，请联系管理员充值。` 
             });
          }
        }
      }

      // Normalize legacy references, resolve internal object URLs locally, then
      // apply one security/metadata validation path before any Provider call.
      const materializedReferences = [];
      for (const reference of normalizedReferences) {
        if (reference.source.startsWith('/api/') || reference.source.startsWith('obj_')) {
          const internal = await resolveImageToBase64(reference.source);
          materializedReferences.push({
            ...reference,
            source: `data:${internal.mimeType};base64,${internal.cleanB64}`,
            declaredMimeType: internal.mimeType
          });
        } else {
          materializedReferences.push(reference);
        }
      }

      let resolvedReferenceImages: ResolvedImageReference[] = [];
      let resolvedMask: Awaited<ReturnType<typeof validateMask>> | undefined;
      try {
        resolvedReferenceImages = await resolveAndValidateImages(materializedReferences, String(prompt || ''));
        if (intent === 'image_edit' && resolvedReferenceImages.length === 0) {
          throw new ProviderError(
            '图像编辑请求未包含可用的参考图，已拒绝降级为文生图。',
            'invalid_image_input', 400, false, provider, model
          );
        }
        if (mask) resolvedMask = await validateMask(mask, resolvedReferenceImages[0]);
      } catch (error) {
        const normalized = normalizeProviderError(error, { provider, model });
        return res.status(normalized.statusCode).json(serializeProviderError(normalized, requestId));
      }

      // Gemini receives explicit role labels immediately before each image and
      // preserves the normalized reference order.
      const parts: any[] = [];
      for (let index = 0; index < resolvedReferenceImages.length; index++) {
        const image = resolvedReferenceImages[index];
        parts.push({ text: `[参考图${index + 1}｜${IMAGE_ROLE_LABELS[image.role]}${image.referenceAssetId ? `｜资产ID:${image.referenceAssetId}` : ''}]` });
        parts.push({ inlineData: { mimeType: image.mimeType, data: image.cleanB64 } });
      }
      parts.push({ text: prompt });

      const generationConfig: any = {};
      const imageConfig: any = {};

      if (aspectRatio && aspectRatio !== 'Auto') {
        imageConfig.aspectRatio = aspectRatio;
      }
      if (['512px', '1K', '2K', '4K'].includes(resolution)) {
        imageConfig.imageSize = resolution;
      }

      if (Object.keys(imageConfig).length > 0) {
        generationConfig.imageConfig = imageConfig;
      }

      if (seed !== undefined && seed !== null && !isNaN(Number(seed))) {
        generationConfig.seed = Number(seed);
      }

      const payload: any = {
        contents: [
          {
            role: "user",
            parts: parts
          }
        ]
      };

      generationConfig.responseModalities = ['TEXT', 'IMAGE'];
      payload.generationConfig = generationConfig;

      const headers: any = { 
        "Content-Type": "application/json",
      };
      
      if (provider === "routerhub" || provider === "vectorengine") {
         headers["Authorization"] = `Bearer ${apiKey}`;
         res.setHeader("X-Proxy-Provider", provider);
      } else {
         headers["x-goog-api-key"] = apiKey;
         res.setHeader("X-Proxy-Provider", "google");
      }

      const doFetch = async (currentBaseUrl: string, currentApiKey: string, currentProvider: string) => {
        const registeredModel = resolveImageModel(model, intent);
        assertProviderModelCompatibility(registeredModel, currentProvider, intent);
        const modelAdapter = getImageProviderAdapter(registeredModel);

        const executeRequestForModel = async () => {
          const finalModel = registeredModel.id;
          let targetUrl = modelAdapter.buildEndpoint(currentBaseUrl, registeredModel, intent);
          let reqPayload: any = payload;
          
          let isMultipart = false;
          let formData: FormData | null = null;
          
          // Handle standard OpenAI Images and the VectorEngine-only JSON multi-image protocol.
          const isOpenAI = registeredModel.transport !== 'gemini_native';
          if (isOpenAI) {
            let sizeStr = "1024x1024";
            if (size && typeof size === 'string' && (size.includes('x') || size === 'auto')) {
              sizeStr = size;
            } else {
              sizeStr = computeOpenAiImageSize(aspectRatio, resolution);
            }

            const imgQuality = quality || 'high';
            const imgFormat = output_format || format || (resolvedReferenceImages.length > 0 ? 'png' : 'jpeg');
            const bgVal = background || 'auto';
            const modVal = moderation || 'low';
            const roleManifest = buildImageRoleManifest(resolvedReferenceImages);
            const promptWithRoles = roleManifest ? `${prompt}\n\n[参考图角色与顺序] ${roleManifest}` : prompt;

            if (intent === 'image_edit' && registeredModel.transport === 'openai_images_json_multi') {
              const publicUrls = resolvedReferenceImages.map(image => image.publicUrl);
              if (publicUrls.some(url => !url)) {
                throw new ProviderError(
                  'gpt-image-2-all 专有协议只接受可公开访问的 HTTPS 图片 URL，不接受 Base64 或站内对象键。',
                  'invalid_image_input', 400, false, currentProvider, finalModel
                );
              }
              if (!modelAdapter.buildJsonPayload) {
                throw new ProviderError(
                  '当前 Provider Adapter 缺少 JSON 多图协议实现。',
                  'capability_unsupported', 500, false, currentProvider, finalModel
                );
              }
              reqPayload = modelAdapter.buildJsonPayload({
                model: finalModel,
                publicUrls: publicUrls as string[],
                prompt: promptWithRoles,
                size: sizeStr,
                aspectRatio: aspectRatio,
                quality: imgQuality,
                outputFormat: imgFormat,
                background: bgVal,
                moderation: modVal
              });
            } else if (intent === 'image_edit') {
              formData = new FormData();
              formData.append('model', finalModel);
              formData.append('prompt', promptWithRoles);
              formData.append('n', "1");
              formData.append('size', sizeStr);
              if (aspectRatio) {
                formData.append('aspect_ratio', aspectRatio);
                formData.append('aspectRatio', aspectRatio);
              }
              formData.append('quality', imgQuality);
              formData.append('output_format', imgFormat);
              if (bgVal) formData.append('background', bgVal);
              if (modVal) formData.append('moderation', modVal);

              if (resolvedMask) {
                formData.append('mask', new Blob([resolvedMask.buffer], { type: 'image/png' }), 'mask.png');
              }

              let appendedCount = 0;
              for (let idx = 0; idx < resolvedReferenceImages.length && idx < registeredModel.capabilities.maxInputImages; idx++) {
                const imgObj = resolvedReferenceImages[idx];
                const ext = imgObj.mimeType === 'image/jpeg' ? 'jpg' : (imgObj.mimeType === 'image/webp' ? 'webp' : 'png');
                const safeAsset = String(imgObj.referenceAssetId || idx + 1).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60);
                const blob = new Blob([imgObj.buffer], { type: imgObj.mimeType });
                formData.append('image', blob, `${String(idx + 1).padStart(2, '0')}_${imgObj.role}_${safeAsset}.${ext}`);
                appendedCount++;
              }

              if (appendedCount === 0) {
                throw new ProviderError(
                  '图像编辑请求的参考图无效，已拒绝降级为文生图。',
                  'invalid_image_input',
                  400,
                  false,
                  currentProvider,
                  finalModel
                );
              }
              isMultipart = true;
            }

            if (intent === 'text_to_image') {
              reqPayload = {
                model: finalModel,
                prompt: prompt,
                n: 1,
                size: sizeStr,
                aspect_ratio: aspectRatio,
                aspectRatio: aspectRatio,
                quality: imgQuality,
                output_format: imgFormat
              };
            }
          }

          if (currentProvider === "google") {
            targetUrl += `?key=${currentApiKey}`;
          }

          const fetchHeaders: any = {
            "Accept": "application/json"
          };
          
          if (!isMultipart) {
            fetchHeaders["Content-Type"] = "application/json";
          }
          
          if (currentProvider === "routerhub" || currentProvider === "vectorengine" || currentProvider === "openai") {
             fetchHeaders["Authorization"] = `Bearer ${currentApiKey}`;
          } else {
             fetchHeaders["x-goog-api-key"] = currentApiKey;
          }

          fileLog(`[OpenAI Proxy Debug] targetUrl: ${targetUrl}, isMultipart: ${isMultipart}`);

          const controller = new AbortController();
          const timeoutMs = 120000;
          const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

          let resObj;
          try {
            resObj = await fetch(targetUrl, {
              method: "POST",
              headers: fetchHeaders,
              body: isMultipart ? formData : JSON.stringify(reqPayload),
              signal: controller.signal
            });
          } catch (fetchErr: any) {
            clearTimeout(timeoutId);
            if (fetchErr.name === 'AbortError') {
               throw new ProviderError(
                 `上游请求在 ${Math.round(timeoutMs / 1000)} 秒后超时。`,
                 'timeout',
                 504,
                 true,
                 currentProvider,
                 finalModel
               );
            }
            throw fetchErr;
          }
          
          clearTimeout(timeoutId);

          fileLog(`[OpenAI Proxy Debug] upstream status: ${resObj.status}`);

          const text = await resObj.text();

          let data;
          try {
            data = JSON.parse(text);
          } catch (jsonErr) {
            throw new ProviderError(
              `上游返回了无法解析的响应（HTTP ${resObj.status}）。`,
              'invalid_upstream_response',
              502,
              false,
              currentProvider,
              finalModel,
              resObj.status
            );
          }

          if (!resObj.ok) {
            throw providerErrorFromStatus(
              resObj.status,
              data.error?.message || data.message || resObj.statusText || `上游错误 ${resObj.status}`,
              currentProvider,
              finalModel
            );
          }
          
          // Transform OpenAI response to Google format so frontend parses correctly
          if (isOpenAI) {
             const normalizedImages: Array<{ mimeType: string; data: string }> = [];
             for (const item of Array.isArray(data.data) ? data.data : []) {
               let imageData = item?.b64_json || item?.b64 || item?.base64 || item?.image || (typeof item === 'string' ? item : undefined);
               let mimeType = item?.mime_type || item?.mimeType || 'image/png';
               if (!imageData && item?.url) {
                 try {
                   const downloaded = await resolveAndValidateImage({
                     source: item.url,
                     role: 'style_reference',
                     order: 0
                   });
                   mimeType = downloaded.mimeType;
                   imageData = downloaded.cleanB64;
                 } catch (downloadError: any) {
                   throw new ProviderError(
                     `无法下载上游返回的图像：${downloadError.message}`,
                     'invalid_upstream_response',
                     502,
                     false,
                     currentProvider,
                     finalModel
                   );
                 }
               }
               if (typeof imageData === 'string') normalizedImages.push({ mimeType, data: imageData });
             }
             try {
               data = buildNormalizedImageResponse(normalizedImages, {
                 actualModel: finalModel,
                 provider: currentProvider,
                 providerRequestId: data.id || resObj.headers.get('x-request-id'),
                 usage: data.usage
               });
             } catch (error: any) {
               throw new ProviderError(
                 error.message,
                 'invalid_upstream_response',
                 502,
                 false,
                 currentProvider,
                 finalModel
               );
             }
          } else {
             try {
               data = normalizeGeminiImageResponse(data, {
                 actualModel: finalModel,
                 provider: currentProvider
               });
             } catch (error: any) {
               throw new ProviderError(
                 error.message,
                 'invalid_upstream_response',
                 502,
                 false,
                 currentProvider,
                 finalModel
               );
             }
          }

          return data;
        };

        const result = await executeRequestForModel();
        return { data: result, actualModel: registeredModel.id };
      };

      res.setHeader('Content-Type', 'application/json');
      res.flushHeaders?.();
      
      const heartbeatInterval = setInterval(() => {
         res.write(' ');
      }, 15000);

      try {
        let fetchResult;
        let actualModelUsed = model;
        let usedProvider = provider;
        const generateStartTime = Date.now();
        try {
          const fetchRes = await doFetch(baseUrl, apiKey!, provider);
          fetchResult = fetchRes.data;
          actualModelUsed = fetchRes.actualModel;
        } catch (initialErr: any) {
          const normalizedInitialError = normalizeProviderError(initialErr, { provider, model });
          const errMsg = normalizedInitialError.message;
          const isHybrid = routingMode === 2;
          const shouldFallback = ['timeout', 'rate_limited', 'upstream_unavailable'].includes(normalizedInitialError.category);

          if ((provider === 'vectorengine' || baseUrl.includes('vectorengine')) && (shouldFallback || (isHybrid && normalizedInitialError.retryable))) {
            const fallback = await getFallbackConfig(deptId, method1Key);

            if (fallback && fetchResult === undefined) {
              console.log(`[O&M: Fallback Activated] VectorEngine failed (${errMsg}). Retrying with fallback provider ${fallback.provider} (${fallback.baseUrl})...`);
              usedProvider = fallback.provider;
              try {
                const fetchRes = await doFetch(fallback.baseUrl, fallback.apiKey!, fallback.provider);
                fetchResult = fetchRes.data;
                actualModelUsed = fetchRes.actualModel;
              } catch (fallbackErr: any) {
                const normalizedFallbackError = normalizeProviderError(fallbackErr, { provider: fallback.provider, model });
                console.error(`[O&M: Fallback Failed] Fallback ${fallback.provider} also failed: ${normalizedFallbackError.message}`);
                throw normalizedFallbackError;
              }
            } else {
              console.error(`[O&M: Fallback Skipped] VectorEngine failed (${errMsg}) and no valid fallback API key was found.`);
              throw normalizedInitialError;
            }
          } else {
            console.error(`[O&M: Upstream Error] Provider ${provider} failed on ${baseUrl}: ${errMsg}`);
            throw normalizedInitialError;
          }
        }
        
        const generateEndTime = Date.now();
        const durationSec = ((generateEndTime - generateStartTime) / 1000).toFixed(1);

        if (!res.headersSent) {
          res.setHeader("X-Proxy-Provider", usedProvider);
        }

        // Validate image response success and structure before charging
        const isSuccessfulResponse = hasValidImages(fetchResult);

        let pointsDeducted = 0;
        // Billing Logic using consolidated helper - log failures as 0 points with clear warning tags
        if (userUuid && userUuid !== 'system' && (req.method==='POST')) {
          if (!isSuccessfulResponse) {
            pointsDeducted = 0;
            let errReason = "上游接口无返回或格式异常";
            if (fetchResult && fetchResult.error && fetchResult.error.message) {
              errReason = fetchResult.error.message;
            }
            if (errReason.length > 50) {
              errReason = errReason.substring(0, 47) + "...";
            }
            const providerMarker = `- [生图未成功 - ${errReason}] (耗时 ${durationSec}s)`;
            await chargeUser(userUuid, 0, actualModelUsed, resolution, deptId, 'image_generation', 0, 0, providerMarker);
            console.warn(`[Billing Logged] Failed image generation recorded as 0 points for user ${userUuid}.`);
          } else {
            pointsDeducted = getImagePoints(actualModelUsed, resolution);
            
            let providerMarker = `(耗时 ${durationSec}s)`;
            if (provider === 'vectorengine' && usedProvider === 'routerhub') {
               providerMarker = `- V转R (耗时 ${durationSec}s)`;
            } else if (usedProvider === 'vectorengine') {
               providerMarker = `- V (耗时 ${durationSec}s)`;
            } else if (usedProvider === 'routerhub') {
               providerMarker = `- R (耗时 ${durationSec}s)`;
            }
            await chargeUser(userUuid, pointsDeducted, actualModelUsed, resolution, deptId, 'image_generation', 0, 0, providerMarker);
          }
        }
        
        clearInterval(heartbeatInterval);

        // If the upstream didn't fail with an explicit error but did not return a valid image, supply a helpful error message
        if (!isSuccessfulResponse && fetchResult && !fetchResult.error) {
          fetchResult = {
            error: {
              message: "生图失败：上游接口未成功返回有效的图像数据（可能由于敏感词拦截 or 接口过载）。"
            }
          };
        }

        let cropRetentionRate = 100.0;
        let finalFitModeUsed = 'cover';

        // If we have a successful response, ensure the image is output with high-fidelity resolution and exact size.
        if (isSuccessfulResponse && fetchResult && fetchResult.candidates) {
          try {
            const candidates = fetchResult.candidates;
            for (const candidate of candidates) {
              if (candidate.content && candidate.content.parts) {
                for (const part of candidate.content.parts) {
                  if (part.inlineData && part.inlineData.data) {
                    const rawBuffer = Buffer.from(part.inlineData.data, 'base64');
                    const meta = await sharp(rawBuffer).metadata();
                    
                    // Match expected resolution target boundaries
                    let maxTargetDim = 1024;
                    if (resolution === '512px') maxTargetDim = 512;
                    else if (resolution === '2K') maxTargetDim = 2048;
                    else if (resolution === '4K') maxTargetDim = 4096;

                    if (meta.width && meta.height) {
                      const nativeRatio = meta.width / meta.height;

                      // Parse target ratio requested by the user
                      let targetRatio = nativeRatio;
                      if (targetWidth && targetHeight) {
                        targetRatio = targetWidth / targetHeight;
                      } else if (originalAspectRatio && originalAspectRatio !== 'Auto' && originalAspectRatio !== 'Custom') {
                        const parts = String(originalAspectRatio).split(':');
                        if (parts.length === 2) {
                          const tw = parseFloat(parts[0]);
                          const th = parseFloat(parts[1]);
                          if (!isNaN(tw) && !isNaN(th) && th > 0) {
                            targetRatio = tw / th;
                          }
                        }
                      } else if (aspectRatio && aspectRatio !== 'Auto' && aspectRatio !== 'Custom') {
                        const parts = String(aspectRatio).split(':');
                        if (parts.length === 2) {
                          const tw = parseFloat(parts[0]);
                          const th = parseFloat(parts[1]);
                          if (!isNaN(tw) && !isNaN(th) && th > 0) {
                            targetRatio = tw / th;
                          }
                        }
                      }

                      let finalW: number;
                      let finalH: number;

                      if (targetRatio >= 1) {
                        finalW = Math.max(meta.width, maxTargetDim);
                        finalH = Math.round(finalW / targetRatio);
                      } else {
                        finalH = Math.max(meta.height, maxTargetDim);
                        finalW = Math.round(finalH * targetRatio);
                      }

                      console.log(`[Sharp Engine] Rendering target aspect ratio (${targetRatio.toFixed(3)}) output: ${finalW}x${finalH} (Native ratio: ${nativeRatio.toFixed(3)}, Mode: ${resolution})`);

                      cropRetentionRate = 100;
                      finalFitModeUsed = 'target_proportional';

                      const resizedBuffer = await sharp(rawBuffer)
                        .resize(finalW, finalH, {
                          fit: 'cover',
                          position: 'center',
                          kernel: 'lanczos3'
                        })
                        .png({ compressionLevel: 1, force: true }) // Minimum compression for maximum quality
                        .toBuffer();
                      
                      part.inlineData.data = resizedBuffer.toString('base64');
                      part.inlineData.mimeType = 'image/png';
                    } else {
                      // Fallback: Even if metadata reading fails, output as PNG container without distortion
                      console.log(`[Sharp Engine] Preserving native size as lossless PNG fallback`);
                      const pngBuffer = await sharp(rawBuffer)
                        .png({ compressionLevel: 1, force: true })
                        .toBuffer();
                      part.inlineData.data = pngBuffer.toString('base64');
                      part.inlineData.mimeType = 'image/png';
                    }
                  }
                }
              }
            }
          } catch (resizeErr) {
            console.error("Failed to enhance target image resolution & quality:", resizeErr);
          }
          fetchResult.images = fetchResult.candidates.flatMap((candidate: any) =>
            (candidate?.content?.parts || [])
              .map((part: any) => part?.inlineData)
              .filter((image: any) => image?.data)
          );
        }

        res.write(JSON.stringify({ 
          ...fetchResult, 
          points_deducted: pointsDeducted, 
          actualModel: actualModelUsed,
          cropRetentionRate,
          finalFitModeUsed
        }));
        res.end();
      } catch (e: any) {
       console.error("API proxy error:", e);
       clearInterval(heartbeatInterval);
       if (e.code === 'EPIPE' || e.message?.includes('EPIPE')) return res.end();
       res.write(JSON.stringify(serializeProviderError(normalizeProviderError(e, { provider, model }), requestId)));
       res.end();
    }
  } catch (outerError: any) {
    console.error("Outer API proxy error:", outerError);
    if (!res.headersSent) {
      const requestId = (req.headers['x-request-id'] as string) || undefined;
      const normalized = normalizeProviderError(outerError);
      res.status(normalized.statusCode).json(serializeProviderError(normalized, requestId));
    }
  }
});


  // Mount modular admin and C4 routes
  app.use('/api/admin', adminRoutes);
  app.use('/api/projects', projectRoutes);
  app.use('/api/agent-runs', agentRoutes);
  app.use('/api/canvases', canvasRoutes);
  app.use('/api/creative-canvases', canvasRoutes);
  app.use('/api/asset-skus', assetRoutes);
  app.use('/api/asset-versions', assetRoutes);
  app.use('/api/product-dnas', productDnaRoutes);
  app.use('/api/product-dna-versions', productDnaRoutes);
  app.use('/api', copyRoutes);

  app.get('/api/ai/test-connection', async (req, res) => {
    const userUuid = req.headers['x-user-uuid'] as string;

    if (!userUuid) {
      return res.status(400).json({ status: 'error', message: '缺少 x-user-uuid 头信息' });
    }

    try {
      // 1. JWT Authentication and Role Validation
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ status: 'error', message: 'Unauthorized' });
      }
      const token = authHeader.split(' ')[1];
      const { data: { user: adminUser }, error: verifyError } = await supabaseAdmin.auth.getUser(token);
      if (verifyError || !adminUser) {
        return res.status(401).json({ status: 'error', message: 'Invalid token' });
      }

      const { data: adminProfile } = await supabaseAdmin
        .from('profiles')
        .select('role, dept_id')
        .eq('id', adminUser.id)
        .single();
        
      if (!adminProfile || (adminProfile.role !== 'admin' && adminProfile.role !== 'dept_admin')) {
         return res.status(403).json({ status: 'error', message: 'Forbidden' });
      }

      // 2. Validate Target User's Department
      const { data: targetUser } = await supabaseAdmin.from('profiles').select('dept_id').eq('id', userUuid).single();
      if (adminProfile.role === 'dept_admin' && adminProfile.dept_id !== targetUser?.dept_id) {
         return res.status(403).json({ status: 'error', message: '您无权测试其他部门的数据' });
      }

      // 3. 获取该用户的部门 API 配置
      const config = await getUserApiConfig(userUuid);
      if (!config || !config.department_configs?.api_key || 
          config.department_configs.api_key.includes('***') || 
          config.department_configs.api_key.includes('你的真实KEY') ||
          config.department_configs.api_key.trim() === '') {
        return res.status(404).json({ status: 'error', message: '未找到有效部门 API 配置' });
      }

      let baseUrl = config.department_configs.api_base_url || 'https://api.routerhub.ai';
      if (baseUrl && !baseUrl.startsWith('http')) {
        baseUrl = 'https://' + baseUrl;
      }

      let testUrl = '';
      const apiKey = config.department_configs.api_key;
      
      let testMethod = 'POST';
      let body: any = JSON.stringify({
         contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
         generationConfig: { maxOutputTokens: 1 }
      });

      // Construct a robust test URL for listing models or testing connection
      if (baseUrl.includes('routerhub') || baseUrl.includes('vectorengine')) {
        testUrl = baseUrl.replace(/\/v1beta\/?$/, '').replace(/\/v1\/?$/, '').replace(/\/+$/, '') + '/v1/models';
        testMethod = 'GET';
        body = undefined;
      } else if (baseUrl.includes('googleapis.com')) {
        testUrl = baseUrl.replace(/\/+$/, '') + '/v1beta/models/gemini-1.5-flash:generateContent';
        testUrl += `?key=${apiKey}`;
      } else {
        testUrl = baseUrl.replace(/\/+$/, '') + '/v1beta/models/gemini-1.5-flash:generateContent';
      }

      console.log(`[O&M: TestConnection] User: ${userUuid}, Provider: ${config.department_configs.dept_name}, Testing URL: ${testUrl}`);

      // 4. 发起一个极简的测试请求
      try {
        const fetchOptions: any = {
          method: testMethod,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            'x-goog-api-key': apiKey 
          }
        };
        if (body) {
          fetchOptions.body = body;
        }

        const testRes = await fetch(testUrl, fetchOptions);

        if (testRes.ok) {
          res.json({ 
            status: 'success', 
            deptName: config.department_configs.dept_name,
            message: '连接成功' 
          });
        } else {
          const errText = await testRes.text();
          console.warn(`[TestConnection] Failed. Status: ${testRes.status}, Response: ${errText.substring(0, 200)}`);
          
          let errStr = 'Key 无效或接口无响应';
          try {
            const errData = JSON.parse(errText);
            errStr = errData.error?.message || errData.message || errStr;
          } catch {
            if (testRes.status === 401) errStr = 'API Key 认证失败 (401)';
            if (testRes.status === 404) errStr = '接口路径未找到 (404)';
            if (testRes.status === 405) errStr = '请求方法不被允许 (405)';
          }
          
          res.status(200).json({ // Return 200 so the frontend can display the failed status nicely
            status: 'failed', 
            message: errStr
          });
        }
      } catch (fetchErr: any) {
        console.error(`[TestConnection] Fetch error:`, fetchErr);
        res.status(200).json({ 
          status: 'failed', 
          message: `网络无法连接: ${fetchErr.message}` 
        });
      }
    } catch (err) {
      console.error(err);
      res.status(500).json({ status: 'error', message: '服务器无法触达 API 地址' });
    }
  });

  // Generic proxy for standard GoogleGenAI frontend SDK requests
  app.use(['/v1beta', '/v1alpha', '/v1'], authenticateToken as any, async (req, res) => {
    // 简单获取传递来的请求模型信息为了记录日志
    const originalUrl = req.originalUrl;
    const modelMatch = originalUrl.match(/models\/([^\:]+)/);
    const model = modelMatch ? modelMatch[1] : 'unknown-model';
    
    // Use authenticated identity
    const user = (req as any).user;
    const userUuid = user.id;

    try {
      if (userUuid !== 'system') {
        const { data: profile } = await supabaseAdmin
          .from('profiles')
          .select('quota_limit, quota_used')
          .eq('id', userUuid)
          .single();

        if (profile) {
          const limit = profile.quota_limit || 0; 
          if ((profile.quota_used || 0) >= limit && limit > 0) {
             return res.status(403).json({ error: { message: "您的配额已耗尽，请联系管理员充值" } });
          }
        }
      }

      let { apiKey, baseUrl, deptId, provider, routingMode, method1Key } = await resolveApiConfig(userUuid);

      if (!isProviderKeyValid(apiKey)) {
        return res.status(401).json({ error: { message: "API Key is missing or invalid." } });
      }

      if (baseUrl && !baseUrl.startsWith('http')) {
        baseUrl = 'https://' + baseUrl;
      }
      
      // Remove /v1beta, /v1, etc since this proxy appends req.originalUrl (e.g. /v1beta/models/...)
      if (provider === "routerhub" || provider === "vectorengine" || baseUrl.includes('generative')) {
        baseUrl = baseUrl.replace(/\/v1beta\/?$/, '').replace(/\/v1\/?$/, '');
      }

      // Clean up the URL to replace the proxy key with the real key
      const urlObj = new URL(`${baseUrl.replace(/\/+$/, '')}${req.originalUrl}`);
      
      // Only set key in query for direct Google calls
      if (provider === "google") {
        urlObj.searchParams.set("key", apiKey as string);
      } else {
        // RouterHub & VectorEngine 使用 Authorization: Bearer <token> 头，必须删除 URL 中的 query key，防止上游误认为是 Google API Key
        urlObj.searchParams.delete("key");
      }
      
      const targetUrl = urlObj.toString();
      console.log(`[O&M: API Proxy] Provider: ${provider}, Model: ${model}, User: ${userUuid}, Target: ${targetUrl}`);
      
      const headers: any = {
        "Content-Type": req.headers["content-type"] || "application/json",
      };
      
      if (provider === "routerhub" || provider === "vectorengine") {
          headers["Authorization"] = `Bearer ${apiKey}`;
      } else {
          headers["x-goog-api-key"] = apiKey as string;
      }
      
      const fetchOptions: RequestInit = {
        method: req.method,
        headers
      };

      // 提取 prompt 文本，用于估算 token（如果需要）
      let requestBodyJson = null;

      if (req.method !== 'GET' && req.method !== 'HEAD') {
         // 注意：Express 的 req.body 已经是 parsed 对象 (由于 app.use(express.json()))
         requestBodyJson = req.body;
         fetchOptions.body = JSON.stringify(req.body);
      }

      // Timeout set to 45s for VectorEngine so it fails fast to trigger fallback, 120s for others
      const controller = new AbortController();
      const isVec = provider === 'vectorengine' || (baseUrl && baseUrl.includes('vectorengine'));
      const timeoutMs = isVec ? 45000 : 120000;
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      fetchOptions.signal = controller.signal;

      let response: Response;
      let usedProvider = provider;
      try {
        response = await fetch(targetUrl, fetchOptions);
        if (!response.ok && (provider === 'vectorengine' || baseUrl.includes('vectorengine'))) {
           // In Hybrid mode (routingMode === 2), we throw for ANY error (e.g. 401, 403, 404) to trigger fallback.
           // Otherwise only for 5xx or 429
           if (routingMode === 2 || response.status >= 500 || response.status === 429 || response.status === 401 || response.status === 400 || response.status === 404 || response.status === 402) {
               throw new Error(`VectorEngine Error Status: ${response.status}`);
           }
        }
      } catch (err: any) {
        if (provider === 'vectorengine' || baseUrl.includes('vectorengine')) {
            const fallback = await getFallbackConfig(deptId, method1Key);
            
            if (fallback) {
               usedProvider = fallback.provider;
               console.log(`[O&M: Text Fallback Activated] Retrying with ${fallback.provider} (${fallback.baseUrl}) fallback...`);
               
               let fallbackUrl = `${fallback.baseUrl.replace(/\/+$/, '')}${req.originalUrl}`;
               const fallbackHeaders: any = { ...headers };
               
               if (fallback.provider === 'google') {
                 fallbackHeaders["x-goog-api-key"] = fallback.apiKey;
                 delete fallbackHeaders["Authorization"];
                 if (!fallbackUrl.includes('key=')) {
                   fallbackUrl += (fallbackUrl.includes('?') ? '&' : '?') + `key=${fallback.apiKey}`;
                 }
               } else {
                 fallbackHeaders["Authorization"] = `Bearer ${fallback.apiKey}`;
                 delete fallbackHeaders["x-goog-api-key"];
               }
               
               const fbOptions: RequestInit = {
                   ...fetchOptions,
                   headers: fallbackHeaders
               };
               delete fbOptions.signal;
               
               response = await fetch(fallbackUrl, fbOptions);
            } else {
               clearTimeout(timeoutId);
               throw new Error(`VectorEngine 请求失败 (${err.message})，且未检测到有效的 RouterHub / Gemini 兜底 API 密钥。`);
            }
        } else {
            clearTimeout(timeoutId);
            throw err;
        }
      } finally {
        clearTimeout(timeoutId);
      }
      
      response.headers.forEach((value, key) => {
        if (!['content-encoding', 'transfer-encoding', 'content-length'].includes(key.toLowerCase())) {
          res.setHeader(key, value);
        }
      });
      res.setHeader("X-Proxy-Provider", usedProvider);
      res.status(response.status);
      
      // 流式/分块读取代理响应，并尝试从中截获 usageMetadata 
      // 这适用于 SSE 流
      if (response.body) {
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let promptTokens = 0;
          let candidateTokens = 0;
          let totalTokens = 0;
          let isAborted = false;

          req.on('close', () => {
            isAborted = true;
            reader.cancel().catch(() => {});
          });

          async function pump() {
            try {
              if (isAborted) return;
              const { done, value } = await reader.read();
              if (done) { 
                 if (!res.writableEnded) res.end(); 
                 
                 // Billing for chat using consolidated helper
                 if (userUuid && userUuid !== 'system' && req.method === 'POST') {
                    // Fallback estimation if usageMetadata was missed in chunks
                    if (totalTokens === 0) {
                       totalTokens = 1500; // estimated avg
                       promptTokens = 500;
                       candidateTokens = 1000;
                    }
                    
                    let providerMarker = '';
                    if (provider === 'vectorengine' && usedProvider === 'routerhub') {
                       providerMarker = '- V转R';
                    } else if (usedProvider === 'vectorengine') {
                       providerMarker = '- V';
                    } else if (usedProvider === 'routerhub') {
                       providerMarker = '- R';
                    }
                    
                    await chargeUser(userUuid, totalTokens, model, null, deptId, 'chat', promptTokens, candidateTokens, providerMarker);
                 }
                 return; 
              }
              
              const chunkStr = decoder.decode(value, { stream: true });
              
              // Robust parsing for usageMetadata in both normal and streaming JSON
              const pCountMatch = chunkStr.match(/"promptTokenCount"\s*:\s*(\d+)/);
              const cCountMatch = chunkStr.match(/"candidatesTokenCount"\s*:\s*(\d+)/);
              const tCountMatch = chunkStr.match(/"totalTokenCount"\s*:\s*(\d+)/);
              
              if (pCountMatch) promptTokens = parseInt(pCountMatch[1], 10);
              if (cCountMatch) candidateTokens = parseInt(cCountMatch[1], 10);
              if (tCountMatch) totalTokens = parseInt(tCountMatch[1], 10);
              
              if (!res.writableEnded) {
                res.write(value, (err) => {
                  if (err) {
                    reader.cancel().catch(() => {});
                  }
                });
                pump();
              }
            } catch (err: any) {
              console.error("Pump error:", err.message);
              if (!res.writableEnded && !isAborted) {
                res.status(500).json({ error: err.message });
              }
            }
          }
          pump();
      } else {
          if (!res.writableEnded) res.end();
      }
    } catch (err: any) {
      console.error("Generic proxy error:", err);
      if (err.code === 'EPIPE' || err.message?.includes('EPIPE')) {
        console.warn("Detected EPIPE in generic proxy: client closed connection.");
        return;
      }
      const requestId = (req.headers['x-request-id'] as string) || undefined;
      const normalized = normalizeProviderError(err, { model });
      res.status(normalized.statusCode).json(serializeProviderError(normalized, requestId));
    }
  });

  // 1. 404 handler for unmatched /api/* routes (preventing SPA fallback from returning HTML)
  app.use('/api', (req: express.Request, res: express.Response) => {
    return res.status(404).json({
      success: false,
      error: {
        code: 'API_ROUTE_NOT_FOUND',
        message: '请求的 API 路由不存在'
      }
    });
  });

  // 2. Four-parameter Express Error Middleware for runtime exceptions in API routes
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!req.path.startsWith('/api/')) {
      return next(err);
    }

    if (res.headersSent) {
      return next(err);
    }

    console.error('API Express Error:', err.message || err);

    const knownCode =
      typeof err?.code === 'string'
        ? err.code
        : 'API_INTERNAL_ERROR';

    const persistenceCodes = new Set([
      'CANVAS_PERSISTENCE_UNAVAILABLE',
      'AGENT_CANVAS_OWNERSHIP_READ_FAILED',
      'AGENT_CONVERSATION_LIST_FAILED',
      'AGENT_CONVERSATION_CREATE_FAILED',
      'SUPABASE_RUNTIME_CONFIG_MISSING'
    ]);

    const isPersistence = persistenceCodes.has(knownCode);
    const status = err.statusCode || err.status || (isPersistence ? 503 : 500);

    return res.status(status).json({
      success: false,
      error: {
        code: isPersistence ? 'CANVAS_PERSISTENCE_UNAVAILABLE' : knownCode,
        message: isPersistence
          ? '云端画布数据库不可用或表结构未初始化'
          : (err.message || 'API 服务处理请求失败')
      }
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production' && process.env.DISABLE_VITE !== 'true') {
    const vite = await createViteServer({
      server: { 
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR === 'true' ? false : undefined
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
  
  // Set long timeout for VectorEngine/Proxy requests
  server.timeout = 360000;
  server.headersTimeout = 365000;
  server.keepAliveTimeout = 360000;
}

startServer().catch((err) => {
  console.error("Fatal error starting server:", err);
  process.exit(1);
});
