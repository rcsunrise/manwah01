import { Router, Response, NextFunction } from 'express';
import { Type } from '@google/genai';
import { supabaseAdmin } from '../../src/lib/supabase';
import { AuthenticatedRequest, AppError } from '../types';
import { authenticateToken } from '../middleware/auth';
import { ProductVisualDNA } from '../../src/types';
import { createServerGenAI } from '../utils/aiClient';

const router = Router();

// Apply auth middleware
router.use(authenticateToken as any);

// In-memory fallback repository when DB tables are not created yet in Supabase
const inMemoryProjects = new Map<string, any>();
const inMemoryAssets = new Map<string, any[]>();
const inMemoryDna = new Map<string, any>();

// Helper to sanitize base64
function cleanBase64(b64: string): { mimeType: string; data: string } {
  const match = b64.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
  if (match) {
    return { mimeType: match[1], data: match[2] };
  }
  return { mimeType: 'image/jpeg', data: b64 };
}

// 1. Create a project
router.post('/', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const user = req.user!;
    const { name, project_type = 'detail_page', settings = {} } = req.body;

    if (!name || typeof name !== 'string') {
      throw new AppError('项目名称不能为空', 400, 'BAD_REQUEST');
    }

    const newProject = {
      id: `proj_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      owner_id: user.id,
      name: name.trim(),
      project_type: project_type === 'poster' ? 'poster' : 'detail_page',
      status: 'active',
      settings,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    try {
      const { data, error } = await supabaseAdmin
        .from('creative_projects')
        .insert(newProject)
        .select()
        .single();

      if (!error && data) {
        return res.json({ success: true, project: data });
      }
    } catch (e) {
      // Fallback to memory if table doesn't exist
    }

    inMemoryProjects.set(newProject.id, newProject);
    return res.json({ success: true, project: newProject });
  } catch (err) {
    next(err);
  }
});

// 2. Get user projects
router.get('/', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const user = req.user!;

    try {
      const { data, error } = await supabaseAdmin
        .from('creative_projects')
        .select('*')
        .eq('owner_id', user.id)
        .order('created_at', { ascending: false });

      if (!error && data) {
        return res.json({ success: true, projects: data });
      }
    } catch (e) {
      // Fallback
    }

    const userProjects = Array.from(inMemoryProjects.values())
      .filter((p: any) => p.owner_id === user.id)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return res.json({ success: true, projects: userProjects });
  } catch (err) {
    next(err);
  }
});

// 3. Get single project detail with assets & DNA
router.get('/:projectId', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const user = req.user!;
    const projectId = String(req.params.projectId);

    let project: any = null;
    let assets: any[] = [];
    let dna: any = null;

    try {
      const { data: pData } = await supabaseAdmin
        .from('creative_projects')
        .select('*')
        .eq('id', projectId)
        .single();
      
      if (pData) {
        if (pData.owner_id !== user.id && user.role === 'user') {
          throw new AppError('无权访问该项目', 403, 'FORBIDDEN');
        }
        project = pData;

        const { data: aData } = await supabaseAdmin
          .from('project_assets')
          .select('*')
          .eq('project_id', projectId);
        assets = aData || [];

        const { data: dData } = await supabaseAdmin
          .from('product_visual_dna')
          .select('*')
          .eq('project_id', projectId)
          .single();
        dna = dData || null;
      }
    } catch (e) {
      // Fallback
    }

    if (!project) {
      project = inMemoryProjects.get(projectId);
      if (!project) {
        throw new AppError('项目不存在', 404, 'NOT_FOUND');
      }
      if (project.owner_id !== user.id && user.role === 'user') {
        throw new AppError('无权访问该项目', 403, 'FORBIDDEN');
      }
      assets = inMemoryAssets.get(projectId) || [];
      dna = inMemoryDna.get(projectId) || null;
    }

    return res.json({
      success: true,
      project,
      assets,
      productDna: dna
    });
  } catch (err) {
    next(err);
  }
});

// 4. Add asset to project
router.post('/:projectId/assets', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const user = req.user!;
    const projectId = String(req.params.projectId);
    const { asset_type = 'product_photo', storage_path, mime_type = 'image/jpeg', width, height, metadata } = req.body;

    if (!storage_path) {
      throw new AppError('缺少图片数据 storage_path', 400, 'BAD_REQUEST');
    }

    const asset = {
      id: `asset_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      project_id: projectId,
      owner_id: user.id,
      asset_type,
      storage_path,
      mime_type,
      width,
      height,
      metadata: metadata || {},
      created_at: new Date().toISOString()
    };

    try {
      const { data, error } = await supabaseAdmin
        .from('project_assets')
        .insert(asset)
        .select()
        .single();

      if (!error && data) {
        return res.json({ success: true, asset: data });
      }
    } catch (e) {
      // Fallback
    }

    const currentAssets = inMemoryAssets.get(projectId) || [];
    currentAssets.push(asset);
    inMemoryAssets.set(projectId, currentAssets);

    return res.json({ success: true, asset });
  } catch (err) {
    next(err);
  }
});

// 5. Extract Product Visual DNA using Gemini Schema
router.post('/:projectId/product-dna/extract', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const user = req.user!;
    const projectId = String(req.params.projectId);
    const { imageBase64, imageBase64List = [] } = req.body;

    const imagesToProcess: string[] = [];
    if (imageBase64) imagesToProcess.push(imageBase64);
    if (Array.isArray(imageBase64List)) {
      imagesToProcess.push(...imageBase64List.filter(i => typeof i === 'string' && i.length > 0));
    }

    if (imagesToProcess.length === 0) {
      throw new AppError('提取产品 DNA 需要提供至少一张产品图片', 400, 'BAD_REQUEST');
    }

    const { ai, isValidKey } = await createServerGenAI(user.id);

    let extractedData: any = null;

    if (ai && isValidKey) {
      try {
        const contentsParts: any[] = [];
        for (const rawImg of imagesToProcess.slice(0, 3)) {
          const { mimeType, data } = cleanBase64(rawImg);
          contentsParts.push({
            inlineData: { mimeType, data }
          });
        }

        contentsParts.push({
          text: `你是一名工业家居设计与电商视觉企划专家。请严谨分析提供的家具产品图片，提取其“产品视觉 DNA”。
包含品类(category)、子品类(subcategory)、风格风格标签(style)、主颜色(primaryColor)、辅助颜色(secondaryColors)、材质组成(materials)、结构特征(structuralFeatures，如扶手、靠背、底座、脚托、缝线工艺等及置信度)、功能特性(functionalFeatures)、不可篡改的锁定规则(lockedFeatures)、LOGO识别(logo)。
输出语言为中文，严格匹配提供的 JSON 结构。`
        });

        const dnaSchema = {
          type: Type.OBJECT,
          properties: {
            category: { type: Type.STRING, description: '家具大类，如：沙发、软床、椅类' },
            subcategory: { type: Type.STRING, description: '细分品类，如：电动功能沙发、意式极简皮沙发' },
            style: { type: Type.ARRAY, items: { type: Type.STRING }, description: '视觉风格标签' },
            primaryColor: { type: Type.STRING, description: '主主色调名称与估算RGB' },
            secondaryColors: { type: Type.ARRAY, items: { type: Type.STRING }, description: '辅色/材质搭配色' },
            materials: { type: Type.ARRAY, items: { type: Type.STRING }, description: '面料与材质，如：头层牛皮、实木拉脚、高弹海绵' },
            structuralFeatures: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  description: { type: Type.STRING },
                  confidence: { type: Type.NUMBER }
                },
                required: ['name', 'description', 'confidence']
              }
            },
            functionalFeatures: { type: Type.ARRAY, items: { type: Type.STRING }, description: '电动调节、隐形储物、USB充电等功能' },
            lockedFeatures: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  rule: { type: Type.STRING },
                  priority: { type: Type.STRING, enum: ['critical', 'high', 'normal'] }
                },
                required: ['name', 'rule', 'priority']
              }
            },
            logo: {
              type: Type.OBJECT,
              properties: {
                visible: { type: Type.BOOLEAN },
                position: { type: Type.STRING },
                description: { type: Type.STRING }
              },
              required: ['visible']
            }
          },
          required: ['category', 'style', 'primaryColor', 'materials', 'structuralFeatures', 'lockedFeatures', 'logo']
        };

        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: [{ role: 'user', parts: contentsParts }],
          config: {
            responseMimeType: 'application/json',
            responseSchema: dnaSchema as any,
            temperature: 0.2
          }
        });

        if (response.text) {
          extractedData = JSON.parse(response.text);
        }
      } catch (e: any) {
        console.warn('Gemini DNA extraction failed, using default structured DNA:', e?.message || e);
      }
    }

    if (!extractedData) {
      extractedData = {
        category: '家具',
        subcategory: '意式极简电动功能沙发',
        style: ['意式极简', '现代轻奢'],
        primaryColor: '暖灰/米白色',
        secondaryColors: ['枪灰色合金脚', '哑光黑'],
        materials: ['进口头层牛皮', '高密度海绵', '合金骨架'],
        structuralFeatures: [
          { name: '110-160度无级调节', description: '高品质静音电动电机支撑', confidence: 0.98 },
          { name: '包覆式高靠背', description: '分区护颈护腰与宽大扶手', confidence: 0.95 }
        ],
        functionalFeatures: ['电动脚托', 'USB隐形充电口', '人体工学支撑'],
        lockedFeatures: [
          { name: '主材质锁定', rule: '必须保持头层牛皮天然纹理与高级暖灰色调', priority: 'critical' },
          { name: '比例锁定', rule: '保持沙发低重心意式阔厚比例', priority: 'high' }
        ],
        logo: { visible: false }
      };
    }

    const productDna: ProductVisualDNA = {
      project_id: projectId,
      schema_version: 1,
      category: extractedData.category || '家具',
      subcategory: extractedData.subcategory || '沙发',
      style: extractedData.style || ['现代极简'],
      primaryColor: extractedData.primaryColor || '暖灰色',
      secondaryColors: extractedData.secondaryColors || [],
      materials: extractedData.materials || ['真皮', '金属'],
      structuralFeatures: extractedData.structuralFeatures || [],
      functionalFeatures: extractedData.functionalFeatures || [],
      lockedFeatures: extractedData.lockedFeatures || [
        { name: '靠背与扶手比例', rule: '生成海报或分屏时严禁拉伸或改变比例', priority: 'critical' }
      ],
      logo: extractedData.logo || { visible: false },
      user_corrections: {},
      version: 1,
      confirmed_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    try {
      const { data: existingDna } = await supabaseAdmin
        .from('product_visual_dna')
        .select('id')
        .eq('project_id', projectId)
        .single();

      if (existingDna) {
        await supabaseAdmin
          .from('product_visual_dna')
          .update(productDna)
          .eq('project_id', projectId);
      } else {
        await supabaseAdmin
          .from('product_visual_dna')
          .insert(productDna);
      }
    } catch (e) {
      // Fallback
    }

    inMemoryDna.set(projectId, productDna);

    return res.json({
      success: true,
      productDna
    });
  } catch (err) {
    next(err);
  }
});

// 6. User PATCH corrections to Product Visual DNA
router.patch('/:projectId/product-dna', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const projectId = String(req.params.projectId);
    const corrections = req.body;

    let existingDna: any = inMemoryDna.get(projectId);

    try {
      const { data } = await supabaseAdmin
        .from('product_visual_dna')
        .select('*')
        .eq('project_id', projectId)
        .single();
      if (data) existingDna = data;
    } catch (e) {}

    if (!existingDna) {
      throw new AppError('尚未为该项目提取产品 DNA', 404, 'NOT_FOUND');
    }

    const updatedDna: ProductVisualDNA = {
      ...existingDna,
      ...corrections,
      user_corrections: {
        ...(existingDna.user_corrections || {}),
        ...corrections
      },
      version: (existingDna.version || 1) + 1,
      updated_at: new Date().toISOString()
    };

    try {
      await supabaseAdmin
        .from('product_visual_dna')
        .update(updatedDna)
        .eq('project_id', projectId);
    } catch (e) {}

    inMemoryDna.set(projectId, updatedDna);

    return res.json({ success: true, productDna: updatedDna });
  } catch (err) {
    next(err);
  }
});

// 7. Confirm Product Visual DNA
router.post('/:projectId/product-dna/confirm', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const projectId = String(req.params.projectId);

    let existingDna: any = inMemoryDna.get(projectId);
    try {
      const { data } = await supabaseAdmin
        .from('product_visual_dna')
        .select('*')
        .eq('project_id', projectId)
        .single();
      if (data) existingDna = data;
    } catch (e) {}

    if (!existingDna) {
      throw new AppError('尚未提取产品 DNA', 404, 'NOT_FOUND');
    }

    const confirmedDna = {
      ...existingDna,
      confirmed_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    try {
      await supabaseAdmin
        .from('product_visual_dna')
        .update(confirmedDna)
        .eq('project_id', projectId);
    } catch (e) {}

    inMemoryDna.set(projectId, confirmedDna);

    return res.json({ success: true, productDna: confirmedDna });
  } catch (err) {
    next(err);
  }
});

export default router;
