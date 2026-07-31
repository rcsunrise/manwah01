import express from 'express';
import { createServer as createViteServer } from 'vite';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import sharp from 'sharp';
import fs from 'fs';
import { supabaseAdmin} from './src/lib/supabase';

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


async function getUserApiConfig(userId: string) {
  if (!userId || userId === 'system') return null;
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select(`
      dept_id,
      department_configs ( api_key, api_base_url, dept_name, routing_mode, method1_key )
    `)
    .eq('id', userId)
    .single();

  if (error || !data?.department_configs) return null;
  
  const department_configs = Array.isArray(data.department_configs) 
    ? data.department_configs[0] 
    : data.department_configs;

  return { ...data, department_configs };
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

function isValidImageResponse(fetchResult: any): boolean {
  if (!fetchResult) return false;
  if (fetchResult.error) return false;
  if (fetchResult.candidates && fetchResult.candidates.length > 0) {
    const firstCandidate = fetchResult.candidates[0];
    const content = firstCandidate?.content;
    if (content && content.parts && content.parts.length > 0) {
      for (const part of content.parts) {
        if (part.inlineData && part.inlineData.data) {
          // If the length of base64 data is greater than 100, we consider it a successfully generated image
          if (typeof part.inlineData.data === 'string' && part.inlineData.data.length > 100) {
            return true;
          }
        }
      }
    }
  }
  return false;
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

const authenticateRequest = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers.authorization;
  const xUserId = req.headers['x-user-id'] as string;
  
  // If we have a Bearer token, use it to get the real user identity
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
      if (!error && user) {
        (req as any).user = user;
        return next();
      }
    } catch (e) {
      console.error("Auth middleware error:", e);
    }
  }

  // Fallback to x-user-id for non-JWT requests (legacy/convenience)
  if (xUserId) {
    (req as any).user = { id: xUserId };
    return next();
  }

  (req as any).user = { id: 'system' };
  next();
};

const upload = multer({ storage: multer.memoryStorage() });

async function getGlobalApiConfig() {
  try {
    // 之前使用 admin_notes 抛了 single_row constraint 错误。现在全局配置也存放在全站系统部门中。
    const { data } = await supabaseAdmin.from('department_configs').select('api_base_url, api_key, routing_mode, method1_key').eq('dept_name', '全站系统').maybeSingle();
    if (data && data.api_key) {
      const activeProvider = (data.api_base_url || "").includes("vectorengine") ? "vectorengine" : "routerhub";
      return {
        apiKey: data.api_key,
        baseUrl: data.api_base_url,
        activeProvider,
        routingMode: data.routing_mode,
        method1Key: data.method1_key
      };
    }
  } catch (e) {
    console.warn("Failed to fetch global API config from department_configs", e);
  }
  return null;
}

async function resolveApiConfig(userUuid: string) {
  let apiKey = process.env.ROUTERHUB_API_KEY;
  let baseUrl = "https://api.routerhub.ai/v1beta";
  let deptId = null;
  let provider = 'routerhub';
  
  const isKeyInvalid = (key: string | undefined) => !key || key.includes('在这里填入') || key.includes('placeholder') || key.trim() === '';

  // 1. Check department config first
  if (userUuid !== 'system') {
    const configData = await getUserApiConfig(userUuid);
    if (configData && configData.department_configs?.api_key && !isKeyInvalid(configData.department_configs.api_key)) {
      deptId = configData.dept_id;
      return {
        apiKey: configData.department_configs.api_key,
        baseUrl: configData.department_configs.api_base_url || baseUrl,
        deptId,
        provider: (configData.department_configs.api_base_url || "").includes("vectorengine") ? "vectorengine" : "routerhub",
        routingMode: configData.department_configs.routing_mode,
        method1Key: configData.department_configs.method1_key
      };
    }
  }

  // 2. Check global API Config from admin_notes ID 2
  const globalConfig = await getGlobalApiConfig();
  if (globalConfig && globalConfig.apiKey && !isKeyInvalid(globalConfig.apiKey)) {
    return {
      apiKey: globalConfig.apiKey,
      baseUrl: globalConfig.baseUrl,
      deptId: null,
      provider: globalConfig.activeProvider,
      routingMode: globalConfig.routingMode,
      method1Key: globalConfig.method1Key
    };
  }

  // 3. Fallback to .env Defaults
  if (isKeyInvalid(apiKey) && !isKeyInvalid(process.env.GEMINI_API_KEY)) {
    return {
      apiKey: process.env.GEMINI_API_KEY,
      baseUrl: "https://generativelanguage.googleapis.com/v1beta",
      deptId: null,
      provider: 'google'
    };
  }

  return { apiKey, baseUrl, deptId, provider };
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json({ limit: '500mb' }));
  app.use(express.urlencoded({ limit: '500mb', extended: true }));
  app.use(authenticateRequest);

  // API Route for uploading mask and clean image
  app.post('/api/pre_process/mask', upload.fields([{ name: 'clean_image', maxCount: 1 }, { name: 'mask_image', maxCount: 1 }]), async (req, res) => {
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

  // API Route to proxy to API Gateway
  // Endpoint: /api/gateway/generate-image
  app.post('/api/gateway/generate-image', async (req, res) => {
    try {
      let { prompt, model = "google/gemini-3-pro-image-preview", aspectRatio = "1:1", images = [], resolution = "1K", seed } = req.body;
      const user = (req as any).user;
      const userUuid = user?.id || 'system';

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
      if (originalAspectRatio === 'Auto' && images && images.length > 0 && images[0]?.data) {
        try {
          const cleanB64 = images[0].data.includes(',') ? images[0].data.split(',')[1] : images[0].data;
          const firstImgBuffer = Buffer.from(cleanB64, 'base64');
          const meta = await sharp(firstImgBuffer).metadata();
          if (meta.width && meta.height) {
            targetWidth = meta.width;
            targetHeight = meta.height;
            console.log(`[Auto Aspect Ratio] Automatically detected reference image dimension: ${targetWidth}x${targetHeight}`);
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
      
      const isKeyInvalid = (key: string | undefined) => !key || key.includes('在这里填入') || key.includes('placeholder') || key.trim() === '';

      if (isKeyInvalid(apiKey)) {
        return res.status(401).json({ error: { message: "系统或所属部门未配置有效的 API KEY，请联系管理员在控制面板设置。" } });
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

          const stage1Url = `${baseUrl.replace(/\/+$/, '')}/models/gemini-3.1-pro-preview:generateContent${provider === 'google' ? `?key=${apiKey}` : ''}`;
          
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
                      mimeType: images[0].mimeType,
                      data: images[0].data
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

      // Typical Google AI format for generateContent
      const parts = [];
      if (images && images.length > 0) {
        for (const img of images) {
          parts.push({
            inlineData: {
              mimeType: img.mimeType,
              data: img.data
            }
          });
        }
      }
      parts.push({ text: prompt });

      const generationConfig: any = {
        outputFormat: "image/jpeg",
        // Pass standard aspect ratios or handle as needed
      };

      // Not all models support all parameters, but try to pass them safely
      generationConfig.imageConfig = {};
      if (aspectRatio && aspectRatio !== 'Auto') {
        generationConfig.imageConfig.aspectRatio = aspectRatio;
      }
      
      if (seed !== undefined) {
         generationConfig.seed = seed;
      }
      if (['512px', '1K', '2K', '4K'].includes(resolution)) {
         generationConfig.imageConfig.imageSize = resolution;
      }

      const payload = {
        contents: [
          {
            role: "user",
            parts: parts
          }
        ],
        generationConfig: generationConfig
      };

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
        let firstModelOption = model;
        let secondModelOption: string | null = null;

        // Determine if we have a stable vs preview fallback
        let cleanModel = firstModelOption;
        if (cleanModel.startsWith("google/")) {
          cleanModel = cleanModel.replace("google/", "");
        } else if (cleanModel.startsWith("openai/")) {
          cleanModel = cleanModel.replace("openai/", "");
        }

        if (cleanModel === 'gemini-3.1-flash-image') {
          secondModelOption = 'gemini-3.1-flash-image-preview';
        } else if (cleanModel === 'gemini-3-pro-image') {
          secondModelOption = 'gemini-3-pro-image-preview';
        } else if (cleanModel === 'google/gemini-3-pro-image') {
          secondModelOption = 'google/gemini-3-pro-image-preview';
        }

        const executeRequestForModel = async (tgtModel: string) => {
          let finalModel = tgtModel;
          if (finalModel.startsWith("google/")) {
            finalModel = finalModel.replace("google/", "");
          } else if (finalModel.startsWith("openai/")) {
            finalModel = finalModel.replace("openai/", "");
          }
          
          let targetUrl = `${currentBaseUrl.replace(/\/+$/, '')}/models/${finalModel}:generateContent`;
          let reqPayload: any = payload;
          
          let isMultipart = false;
          let formData: FormData | null = null;
          
          // Handle OpenAI format for VectorEngine/RouterHub
          const isOpenAI = finalModel.includes('gpt-image');
          if (isOpenAI) {
            let baseForOpenAI = currentBaseUrl.replace(/\/v1beta\/?$/, '').replace(/\/v1\/?$/, '').replace(/\/+$/, '');
            
            let sizeStr = "1024x1024";
            if (resolution === '2K' || resolution.toLowerCase() === '2k') {
               sizeStr = "2048x2048";
            } else if (resolution === '4K' || resolution.toLowerCase() === '4k') {
               sizeStr = "4096x4096";  
            }

            if (images && images.length > 0) {
              // Edit mode
              targetUrl = `${baseForOpenAI}/v1/images/edits`;
              isMultipart = true;
              formData = new FormData();
              formData.append('model', finalModel);
              formData.append('prompt', prompt);
              formData.append('n', "1");
              formData.append('size', sizeStr);
              
              // VectorEngine specific parameters
              if (resolution.toLowerCase() === '2k') {
                 formData.append('resolution', "2K"); 
              } else if (resolution.toLowerCase() === '4k') {
                 formData.append('resolution', "4K"); 
              }
              if (dynamicImageControlStrength !== undefined) formData.append('image_control_strength', String(dynamicImageControlStrength));
              if (dynamicNegativePrompt !== undefined) formData.append('negative_prompt', dynamicNegativePrompt);
              
              for (let i = 0; i < images.length; i++) {
                const img = images[i];
                const buffer = Buffer.from(img.data, 'base64');
                const blob = new Blob([buffer], { type: img.mimeType });
                
                formData.append('image', blob, `image${i}.png`);
                formData.append('file', blob, `image${i}.png`);
              }
            } else {
              // Generate mode
              targetUrl = `${baseForOpenAI}/v1/images/generations`;
              reqPayload = {
                 model: finalModel,
                 prompt: prompt,
                 n: 1,
                 size: sizeStr
              };
              
              if (resolution.toLowerCase() === '2k') {
                 reqPayload.resolution = "2K"; 
              } else if (resolution.toLowerCase() === '4k') {
                 reqPayload.resolution = "4K"; 
              }
              if (dynamicImageControlStrength !== undefined) reqPayload.image_control_strength = dynamicImageControlStrength;
              if (dynamicNegativePrompt !== undefined) reqPayload.negative_prompt = dynamicNegativePrompt;
            }
          }

          if (currentProvider === "google") {
            targetUrl += `?key=${currentApiKey}`;
          }

          const fetchHeaders: any = {};
          
          if (!isMultipart) {
            fetchHeaders["Content-Type"] = "application/json";
          }
          
          if (currentProvider === "routerhub" || currentProvider === "vectorengine") {
             fetchHeaders["Authorization"] = `Bearer ${currentApiKey}`;
          } else {
             fetchHeaders["x-goog-api-key"] = currentApiKey;
          }

          fileLog(`[OpenAI Proxy Debug] targetUrl: ${targetUrl}, isMultipart: ${isMultipart}`);

          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 300000);

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
               throw new Error(`Upstream error: timeout after 150 seconds`);
            }
            throw fetchErr;
          }
          
          clearTimeout(timeoutId);

          fileLog(`[OpenAI Proxy Debug] upstream status: ${resObj.status}`);

          const text = await resObj.text();
          fileLog(`[OpenAI Proxy Debug] fetched texts: ` + text.substring(0, 300));
          let data;
          try {
            data = JSON.parse(text);
          } catch (jsonErr) {
            if (resObj.status === 404) {
               throw new Error(`Upstream returned 404 (Not Found). Please check if the model "${tgtModel}" is supported by this endpoint.`);
            }
            throw new Error(`Invalid JSON response from upstream (${resObj.status}): ${text.substring(0, 100)}`);
          }

          if (!resObj.ok) {
            const errStatus = resObj.status;
            throw new Error(`[Status ${errStatus}] ` + (data.error?.message || resObj.statusText || `Upstream error ${resObj.status}`));
          }
          
          // Transform OpenAI response to Google format so frontend parses correctly
          if (isOpenAI) {
             let b64Data = data.data?.[0]?.b64_json;
             const imgUrl = data.data?.[0]?.url;
             
             if (!b64Data && imgUrl) {
                try {
                  const imgRes = await fetch(imgUrl);
                  const imgBuffer = await imgRes.arrayBuffer();
                  b64Data = Buffer.from(imgBuffer).toString('base64');
                } catch (e: any) {
                  throw new Error(`Failed to download image URL returned by API: ${e.message}`);
                }
             }
             
             if (!b64Data) {
                throw new Error(`OpenAI format response missing b64_json/url imageData. Data: ${JSON.stringify(data).substring(0, 500)}`);
             }
             data = {
               candidates: [
                 {
                   content: {
                     parts: [
                       {
                         inlineData: {
                           mimeType: "image/png",
                           data: b64Data
                         }
                       }
                     ]
                   }
                 }
               ]
             };
          }

          return data;
        };

        try {
          const res = await executeRequestForModel(firstModelOption);
          return { data: res, actualModel: firstModelOption };
        } catch (err: any) {
          const errMsg = err.message || "";
          if (secondModelOption && (errMsg.includes("404") || errMsg.includes("not found") || errMsg.includes("supported") || errMsg.includes("Status 404"))) {
             console.log(`[Proxy fallback] Model ${firstModelOption} not supported or 404. Falling back to key: ${secondModelOption}...`);
             try {
                const res = await executeRequestForModel(secondModelOption);
                return { data: res, actualModel: secondModelOption };
             } catch (fallbackErr: any) {
                throw new Error(`Original Model Error: ${errMsg}. Fallback Mode Option: ${secondModelOption} failed too: ${fallbackErr.message}`);
             }
          }
          throw err;
        }
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
          const fetchRes = await doFetch(baseUrl, apiKey, provider);
          fetchResult = fetchRes.data;
          actualModelUsed = fetchRes.actualModel;
        } catch (initialErr: any) {
          const errMsg = initialErr.message || "";
          // Determine if we should fallback from vectorengine to routerhub.
          // In Hybrid mode, we fallback on practically any error (timeout, 401, 500, etc).
          // Otherwise we only fallback on specific 5xx / timeout.
          const isHybrid = routingMode === 2;
          const shouldFallback = isHybrid || 
                                 errMsg.toLowerCase().includes('saturated') || 
                                 errMsg.includes('Upstream error 5') || 
                                 errMsg.includes('timeout') || 
                                 errMsg.includes('[Status 5') || 
                                 errMsg.includes('[Status 429') ||
                                 errMsg.includes('[Status 401') ||
                                 errMsg.includes('[Status 400') ||
                                 errMsg.includes('[Status 402');

          if ((provider === 'vectorengine' || baseUrl.includes('vectorengine')) && shouldFallback) {
            
            let fallbackKey = process.env.ROUTERHUB_API_KEY;
            
            // Priority 1: Hybrid Mode is enabled in department config (routing_mode === 2)
            if (routingMode === 2 && method1Key && typeof method1Key === 'string' && method1Key.trim() !== '') {
               fallbackKey = method1Key;
               console.log(`[O&M: Hybrid Mode Activated] VectorEngine failed, using Department Hybrid RouterHub Config...`);
            }
            // Priority 2: Fallback to Global RouterHub config
            else if (!fallbackKey) {
              const globalConfig = await getGlobalApiConfig();
              if (globalConfig) {
                 if (globalConfig.routingMode === 2 && globalConfig.method1Key) {
                    fallbackKey = globalConfig.method1Key;
                 } else if (globalConfig.apiKey && globalConfig.activeProvider === 'routerhub') {
                    fallbackKey = globalConfig.apiKey;
                 }
              }
            }

            if (fallbackKey && fetchResult === undefined) {
              console.log(`[O&M: Fallback] VectorEngine failed (${errMsg}). Retrying with RouterHub fallback...`);
              usedProvider = "routerhub";
              try {
                const fetchRes = await doFetch("https://api.routerhub.ai/v1beta", fallbackKey, "routerhub");
                fetchResult = fetchRes.data;
                actualModelUsed = fetchRes.actualModel;
              } catch (fallbackErr: any) {
                console.error(`[O&M: Fallback Failed] RouterHub fallback also failed: ${fallbackErr.message}`);
                throw new Error(`Primary API Error: ${errMsg}. Fallback API Error: ${fallbackErr.message}`);
              }
            } else {
              console.error(`[O&M: Fallback Skipped] VectorEngine failed but no valid RouterHub fallback key found. Msg: ${errMsg}`);
              throw initialErr;
            }
          } else {
            console.error(`[O&M: Upstream Error] Provider ${provider} failed on ${baseUrl}: ${errMsg}`);
            throw initialErr;
          }
        }
        
        const generateEndTime = Date.now();
        const durationSec = ((generateEndTime - generateStartTime) / 1000).toFixed(1);

        if (!res.headersSent) {
          res.setHeader("X-Proxy-Provider", usedProvider);
        }

        // Validate image response success and structure before charging
        const isSuccessfulResponse = isValidImageResponse(fetchResult);

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

                    let finalW = targetWidth;
                    let finalH = targetHeight;
                    
                    if (finalW && finalH) {
                      // Case A: Custom aspect ratio or Auto layout is specified.
                      // If the maximum dimension of the target is smaller than the requested resolution, upscale proportionally!
                      const currentMax = Math.max(finalW, finalH);
                      if (currentMax < maxTargetDim) {
                        const scaleScale = maxTargetDim / currentMax;
                        finalW = Math.round(finalW * scaleScale);
                        finalH = Math.round(finalH * scaleScale);
                        console.log(`[Sharp Engine] Custom boundary upscaled to match ${resolution} (${maxTargetDim}px): ${finalW}x${finalH} (factor: ${scaleScale.toFixed(2)}x)`);
                      }
                    } else if (meta.width && meta.height) {
                      // Case B: Standard aspect ratio. Scale native dimensions to requested resolution.
                      const currentNativeMax = Math.max(meta.width, meta.height);
                      if (currentNativeMax < maxTargetDim) {
                        const scaleScale = maxTargetDim / currentNativeMax;
                        finalW = Math.round(meta.width * scaleScale);
                        finalH = Math.round(meta.height * scaleScale);
                        console.log(`[Sharp Engine] Native boundary upscaled to match ${resolution} (${maxTargetDim}px): ${finalW}x${finalH} (factor: ${scaleScale.toFixed(2)}x)`);
                      } else {
                        // Keep current size if already at or larger than target resolution
                        finalW = meta.width;
                        finalH = meta.height;
                      }
                    }
                    
                    if (finalW && finalH) {
                      console.log(`[Sharp Engine] Rendering final high-fidelity upscale to: ${finalW}x${finalH} (Mode: ${resolution})`);
                      
                      let fitMode: 'cover' | 'fill' = 'cover';
                      let compressionPercent = 100;
                      if (meta.width && meta.height) {
                        const rGen = meta.width / meta.height;
                        const rTarget = finalW / finalH;
                        // Calculate percentage of the generated image kept under 'cover' (no-distortion cropping)
                        const coverKeptPercentage = Math.min(rGen / rTarget, rTarget / rGen) * 100;
                        compressionPercent = Math.round(coverKeptPercentage * 10) / 10;
                        console.log(`[Sharp Engine] 'cover' fit would keep ${compressionPercent}% of original generated content.`);
                        
                        // User requested to preserve at least 95% of original image output.
                        // If 'cover' crops more than 5% (kept < 95%), we switch to 'fill' to stretch slightly but guarantee 100% of generated content is preserved.
                        if (coverKeptPercentage < 95) {
                          fitMode = 'fill';
                          console.log(`[Sharp Engine] Keeping ${compressionPercent}% is below 95% threshold. Switching fit mode to 'fill' to preserve 100% of original generated content without cropping.`);
                          compressionPercent = 100;
                        }
                      }

                      cropRetentionRate = compressionPercent;
                      finalFitModeUsed = fitMode;

                      const resizedBuffer = await sharp(rawBuffer)
                        .resize(finalW, finalH, {
                          fit: fitMode,
                          position: 'center',
                          kernel: 'lanczos3'
                        })
                        .png({ compressionLevel: 1, force: true }) // Minimum compression to preserve file size logic and fast processing
                        .toBuffer();
                      
                      part.inlineData.data = resizedBuffer.toString('base64');
                      part.inlineData.mimeType = 'image/png';
                    } else {
                      // Fallback: Even if no resizing is possible, output as a premium PNG container to preserve detail losslessly
                      console.log(`[Sharp Engine] Preserving native size but outputting as premium PNG`);
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
       res.write(JSON.stringify({ error: { message: e.message } }));
       res.end();
    }
  } catch (outerError: any) {
    console.error("Outer API proxy error:", outerError);
    if (!res.headersSent) {
      res.status(500).json({ error: { message: outerError.message } });
    }
  }
});


  // API Route for Admin to test API connection
  app.post('/api/admin/test-connection', express.json(), async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const token = authHeader.split(' ')[1];
      const { data: { user: adminUser }, error: verifyError } = await supabaseAdmin.auth.getUser(token);
      if (verifyError || !adminUser) {
        return res.status(401).json({ error: 'Invalid token' });
      }
      
      const { data: adminProfile } = await supabaseAdmin.from('profiles').select('role').eq('id', adminUser.id).single();
      if (!adminProfile || (adminProfile.role !== 'admin' && adminProfile.role !== 'dept_admin')) {
         return res.status(403).json({ error: 'Forbidden' });
      }

      const { baseUrl, apiKey, provider } = req.body;
      if (!baseUrl || !apiKey) {
        return res.status(400).json({ success: false, message: "Missing baseUrl or apiKey" });
      }
      
      let targetUrl = `${baseUrl.replace(/\/+$/, '')}`;
      if (provider === "routerhub" || provider === "vectorengine" || targetUrl.includes('generative')) {
          targetUrl = targetUrl.replace(/\/v1beta\/?$/, '').replace(/\/v1\/?$/, '');
      }
      
      let testMethod = 'POST';
      let body: any = JSON.stringify({
         contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
         generationConfig: { maxOutputTokens: 1 }
      });
      
      if (provider === "routerhub" || provider === "vectorengine") {
          targetUrl += "/v1/models";
          testMethod = 'GET';
          body = undefined;
      } else {
          targetUrl += "/v1beta/models/gemini-1.5-flash:generateContent";
          if (provider === "google" || targetUrl.includes('generativelanguage.googleapis.com')) {
             targetUrl += `?key=${apiKey}`;
          }
      }
      
      const headers: any = {};
      if (testMethod !== 'GET') headers["Content-Type"] = "application/json";
      
      if (provider === "routerhub" || provider === "vectorengine") {
          headers["Authorization"] = `Bearer ${apiKey}`;
      } else {
          headers["x-goog-api-key"] = apiKey;
      }

      const fetchOptions: any = { headers, method: testMethod };
      if (body) fetchOptions.body = body;

      const response = await fetch(targetUrl, fetchOptions);
      if (!response.ok) {
          const errText = await response.text();
          let parsedErr = errText;
          try {
             let j = JSON.parse(errText);
             if (j.error && j.error.message) parsedErr = j.error.message;
          } catch(e) {}
          return res.status(200).json({ success: false, status: response.status, message: `(${response.status}) ${parsedErr.slice(0, 300)}` });
      }
      const data = await response.json();
      return res.json({ success: true, message: "通信测试成功" });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  // API Route to refund points for failed image generation
  app.post('/api/admin/refund-log', express.json(), async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const token = authHeader.split(' ')[1];
      const { data: { user: adminUser }, error: verifyError } = await supabaseAdmin.auth.getUser(token);
      if (verifyError || !adminUser) {
        return res.status(401).json({ error: 'Invalid token' });
      }

      // Check admin/dept_admin role
      const { data: adminProfile } = await supabaseAdmin
        .from('profiles')
        .select('role, dept_id')
        .eq('id', adminUser.id)
        .single();
        
      if (!adminProfile || (adminProfile.role !== 'admin' && adminProfile.role !== 'dept_admin')) {
        return res.status(403).json({ error: 'Forbidden: Requires admin or dept_admin' });
      }

      const { logId, comment = "生图失败，人工纠偏核减" } = req.body;
      if (!logId) {
        return res.status(400).json({ error: 'Missing logId' });
      }

      // 1. Fetch the usage log
      const { data: log, error: logError } = await supabaseAdmin
        .from('usage_logs')
        .select('*')
        .eq('id', logId)
        .single();

      if (logError || !log) {
        return res.status(404).json({ error: 'Log not found' });
      }

      // 2. Department isolation check for dept_admin
      if (adminProfile.role === 'dept_admin') {
        const { data: userProfile } = await supabaseAdmin
          .from('profiles')
          .select('dept_id')
          .eq('id', log.user_id)
          .single();

        if (!userProfile || userProfile.dept_id !== adminProfile.dept_id) {
          return res.status(403).json({ error: 'Forbidden: You can only refund users from your own department' });
        }
      }

      // 3. Double-refund prevention
      if (log.tokens_used <= 0) {
        return res.status(400).json({ error: 'This log has already been refunded or holds 0 points' });
      }

      // 4. Fetch user's current profile balance/use
      const { data: userProfile, error: profileError } = await supabaseAdmin
        .from('profiles')
        .select('quota_used, username')
        .eq('id', log.user_id)
        .single();

      if (profileError || !userProfile) {
        return res.status(404).json({ error: 'User profile not found' });
      }

      const refundPoints = log.tokens_used;
      const originUsed = userProfile.quota_used || 0;
      const targetUsed = Math.max(0, originUsed - refundPoints);

      // 5. Update user profile to deduct their quota_used
      const { error: profileUpdateError } = await supabaseAdmin
        .from('profiles')
        .update({ quota_used: targetUsed })
        .eq('id', log.user_id);

      if (profileUpdateError) {
        throw new Error(`Profile update failed: ${profileUpdateError.message}`);
      }

      // 6. Update usage log to set tokens_used and cost_usd to 0, and prepend a tag
      const updatedModelName = `[已核退-${comment}] ` + log.model;
      const { error: logUpdateError } = await supabaseAdmin
        .from('usage_logs')
        .update({
          tokens_used: 0,
          cost_usd: 0,
          model: updatedModelName.slice(0, 250) // prevent overflow if string is long
        })
        .eq('id', logId);

      if (logUpdateError) {
        // Rollback user balance if database update failed
        await supabaseAdmin.from('profiles').update({ quota_used: originUsed }).eq('id', log.user_id);
        throw new Error(`Usage log update failed: ${logUpdateError.message}`);
      }

      console.log(`[Billing Audit] Refunded user ${userProfile.username} (${log.user_id}) for log ${logId}: ${refundPoints} points refunded.`);

      return res.json({
        success: true,
        message: `成功退还 ${userProfile.username} ${refundPoints}点额度，已核回为 0 点。`,
        pointsReturned: refundPoints
      });

    } catch (err: any) {
      console.error("Refund endpoint failed:", err);
      return res.status(500).json({ error: err.message || 'Internal server error during refund' });
    }
  });

  // API Route for Admin or Dept Admin to create a user account
  app.post('/api/admin/create-user', async (req, res) => {
    try {
      // Extract Authorization header
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const token = authHeader.split(' ')[1];
      const { data: { user: adminUser }, error: verifyError } = await supabaseAdmin.auth.getUser(token);
      if (verifyError || !adminUser) {
        return res.status(401).json({ error: 'Invalid token' });
      }

      // Check admin/dept_admin role
      const { data: adminProfile } = await supabaseAdmin
        .from('profiles')
        .select('role, dept_id')
        .eq('id', adminUser.id)
        .single();
        
      if (!adminProfile || (adminProfile.role !== 'admin' && adminProfile.role !== 'dept_admin')) {
         return res.status(403).json({ error: 'Forbidden: Requires admin or dept_admin' });
      }

      const { employeeId, password, username, quotaLimit, dept_id } = req.body;

      if (!employeeId || !password) {
        return res.status(400).json({ error: 'Missing employeeId or password.' });
      }

      let targetDeptId = dept_id;
      if (adminProfile.role === 'dept_admin') {
         targetDeptId = adminProfile.dept_id; // lock to their department
      }

      // 1. Create auth user with Admin SDK
      const authResponse = await supabaseAdmin.auth.admin.createUser({
        email: `${employeeId}@manwah.com`, // using manwah.com as domain or yourcompany
        password: password,
        email_confirm: true 
      });

      if (authResponse.error) {
        return res.status(400).json({ error: authResponse.error.message });
      }

      // 2. The trigger creates the profile, we just need to update it with the extra info
      if (authResponse.data?.user?.id) {
        const updatePayload: any = { 
          employee_id: employeeId, 
          username: username || employeeId, 
          quota_limit: quotaLimit ? parseInt(quotaLimit) : 100000 
        };
        
        if (targetDeptId) {
           updatePayload.dept_id = targetDeptId;
        }

        const { error: profileError } = await supabaseAdmin
          .from('profiles')
          .update(updatePayload)
          .eq('id', authResponse.data.user.id);

        if (profileError) {
           console.error("Profile update error:", profileError);
           // Warning: non-fatal, but logged
        }
      }

      return res.status(200).json({ success: true, user: authResponse.data.user });
    } catch (e: any) {
      console.error("Create user error:", e);
      return res.status(500).json({ error: e.message });
    }
  });

  // API Route for Admin to reset a user's password
  app.post('/api/admin/reset-password', async (req, res) => {
    try {
      const { userId, newPassword } = req.body;

      if (!userId || !newPassword) {
        return res.status(400).json({ error: 'Missing userId or newPassword.' });
      }

      // Check admin status of requester via JWT
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const token = authHeader.split(' ')[1];
      const { data: { user: adminUser }, error: verifyError } = await supabaseAdmin.auth.getUser(token);
      if (verifyError || !adminUser) {
        return res.status(401).json({ error: 'Invalid token' });
      }
      
      const adminId = adminUser.id;
      const { data: adminProfile } = await supabaseAdmin
        .from('profiles')
        .select('role, dept_id')
        .eq('id', adminId)
        .single();
        
      if (!adminProfile || (adminProfile.role !== 'admin' && adminProfile.role !== 'dept_admin')) {
         return res.status(403).json({ error: 'Forbidden.' });
      }

      // If dept_admin, verify target user belongs to the same department
      if (adminProfile.role === 'dept_admin') {
        const { data: targetProfile } = await supabaseAdmin
          .from('profiles')
          .select('dept_id')
          .eq('id', userId)
          .single();
        
        if (!targetProfile || targetProfile.dept_id !== adminProfile.dept_id) {
          return res.status(403).json({ error: 'Forbidden: You can only manage users in your own department.' });
        }
      }

      const authResponse = await supabaseAdmin.auth.admin.updateUserById(userId, {
        password: newPassword
      });

      if (authResponse.error) {
        return res.status(400).json({ error: authResponse.error.message });
      }

      return res.status(200).json({ success: true });
    } catch (e: any) {
      console.error("Reset password error:", e);
      return res.status(500).json({ error: e.message });
    }
  });

  // API Route for Admin to delete a user
  app.delete('/api/admin/users/:userId', async (req, res) => {
    try {
      const { userId } = req.params;

      // Check admin status of requester via JWT
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const token = authHeader.split(' ')[1];
      const { data: { user: adminUser }, error: verifyError } = await supabaseAdmin.auth.getUser(token);
      if (verifyError || !adminUser) {
        return res.status(401).json({ error: 'Invalid token' });
      }
      
      const adminId = adminUser.id;
      const { data: adminProfile } = await supabaseAdmin
        .from('profiles')
        .select('role, dept_id')
        .eq('id', adminId)
        .single();
        
      if (!adminProfile || (adminProfile.role !== 'admin' && adminProfile.role !== 'dept_admin')) {
         return res.status(403).json({ error: 'Forbidden.' });
      }

      // If dept_admin, verify target user belongs to the same department
      if (adminProfile.role === 'dept_admin') {
        const { data: targetProfile } = await supabaseAdmin
          .from('profiles')
          .select('dept_id')
          .eq('id', userId)
          .single();
        
        if (!targetProfile || targetProfile.dept_id !== adminProfile.dept_id) {
          return res.status(403).json({ error: 'Forbidden: You can only delete users in your own department.' });
        }
      }

      // Delete the user from auth.users
      const authResponse = await supabaseAdmin.auth.admin.deleteUser(userId);

      if (authResponse.error) {
        return res.status(400).json({ error: authResponse.error.message });
      }
      
      // Delete from profiles
      await supabaseAdmin.from('profiles').delete().eq('id', userId);

      return res.status(200).json({ success: true });
    } catch (e: any) {
      console.error("Delete user error:", e);
      return res.status(500).json({ error: e.message });
    }
  });

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
  app.use(['/v1beta', '/v1alpha', '/v1'], async (req, res) => {
    // 简单获取传递来的请求模型信息为了记录日志
    const originalUrl = req.originalUrl;
    const modelMatch = originalUrl.match(/models\/([^\:]+)/);
    const model = modelMatch ? modelMatch[1] : 'unknown-model';
    
    // Use authenticated identity
    const user = (req as any).user;
    const userUuid = user?.id || 'system';

    try {
      const isKeyInvalid = (key: string | undefined) => !key || key.includes('在这里填入') || key.includes('placeholder') || key.trim() === '';

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

      if (isKeyInvalid(apiKey)) {
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

      // Timeout explicitly set to 150 seconds for VectorEngine as requested
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 300000);
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
            let fallbackKey = process.env.ROUTERHUB_API_KEY;
            
            if (routingMode === 2 && method1Key && typeof method1Key === 'string' && method1Key.trim() !== '') {
               fallbackKey = method1Key;
               console.log(`[O&M: Text Hybrid Mode Activated] VectorEngine failed or timed out: ${err.message}. Retrying with Dept Hybrid RouterHub...`);
            } else if (!fallbackKey) {
               const globalConfig = await getGlobalApiConfig();
               if (globalConfig) {
                  if (globalConfig.routingMode === 2 && globalConfig.method1Key) {
                     fallbackKey = globalConfig.method1Key;
                  } else if (globalConfig.apiKey && globalConfig.activeProvider === 'routerhub') {
                     fallbackKey = globalConfig.apiKey;
                  }
               }
            }
            
            if (fallbackKey) {
               usedProvider = "routerhub";
               console.log(`[O&M: Text Fallback] Retrying with RouterHub standard fallback...`);
               
               // Construct fallback RouterHub URL
               const fallbackUrlObj = new URL(`https://api.routerhub.ai${req.originalUrl}`);
               
               // Replace Headers
               const fallbackHeaders = { ...headers, "Authorization": `Bearer ${fallbackKey}` };
               delete fallbackHeaders["x-goog-api-key"];
               
               const fbOptions: RequestInit = {
                   ...fetchOptions,
                   headers: fallbackHeaders
               };
               delete fbOptions.signal; // Optionally remove or reset signal for fallback
               
               response = await fetch(fallbackUrlObj.toString(), fbOptions);
            } else {
               clearTimeout(timeoutId);
               throw err;
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
      res.setHeader("X-Proxy-Provider", baseUrl.includes("routerhub") ? "routerhub" : "google");
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
      res.status(500).json({ error: err.message });
    }
  });

  // Global Error Handler to catch things like payload size exceeded (413) and ensure JSON response
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error("Express App Error:", err.message || err);
    if (res.headersSent) return next(err);
    const status = err.status || 500;
    res.status(status).json({ 
      error: status === 413 ? "Payload Too Large: The image is too large." : "Server Error", 
      message: err.message 
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
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
  server.timeout = 300000;
  server.keepAliveTimeout = 300000;
}

startServer();
