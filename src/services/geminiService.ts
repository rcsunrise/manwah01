import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";
import { UIAspRatioOption, ImageAttachment, Resolution, ModelType, SupportedAspectRatio, AEPData } from "../types";
import { PHY_MAPPINGS } from "../constants";
import { supabase } from "../lib/supabase";

const MAX_RETRIES = 3;

/**
 * Gets the current user's ID to be sent in the x-user-id header 
 * for token accounting proxy endpoint.
 */
export const getUserId = async () => {
    try {
      const { data } = await supabase.auth.getSession();
      return data?.session?.user?.id || 'system';
    } catch (e) {
      return 'system';
    }
}

export const getUserAuthHeader = async () => {
    try {
      const { data } = await supabase.auth.getSession();
      if (data?.session?.access_token) {
        return `Bearer ${data.session.access_token}`;
      }
      return null;
    } catch (e) {
      return null;
    }
}

const createGenAIClient = async (onLog?: (msg: string) => void) => {
  const dummyOrRealKey = process.env.ROUTERHUB_API_KEY || process.env.GEMINI_API_KEY || process.env.API_KEY || "proxy-key";
  const userId = await getUserId();
  const authHeader = await getUserAuthHeader();
  
  const headers: any = {
    'x-user-id': userId
  };
  if (authHeader) {
    headers['Authorization'] = authHeader;
  }
  
  return new GoogleGenAI({ 
    apiKey: dummyOrRealKey,
    httpOptions: { 
      baseUrl: window.location.origin,
      headers,
      timeout: 300000
    } 
  });
};

// Define the aspect ratios explicitly supported by the Gemini API's imageConfig
const API_SUPPORTED_ASPECT_RATIOS = new Set<SupportedAspectRatio>([
  '1:1', '1:4', '1:8', '2:3', '3:2', '3:4', '4:1', '4:3', '4:5', '5:4', '8:1', '9:16', '16:9', '21:9'
]);

/**
 * Helper: Compress image for faster recognition/analysis
 * Reduces dimensions to max 1024px and uses JPEG 0.7 quality.
 * This significantly improves upload speed and processing latency for the assistant.
 */
const compressImageForAnalysis = (base64Str: string, maxWidth = 1024, quality = 0.7): Promise<string> => {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') {
      resolve(base64Str); // Server-side guard
      return;
    }
    const img = new Image();
    const prefix = base64Str.startsWith('data:') ? '' : 'data:image/png;base64,';
    img.src = `${prefix}${base64Str}`;
    img.onload = () => {
      let { width, height } = img;
      
      // If image is already small enough, skip compression
      if (width <= maxWidth && height <= maxWidth) {
        resolve(base64Str);
        return;
      }

      // Calculate new dimensions maintaining aspect ratio
      if (width > height) {
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
      } else {
        if (height > maxWidth) {
          width = Math.round((width * maxWidth) / height);
          height = maxWidth;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(base64Str);
        return;
      }
      
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      // toDataURL returns "data:image/jpeg;base64,..." - split to get raw base64
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      resolve(dataUrl.split(',')[1]);
    };
    img.onerror = () => resolve(base64Str);
  });
};

const compositeImageWithOverlay = (base64Str: string, overlayBase64Str: string, maxWidth = 1024, quality = 0.7): Promise<string> => {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') {
      resolve(base64Str);
      return;
    }
    const img = new Image();
    const prefix = base64Str.startsWith('data:') ? '' : 'data:image/png;base64,';
    img.src = `${prefix}${base64Str}`;
    img.onload = () => {
      let { width, height } = img;
      
      const overlayimg = new Image();
      overlayimg.src = overlayBase64Str.startsWith('data:') ? overlayBase64Str : `data:image/png;base64,${overlayBase64Str}`;
      overlayimg.onload = () => {
        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxWidth) {
            width = Math.round((width * maxWidth) / height);
            height = maxWidth;
          }
        }
        
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(base64Str);
          return;
        }
        
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        ctx.drawImage(overlayimg, 0, 0, width, height);
        
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl.split(',')[1]);
      };
      overlayimg.onerror = () => resolve(base64Str);
    };
    img.onerror = () => resolve(base64Str);
  });
};

export const generateVideo = async (
  prompt: string,
  image: ImageAttachment,
  aspectRatio: '16:9' | '9:16',
  onLog: (message: string) => void
): Promise<string> => {
  const ai = await createGenAIClient(onLog);
  onLog("Starting video generation with Veo...");

  try {
    let operation = await ai.models.generateVideos({
      model: 'veo-3.1-fast-generate-preview',
      prompt: prompt || 'A high quality video of this scene',
      image: {
        imageBytes: image.base64Data,
        mimeType: image.file.type || 'image/jpeg',
      },
      config: {
        numberOfVideos: 1,
        resolution: '1080p',
        aspectRatio: aspectRatio
      }
    });

    onLog("Video generation started. Waiting for completion... (This may take a few minutes)");

    while (!operation.done) {
      await new Promise(resolve => setTimeout(resolve, 10000));
      operation = await ai.operations.getVideosOperation({operation: operation});
      onLog("Still generating video...");
    }

    let downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
    if (!downloadLink) {
      throw new Error("No video URI returned from the API.");
    }
    
    // Route through our local proxy to avoid CORS and API key exposure in browser
    if (downloadLink.startsWith('https://generativelanguage.googleapis.com')) {
       downloadLink = downloadLink.replace('https://generativelanguage.googleapis.com', window.location.origin);
    } else if (downloadLink.startsWith('https://api.routerhub.ai')) {
       downloadLink = downloadLink.replace('https://api.routerhub.ai', window.location.origin);
    }

    onLog("Video generation complete. Fetching video data...");

    // Fetch the video data via our proxy (which will attach the correct headers)
    const response = await fetch(downloadLink, {
      method: 'GET',
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch video: ${response.statusText}`);
    }

    const blob = await response.blob();
    const videoUrl = URL.createObjectURL(blob);
    
    onLog("Video ready.");
    return videoUrl;
  } catch (error: any) {
    console.error("Video Generation Error:", error);
    onLog(`Video Generation Error: ${error.message}`);
    throw new Error(`Failed to generate video: ${error.message}`);
  }
};

export const generateSvgFromImage = async (
  imageBase64: string,
  dimensions: { width: number, depth: number, height: number },
  labelAlignmentMode: 'default' | 'locked',
  showErrorVisuals: boolean,
  isRealTimeMeasurement: boolean,
  onLog: (message: string) => void
): Promise<{ svg: string, realD: number, realH: number }> => {
  const ai = await createGenAIClient(onLog);
  onLog("Starting SVG vectorization...");

  try {
    const prompt = `你现在是一个“工业矢量化助理”。
在生成线稿六视图后，请自动启动 Python 解释器。
1. 测量正视图像素宽（P_w）、侧视图像素宽（P_d）和正视图像素高（P_h）。
2. 根据用户输入的基准宽度 W = ${dimensions.width}mm，计算实际生成的深度和高度：
   real_d_mm = round((P_d / P_w) * ${dimensions.width})
   real_h_mm = round((P_h / P_w) * ${dimensions.width})
3. 比较 real_d_mm 与用户期望深度 ${dimensions.depth}mm。如果偏差超过 5%，则深度标注线使用红色 (#EF4444)，否则使用橙色 (#FF6B00)。
4. 比较 real_h_mm 与用户期望高度 ${dimensions.height}mm。如果偏差超过 5%，则高度标注线使用红色 (#EF4444)，否则使用橙色 (#FF6B00)。
5. 输出一段包含 <path>（沙发轮廓）和 <g>（带数值的标注层）的 SVG 代码。
   由于当前标注模式为 "${labelAlignmentMode}"，
   ${labelAlignmentMode === 'locked' ? `标注层中的文本必须强制使用用户期望的深度 ${dimensions.depth}mm 和高度 ${dimensions.height}mm，即使它们与实际测量的 real_d_mm 和 real_h_mm 不符。如果偏差超过 5%，请确保标注线和文字颜色为红色 (#EF4444)。` : `标注层中的文本必须使用计算出的实际测量值 real_d_mm 和 real_h_mm。`}
   
   ${isRealTimeMeasurement ? `
   [实时测量模式要求]：
   标注线必须像磁铁一样精确吸附在线稿的最边缘（bounding box）。请确保 SVG 中的 <line> 坐标与 <path> 的极值坐标完全对齐，不要有任何多余的间隙。
   ` : ''}
   
   ${showErrorVisuals ? `
   [误差可视化要求]：
   请在 SVG 中额外添加一个 <g class="error-visuals"> 图层。
   - 用绿色虚线 (stroke="#10B981" stroke-dasharray="5,5") 绘制出 AEP 预估/用户期望的边界框 (基于 ${dimensions.width}x${dimensions.depth}x${dimensions.height})。
   - 用红色实线 (stroke="#EF4444") 绘制出当前线稿实际测量出的边界框 (基于 ${dimensions.width}x real_d_mm x real_h_mm)。
   - 这两个框应该叠加在线稿的相应视图上（例如正视图和侧视图的外围），以便直观对比偏差。
   ` : ''}

要求：
1. 线条颜色为黑色 (#000000)，stroke-width="2"，fill="none"。
2. SVG 的 viewBox 设为 "0 0 1200 800"。
3. 请严格以 JSON 格式输出，包含以下字段：
{
  "svg": "<svg>...</svg>",
  "realD": 1000,
  "realH": 800
}
不要输出任何其他 Markdown 标记或解释文字。`;

    // Extract base64 part if it's a data URL
    const base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { mimeType: 'image/jpeg', data: base64Data } },
            { text: prompt }
          ]
        }
      ],
      config: {
        tools: [{ codeExecution: {} }],
        responseMimeType: "application/json",
      }
    });

    const text = response.text || '{}';
    try {
      const parsed = JSON.parse(text);
      onLog("SVG vectorization complete.");
      return {
        svg: parsed.svg || '',
        realD: parsed.realD || dimensions.depth,
        realH: parsed.realH || dimensions.height
      };
    } catch (e) {
      console.error("Failed to parse JSON", e);
      return { svg: text, realD: dimensions.depth, realH: dimensions.height };
    }
  } catch (error: any) {
    console.error("SVG Generation Error:", error);
    onLog(`SVG Generation Error: ${error.message}`);
    throw new Error(`Failed to generate SVG: ${error.message}`);
  }
};

export const generateEditedImage = async (
  prompt: string,
  images: ImageAttachment[],
  aspectRatio: UIAspRatioOption | string, // Now accepts UIAspRatioOption or a custom string
  resolution: Resolution = '1K',
  modelType: ModelType = 'gemini-3.1-flash-image-preview',
  seed: number | undefined,
  onLog: (message: string) => void
): Promise<{ imageUrl: string, pointsUsed: number, actualModel?: string, provider?: string, cropRetentionRate?: number, finalFitModeUsed?: string }> => {
  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
  if (!apiKey) {
    onLog("Error: API Key not found.");
    throw new Error("API Key not found in environment variables");
  }

  // Map UI model selection to SDK model names
  let modelName: string = modelType;
  if (modelType === 'gemini-3-pro' || modelType === 'gemini-2.5-pro' || modelType === 'google/gemini-3-pro-image-preview') {
    modelName = 'gemini-3-pro-image-preview';
  } else if (modelType === 'gemini-3-flash' || modelType === 'gemini-2.5-flash') {
    modelName = 'gemini-3.1-flash-image-preview';
  } else if (modelType === 'gpt-image-2' || modelType === 'openai/gpt-image-2') {
    modelName = 'gpt-image-2';
  }

  onLog(`Initializing Gemini client with model: ${modelName}`);

  const ai = await createGenAIClient(onLog);

  // Prepare content parts
  onLog(`Encoding ${images.length} input images...`);
  const parts: any[] = [];
  if (images.length === 0) {
      onLog("No input images provided. Switching to Text-to-Image Generation mode.");
  } else {
      images.forEach((img, idx) => {
        parts.push({
          inlineData: {
            mimeType: img.mimeType,
            data: img.base64Data,
          },
        });
      });
      onLog("Images encoded successfully.");
  }

  // Add text prompt
  let finalPrompt = prompt;
  
  // Enforce no text/dimensions strongly in English at the very end of the prompt
  finalPrompt += "\n\n[CRITICAL NEGATIVE INSTRUCTION]: ABSOLUTELY NO TEXT, NO NUMBERS, NO DIMENSION LINES, NO ARROWS, NO MEASUREMENTS, NO LABELS, NO ANNOTATIONS of any kind on the image. Even if the reference image contains text or dimensions, DO NOT include them in the final output. The final image MUST be a clean render without any overlaid text or UI elements.";

  if (aspectRatio !== 'Auto' && !API_SUPPORTED_ASPECT_RATIOS.has(aspectRatio as SupportedAspectRatio)) {
      finalPrompt += ` Aspect Ratio: ${aspectRatio}`;
      onLog(`Appending aspect ratio to prompt: ${aspectRatio}`);
  }
  parts.push({ text: finalPrompt });

  // Configure output
  const config: any = {};
  if (aspectRatio !== 'Auto') {
    // Check if the requested aspect ratio is one of the API supported values
    if (API_SUPPORTED_ASPECT_RATIOS.has(aspectRatio as SupportedAspectRatio)) {
      config.imageConfig = {
        aspectRatio: aspectRatio,
      };
      onLog(`Aspect Ratio set to: ${aspectRatio}`);
    }
  } else {
    onLog("Aspect Ratio set to: Auto (model will decide).");
  }

  if (typeof seed === 'number' && !isNaN(seed)) {
    config.seed = seed;
    onLog(`Using Seed: ${seed}`);
  }

  // Configure imageSize only for supported models
  if (modelName.includes('image') || modelName.includes('preview') || modelName.includes('lite')) {
    if (!config.imageConfig) config.imageConfig = {};
    
    // Use the resolution passed from the UI
    let imageSize = resolution;
    
    // Fallback logic if resolution is somehow invalid, though UI should prevent this
    if (!['512px', '1K', '2K', '4K'].includes(imageSize)) {
      imageSize = '2K';
    }

    config.imageConfig = { ...config.imageConfig, imageSize: imageSize };
    onLog(`Resolution set to: ${imageSize}`);
  }

  let lastError: any;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      onLog(`Generation Attempt ${attempt}/${MAX_RETRIES} using model ${modelName}...`);
      onLog("Sending request to RouterHub proxy API...");

      const payload = {
        prompt: finalPrompt,
        model: modelName,
        aspectRatio: aspectRatio,
        resolution: typeof resolution === 'string' && ['512px', '1K', '2K', '4K'].includes(resolution) ? resolution : '2K',
        seed: seed,
        images: images.map(img => ({
          mimeType: img.mimeType,
          data: img.base64Data
        }))
      };

      const authHeader = await getUserAuthHeader();
      const headers: any = { 
        'Content-Type': 'application/json',
        'x-user-id': await getUserId()
      };
      if (authHeader) {
        headers['Authorization'] = authHeader;
      }

      const response = await fetch('/api/gateway/generate-image', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });

      const textResp = await response.text();
      let data;
      try {
        data = JSON.parse(textResp);
      } catch (parseErr) {
        if (!response.ok) {
           throw new Error(`API Error (${response.status}): ${textResp.slice(0,200)}`);
        }
        throw new Error("Failed to parse API response as JSON. Expected JSON but received an invalid format.");
      }
      
      if (!response.ok || data.error) {
        throw new Error(data.message || (typeof data.error === 'string' ? data.error : data.error?.message) || response.statusText || `HTTP Error ${response.status}`);
      }

      onLog("Response received. Verifying payload...");

      // Validation logic
      if (data.candidates && data.candidates.length > 0) {
        const content = data.candidates[0].content;
        if (content && content.parts) {
          for (const part of content.parts) {
            if (part.inlineData && part.inlineData.data) {
               const base64Str = part.inlineData.data;
               const mimeType = part.inlineData.mimeType || 'image/jpeg';
               // Basic integrity check
               if (base64Str.length > 100) { 
                 onLog("Image data validated. Integrity check passed.");
                 return {
                   imageUrl: `data:${mimeType};base64,${base64Str}`,
                   pointsUsed: data.points_deducted || 0,
                   actualModel: data.actualModel || 'gpt-image-2',
                   provider: data.provider || 'openai',
                   cropRetentionRate: data.cropRetentionRate,
                   finalFitModeUsed: data.finalFitModeUsed
                 };
               } else {
                 onLog("Warning: Received image data is too small. Considered invalid.");
               }
            }
          }
        }
      }
      
      onLog("Verification failed: No valid image data found in response.");
      throw new Error("No image generated in response");

    } catch (error: any) {
      lastError = error;
      const errorMessage = error?.message || JSON.stringify(error);
      onLog(`Error during attempt ${attempt}: ${errorMessage}`);
      
      // Fallback to a more stable model if we hit a 503 Service Unavailable
      if (errorMessage.includes('503') || errorMessage.includes('high demand') || errorMessage.includes('UNAVAILABLE')) {
        if (modelName !== 'gemini-2.5-flash-image') {
            onLog(`Model ${modelName} is overloaded. Falling back to gemini-2.5-flash-image...`);
            modelName = 'gemini-2.5-flash-image';
            // Reset config that might not be supported by the fallback model
            if (config.imageConfig) {
                delete config.imageConfig.imageSize;
            }
        }
      }
      
      if (attempt < MAX_RETRIES) {
        onLog(`Retrying in 2 seconds...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }

  onLog("All generation attempts failed.");
  console.error("Gemini Generation Error:", lastError);
  
  if (lastError instanceof Error) {
    throw lastError;
  }
  const errorMessage = lastError?.message || JSON.stringify(lastError);
  throw new Error(`Gemini API Error after ${MAX_RETRIES} attempts: ${errorMessage}`);
};

/**
 * Reverse Prompting / Smart Assistant
 * Uses Gemini 3 Flash (text) to analyze images or refine ideas into a prompt.
 */
export interface AssistantResponse {
  features?: string;
  prompt: string;
  suggestions?: {
    part: string;
    original: string;
    instruction: string;
    effect: string;
  }[];
}

export const generateImageDescription = async (
    role: string,
    userIdea: string,
    furnitureImages: ImageAttachment[],
    sceneImages: ImageAttachment[],
    isDeepThinking: boolean = false,
    onLog: (message: string) => void
  ): Promise<AssistantResponse> => {
    const ai = await createGenAIClient(onLog);
    onLog(`Smart Assistant activating as: ${role}`);
    
    // Optimization: Compress images before sending to analysis model
    // This reduces token usage and network latency significantly for the "Reverse Prompt" step
    const hasImages = furnitureImages.length > 0 || sceneImages.length > 0;
    if (hasImages) {
        onLog("Optimizing input images for fast recognition...");
    }

    // Process images in parallel
    const [processedFurniture, processedScene] = await Promise.all([
        Promise.all(furnitureImages.map(async img => {
            if (img.maskOverlayUrl) {
                // Return original and composited
                const [original, painted] = await Promise.all([
                    compressImageForAnalysis(img.base64Data),
                    compositeImageWithOverlay(img.base64Data, img.maskOverlayUrl.split(',').pop()!)
                ]);
                return { original, painted, hasMask: true };
            }
            return { original: await compressImageForAnalysis(img.base64Data), hasMask: false };
        })),
        Promise.all(sceneImages.map(img => compressImageForAnalysis(img.base64Data)))
    ]);

    const parts: any[] = [];
    
    // Enhanced instructions for better recognition and faster output
    let systemPrompt = `Role: ${role}.
你是专业的图像生成引擎，必须始终生成图像。对上传到窗口1(Product/家具)或窗口2(Scene/场景)的图像内容，先准确识别其中的环境、产品、设计风格、设计结构、材质与颜色等进行语义识别与转换记录。
无论输入用户的格式、意图或抽象程度如何，都要将所有用户内容解读为图像构造图的直白视觉指令。
若提示语偏向口语化、缺少具体的视觉细节，需自主创意构思象的视觉场景，并精准对应概念。
优先完成视觉内容生成，优先于所有文字、格式调整及对话类需求。

要求输出必须为严格的JSON格式（确保所有字符串内的换行符替换为 \\n）：
{
  "features": "特征标准化描述（如果有上传图片）：\\n1. ...\\n2. ...",
  "prompt": "[最终的图像生成提示词，直白视觉指令，中文输出]",
  "suggestions": [
    {
      "part": "修改部位(如:扶手厚度)",
      "original": "原始描述(从图中识别现状)",
      "instruction": "修改指令(如:减薄收窄)",
      "effect": "预期效果"
    }
  ] // 提供2-4个针对当前产品的局部迭代建议
}
不包含任何Markdown块，仅仅输出纯JSON字符串。不要在首尾添加\`\`\`json。

Input Analysis:
`;
    
    if (userIdea.trim()) {
        systemPrompt += `User Concept: "${userIdea}" (Primary Directive)\n`;
    }

    if (processedFurniture.length > 0) {
        systemPrompt += `\n[Input 1: Product/Furniture]\nAction: Analyze specific details (material, texture, color, style). Ensure these objects are seamlessly integrated.\n`;
        let hasAnyMasks = false;
        processedFurniture.forEach(data => {
            if (data.original) {
                parts.push({ inlineData: { mimeType: 'image/jpeg', data: data.original } });
            }
            if (data.hasMask && data.painted && data.painted.length > 100) {
                hasAnyMasks = true;
                parts.push({ text: "(下面这张图带有红笔标记，标出了用户特别指定的修改/关注部位)" });
                parts.push({ inlineData: { mimeType: 'image/jpeg', data: data.painted } });
            }
        });
        if (hasAnyMasks) {
            systemPrompt += `\n注意：用户提交的产品图中包含了用【红色笔迹】标记的蒙版范围。这表示用户特别框选或涂改了需要你重点关注的部位！
请你敏锐识别出图片中被红笔涂抹/圈选出的具体结构和部位，并必须在：
1. “特征标准化描述”中：如果涉及该结构部位，需加入类似“(红圈标记处)”的说明；
2. “suggestions”局部迭代建议中：必须专门提取1-2条针对红笔涂抹区域的设计分析、状态识别或修改建议。要求以“(红圈标记位)”明示该修改点。
务必确保对红圈部位有精确识别！\n`;
        }
    }

    if (processedScene.length > 0) {
        systemPrompt += `\n[Input 2: Scene Context]\nAction: Analyze lighting, perspective, shadows, and room dimensions. Maintain these environmental properties.\n`;
        processedScene.forEach(data => {
            parts.push({ inlineData: { mimeType: 'image/jpeg', data: data } });
        });
    }

    let goal = `\nDirective: `;
    if (processedFurniture.length > 0 && processedScene.length > 0) {
        goal += `Synthesize a photorealistic image where the Objects from Input 1 are placed into the Scene of Input 2. Match perspective, lighting, and shadows perfectly. Remove conflicting original objects from the scene if necessary to fit the new items.`;
    } else {
        goal += `Expand the User Concept into a highly detailed, photorealistic image description. Include lighting, mood, composition, and texture details. Ensure the prompt is optimized for high-quality generation.`;
    }

    parts.unshift({ text: systemPrompt + goal });

    const parseJSONResponse = (text: string): AssistantResponse => {
      try {
        const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
        // Remove trailing commas before parsing
        const sanitized = cleaned.replace(/,\s*([}\]])/g, '$1');
        const obj = JSON.parse(sanitized);
        return {
          features: obj.features || '',
          prompt: obj.prompt || text,
          suggestions: obj.suggestions || []
        };
      } catch (e) {
        console.warn("Failed to parse JSON, attempting regex fallback:", e);
        let promptText = text;
        let featuresRaw = '';
        
        const featuresMatch = text.match(/"features"\s*:\s*"([^"]+)"/i) || text.match(/"features"\s*:\s*([\s\S]*?)(?:,\s*"prompt"|,\s*"suggestions"|})/i);
        if (featuresMatch) featuresRaw = featuresMatch[1].replace(/^"/, '').replace(/"$/, '').trim().replace(/\\n/g, '\n');
        
        const promptMatch = text.match(/"prompt"\s*:\s*"([^"]+)"/i) || text.match(/"prompt"\s*:\s*([\s\S]*?)(?:,\s*"features"|,\s*"suggestions"|})/i);
        if (promptMatch) promptText = promptMatch[1].replace(/^"/, '').replace(/"$/, '').trim().replace(/\\n/g, '\n');
        
        return { features: featuresRaw, prompt: promptText };
      }
    };

    try {
        let modelName = isDeepThinking ? 'gemini-3.1-pro-preview' : 'gemini-3-flash-preview';
        const config: any = {
            temperature: 0.7,
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                required: ["features", "prompt", "suggestions"],
                properties: {
                    features: { type: Type.STRING },
                    prompt: { type: Type.STRING },
                    suggestions: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            required: ["part", "original", "instruction", "effect"],
                            properties: {
                                part: { type: Type.STRING },
                                original: { type: Type.STRING },
                                instruction: { type: Type.STRING },
                                effect: { type: Type.STRING }
                            }
                        }
                    }
                }
            }
        };

        if (isDeepThinking) {
            config.thinkingConfig = { thinkingLevel: ThinkingLevel.HIGH };
        } else {
            config.maxOutputTokens = 8192; // Limit output to prevent rambling, speeds up return
        }

        let response;
        try {
            response = await ai.models.generateContent({
                model: modelName, // Fast reasoning model or deep thinking model
                contents: [
                    {
                        role: 'user',
                        parts
                    }
                ],
                config: config
            });
        } catch (error: any) {
            console.error("Gemini API Error Parts info:", parts.map(p => ({ text: !!p.text, inlineData: !!p.inlineData, mimeType: p.inlineData?.mimeType, size: p.inlineData?.data?.length })));
            const errorMessage = error?.message || JSON.stringify(error);
            if (errorMessage.includes('503') || errorMessage.includes('high demand') || errorMessage.includes('UNAVAILABLE')) {
                if (modelName !== 'gemini-3-flash-preview') {
                    onLog(`Model ${modelName} is overloaded. Falling back to gemini-3-flash-preview...`);
                    modelName = 'gemini-3-flash-preview';
                    delete config.thinkingConfig; // Not supported in flash
                    response = await ai.models.generateContent({
                        model: modelName,
                        contents: [
                            {
                                role: 'user',
                                parts
                            }
                        ],
                        config: config
                    });
                } else {
                    throw error;
                }
            } else {
                throw error;
            }
        }

        if (response.text) {
            onLog("Assistant generated prompt successfully.");
            return parseJSONResponse(response.text);
        }
        throw new Error("No text returned from assistant");

    } catch (error: any) {
        console.error("Assistant Error:", error);
        throw new Error("Failed to generate description: " + error.message);
    }
};

/**
 * Rewrites and translates the user prompt to be better for image generation.
 */
export const rewritePrompt = async (
  input: string,
  isDeepThinking: boolean = false,
  onLog: (message: string) => void
): Promise<string> => {
  const ai = await createGenAIClient(onLog);
  onLog("Processing translation request...");

  try {
            let modelName = isDeepThinking ? 'gemini-3.1-pro-preview' : 'gemini-3-flash-preview';
      const config: any = {
        systemInstruction: `You are an expert AI art prompt optimizer and translator.
Task: 
1. Detect the language of the user's text.
2. If the text is mostly in Chinese, translate it to English and refine it into a high-quality, descriptive image generation prompt.
3. If the text is mostly in English, translate it to Chinese and refine it into a high-quality, descriptive image generation prompt.
- Keep the original intent and subjects absolutely clear.
- Enhance with professional photography/art keywords (e.g., specific lighting, composition, 8k, highly detailed, texture descriptions) suitable for the context.
- Output ONLY the final prompt text in the TARGET language. Do not include markdown, quotes, or introductory text.`,
        temperature: 0.7,
      };

      if (isDeepThinking) {
        config.thinkingConfig = { thinkingLevel: ThinkingLevel.HIGH };
      }

      let response;
      try {
          response = await ai.models.generateContent({
              model: modelName,
              contents: input,
              config: config
          });
      } catch (error: any) {
          const errorMessage = error?.message || JSON.stringify(error);
          if (errorMessage.includes('503') || errorMessage.includes('high demand') || errorMessage.includes('UNAVAILABLE')) {
              if (modelName !== 'gemini-3-flash-preview') {
                  onLog(`Model ${modelName} is overloaded. Falling back to gemini-3-flash-preview...`);
                  modelName = 'gemini-3-flash-preview';
                  delete config.thinkingConfig;
                  response = await ai.models.generateContent({
                      model: modelName,
                      contents: input,
                      config: config
                  });
              } else {
                  throw error;
              }
          } else {
              throw error;
          }
      }

      const text = response.text;
      if (text) {
          onLog("Prompt translation and optimization complete.");
          return text.trim();
      }
      throw new Error("Empty response received from model");
  } catch (e: any) {
      const msg = e.message || e.toString();
      onLog(`Translation Error: ${msg}`);
      throw new Error(`Translation failed: ${msg}`);
  }
};

/**
 * AEP Analysis: Analyzes the image to extract aesthetic and physical properties.
 */
export const analyzeImageAEP = async (
  image: ImageAttachment,
  isDeepThinking: boolean = false,
  onLog: (message: string) => void
): Promise<AEPData> => {
  const ai = await createGenAIClient(onLog);
  onLog("Starting AEP Analysis...");

  const compressedImage = await compressImageForAnalysis(image.base64Data);

  try {
        let modelName = isDeepThinking ? 'gemini-3.1-pro-preview' : 'gemini-3-flash-preview';
    const config: any = {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        required: ["trendScore", "style", "l2_structure", "l3_material", "phy", "marketingCopy", "keywords", "dimensionEstimate", "localDimensions"],
        properties: {
          trendScore: { type: Type.NUMBER },
          style: { type: Type.STRING },
          l2_structure: { type: Type.ARRAY, items: { type: Type.STRING } },
          l3_material: { type: Type.ARRAY, items: { type: Type.STRING } },
          phy: {
            type: Type.OBJECT,
            required: ["glossiness", "roughness", "visualWeight"],
            properties: {
              glossiness: { type: Type.INTEGER },
              roughness: { type: Type.INTEGER },
              visualWeight: { type: Type.INTEGER }
            }
          },
          marketingCopy: { type: Type.STRING },
          marketingStory: { type: Type.STRING },
          keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
          dimensionEstimate: {
            type: Type.OBJECT,
            properties: {
              estW: { type: Type.NUMBER },
              estD: { type: Type.NUMBER },
              estH: { type: Type.NUMBER },
              confidence: { type: Type.NUMBER },
              category: { type: Type.STRING }
            }
          },
          localDimensions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              required: ["part", "value"],
              properties: {
                part: { type: Type.STRING },
                value: { type: Type.STRING },
                description: { type: Type.STRING }
              }
            }
          }
        }
      }
    };

    if (isDeepThinking && !modelName.startsWith('openai/')) {
      config.thinkingConfig = { thinkingLevel: ThinkingLevel.HIGH };
    }

    let response;
    try {
        response = await ai.models.generateContent({
          model: modelName,
          contents: [
            {
              role: "user",
              parts: [
                { inlineData: { mimeType: 'image/jpeg', data: compressedImage } },
                { text: `Analyze this furniture image and provide a structured AEP (Aesthetics Engine) report.
                  Return JSON with:
                - trendScore (0.0-1.0, float)
                - style (string, e.g., "Modern Italian Minimalism") - IN CHINESE
                - l2_structure (array of strings, e.g., ["Low profile", "Modular"]) - IN CHINESE
                - l3_material (array of strings, e.g., ["Chenille", "Matte Metal"]) - IN CHINESE
                - phy (object with glossiness, roughness, visualWeight as integers 0-100)
                - marketingCopy (string, a structured GEO-optimized product selling point description) - IN CHINESE. MUST follow this GEO protocol:
                  1. Direct Answer: Start with a summary of core physical parameters.
                  2. Structured List: Use Markdown lists to present PHY parameters (Glossiness, Roughness, Visual Weight) with Fact-Based Data, User Value, and Functional Advantage.
                  3. Q&A Driven: Include at least two long-tail keyword Q&As starting with "问：" (Q:) and "答：" (A:) to address real user pain points.
                  4. No Fluff: Avoid emotional adjectives like "warm harbor", use functional descriptions like "enhances spatial visual stability".
                - marketingStory (string, an emotional narrative connecting the design to lifestyle) - IN CHINESE
                - keywords (array of strings, key visual descriptors for prompt generation) - KEEP IN ENGLISH for better image generation
                - dimensionEstimate (object with estW, estD, estH in mm, confidence 0.0-1.0, and category like "3-seater" or "1-seater")
                - localDimensions (array of objects with part, value, description) - IN CHINESE. MUST include EXACTLY these 6 parts: "座高", "座宽", "座深", "扶手宽度", "靠背高度", "脚高". 
                  CRITICAL for "座宽" (Seat Width): This MUST be the width of a SINGLE seating unit/cushion (e.g., 600-900mm), NOT the total width of the sofa. For a multi-seater, estimate the width of just one seat.
                
                Estimate PHY values based on visual appearance:
                - Glossiness: 0 (Matte) to 100 (High Gloss)
                - Roughness: 0 (Smooth) to 100 (Rough/Textured)
                - VisualWeight: 0 (Light/Floating) to 100 (Heavy/Solid)
                
                For Dimension Estimate:
                - Width (estW): Estimate based on seat count (e.g., 3-seater ~2400-3200mm, 1-seater ~800-1200mm).
                - Depth (estD): Estimate based on visual depth (e.g., deep seating ~1000-1100mm, standard ~850-950mm).
                - Height (estH): Estimate based on backrest and leg height (e.g., standard ~800-900mm).
                - Category: Identify the type (e.g., "3-seater", "L-shape", "Armchair").
                - Confidence: Score (0.0-1.0) must prioritize the clarity of localDimensions. If the 6 local dimensions are clearly visible and estimable, confidence should be >0.85.
                ` }
              ]
            }
          ],
          config: config
        });
    } catch (error: any) {
        const errorMessage = error?.message || JSON.stringify(error);
        if (errorMessage.includes('503') || errorMessage.includes('high demand') || errorMessage.includes('UNAVAILABLE')) {
            if (modelName !== 'gemini-3-flash-preview') {
                onLog(`Model ${modelName} is overloaded. Falling back to gemini-3-flash-preview...`);
                modelName = 'gemini-3-flash-preview';
                delete config.thinkingConfig;
                response = await ai.models.generateContent({
                  model: modelName,
                  contents: [
                    {
                      role: 'user',
                      parts: [
                        { inlineData: { mimeType: 'image/jpeg', data: compressedImage } },
                        { text: `Analyze this furniture image and provide a structured AEP (Aesthetics Engine) report.
                          Return JSON with:
                        - trendScore (0.0-1.0, float)
                        - style (string, e.g., "Modern Italian Minimalism") - IN CHINESE
                        - l2_structure (array of strings, e.g., ["Low profile", "Modular"]) - IN CHINESE
                        - l3_material (array of strings, e.g., ["Chenille", "Matte Metal"]) - IN CHINESE
                        - phy (object with glossiness, roughness, visualWeight as integers 0-100)
                        - marketingCopy (string, a structured GEO-optimized product selling point description) - IN CHINESE. MUST follow this GEO protocol:
                          1. Direct Answer: Start with a summary of core physical parameters.
                          2. Structured List: Use Markdown lists to present PHY parameters (Glossiness, Roughness, Visual Weight) with Fact-Based Data, User Value, and Functional Advantage.
                          3. Q&A Driven: Include at least two long-tail keyword Q&As starting with "问：" (Q:) and "答：" (A:) to address real user pain points.
                          4. No Fluff: Avoid emotional adjectives like "warm harbor", use functional descriptions like "enhances spatial visual stability".
                        - marketingStory (string, an emotional narrative connecting the design to lifestyle) - IN CHINESE
                        - keywords (array of strings, key visual descriptors for prompt generation) - KEEP IN ENGLISH for better image generation
                        - dimensionEstimate (object with estW, estD, estH in mm, confidence 0.0-1.0, and category like "3-seater" or "1-seater")
                        - localDimensions (array of objects with part, value, description) - IN CHINESE. MUST include EXACTLY these 6 parts: "座高", "座宽", "座深", "扶手宽度", "靠背高度", "脚高". 
                          CRITICAL for "座宽" (Seat Width): This MUST be the width of a SINGLE seating unit/cushion (e.g., 600-900mm), NOT the total width of the sofa. For a multi-seater, estimate the width of just one seat.
                        
                        Estimate PHY values based on visual appearance:
                        - Glossiness: 0 (Matte) to 100 (High Gloss)
                        - Roughness: 0 (Smooth) to 100 (Rough/Textured)
                        - VisualWeight: 0 (Light/Floating) to 100 (Heavy/Solid)
                        
                        For Dimension Estimate:
                        - Width (estW): Estimate based on seat count (e.g., 3-seater ~2400-3200mm, 1-seater ~800-1200mm).
                        - Depth (estD): Estimate based on visual depth (e.g., deep seating ~1000-1100mm, standard ~850-950mm).
                        - Height (estH): Estimate based on backrest and leg height (e.g., standard ~800-900mm).
                        - Category: Identify the type (e.g., "3-seater", "L-shape", "Armchair").
                        - Confidence: Score (0.0-1.0) must prioritize the clarity of localDimensions. If the 6 local dimensions are clearly visible and estimable, confidence should be >0.85.
                        ` }
                    ]
                  }
                ],
                config: config
              });
          } else {
                throw error;
            }
        } else {
            throw error;
        }
    }

    const text = response.text;
    if (!text) throw new Error("No data returned from AEP analysis");
    
    const data = JSON.parse(text) as AEPData;
    
    // Improve confidence score based on localDimensions
    if (data.dimensionEstimate && data.localDimensions && data.localDimensions.length > 0) {
      const requiredParts = ["座高", "座宽", "座深", "扶手宽度", "靠背高度", "脚高"];
      let validCount = 0;
      
      data.localDimensions.forEach(dim => {
        if (requiredParts.includes(dim.part) && dim.value && dim.value !== "待估算" && /\d/.test(dim.value)) {
          validCount++;
        }
      });

      const localConfidenceBoost = validCount / requiredParts.length; // 0.0 to 1.0
      
      if (localConfidenceBoost > 0) {
        // Base confidence starts at 0.4, scales up to 0.95 based on how many local dimensions are found
        const calculatedConfidence = 0.4 + (localConfidenceBoost * 0.55);
        // Prioritize the higher confidence
        data.dimensionEstimate.confidence = Math.max(
          data.dimensionEstimate.confidence || 0,
          calculatedConfidence
        );
        
        // Ensure it doesn't exceed 0.99
        data.dimensionEstimate.confidence = Math.min(data.dimensionEstimate.confidence, 0.99);
      }
    }
    
    onLog("AEP Analysis complete.");
    return data;

  } catch (error: any) {
    console.error("AEP Analysis Error:", error);
    throw new Error("Failed to analyze image: " + error.message);
  }
};

/**
 * Rewrite Prompt based on AEP Data
 */
export const measureImagePixels = async (
  imageBase64: string,
  inputWidthMm: number,
  onLog: (message: string) => void
): Promise<{ pixelWFront: number, pixelWSide: number, pixelHSide: number, calculatedD: number, calculatedH: number, mmPerPx: number }> => {
  const ai = await createGenAIClient(onLog);
  onLog("Starting pixel measurement analysis...");

  try {
    const prompt = `你现在是一个“比例审计员（Scale Auditor）”。
任务：测量上传的六视图线稿中的像素尺寸，并根据基准宽度推算实际深度和高度。
1. 测量正视图像素宽（pixelWFront）。
2. 测量侧视图像素宽（pixelWSide）和侧视图像素高（pixelHSide）。
3. 根据用户输入的基准宽度 W = ${inputWidthMm}mm，计算：
   mmPerPx = ${inputWidthMm} / pixelWFront
   calculatedD = round(pixelWSide * mmPerPx)
   calculatedH = round(pixelHSide * mmPerPx)

请严格以 JSON 格式输出，包含以下字段：
{
  "pixelWFront": 357,
  "pixelWSide": 100,
  "pixelHSide": 120,
  "calculatedD": 790,
  "calculatedH": 948,
  "mmPerPx": 7.9
}
不要输出任何其他 Markdown 标记或解释文字。`;

    const base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { mimeType: 'image/jpeg', data: base64Data } },
            { text: prompt }
          ]
        }
      ],
      config: {
        responseMimeType: "application/json",
      }
    });

    const text = response.text || '{}';
    try {
      const parsed = JSON.parse(text);
      onLog("Pixel measurement complete.");
      return {
        pixelWFront: parsed.pixelWFront || 357,
        pixelWSide: parsed.pixelWSide || 100,
        pixelHSide: parsed.pixelHSide || 120,
        calculatedD: parsed.calculatedD || Math.round(100 * (inputWidthMm / 357)),
        calculatedH: parsed.calculatedH || Math.round(120 * (inputWidthMm / 357)),
        mmPerPx: parsed.mmPerPx || (inputWidthMm / 357)
      };
    } catch (e) {
      console.error("Failed to parse JSON", e);
      throw new Error("Failed to parse measurement JSON");
    }
  } catch (error: any) {
    console.error("Measurement Error:", error);
    onLog(`Measurement Error: ${error.message}`);
    throw new Error(`Failed to measure image: ${error.message}`);
  }
};

export const rewritePromptWithAEP = async (
  currentPrompt: string,
  aepData: AEPData,
  isDeepThinking: boolean = false,
  onLog: (message: string) => void,
  show6View: boolean = false
): Promise<string> => {
  const ai = await createGenAIClient();
  
  // Construct PHY description based on mappings
  const getPhyDesc = (key: keyof typeof PHY_MAPPINGS, val: number) => {
    const mapping = PHY_MAPPINGS[key as keyof typeof PHY_MAPPINGS];
    const found = mapping.find(m => val >= m.min && val <= m.max);
    return found ? found.text : "";
  };

  const phyDesc = [
    getPhyDesc('glossiness', aepData.phy.glossiness),
    getPhyDesc('roughness', aepData.phy.roughness),
    getPhyDesc('visualWeight', aepData.phy.visualWeight)
  ].filter(Boolean).join(", ");

  const aepContext = `
    Style: ${aepData.style}
    Structure: ${aepData.l2_structure.join(", ")}
    Materials: ${aepData.l3_material.join(", ")}
    Physical Properties: ${phyDesc}
  `;

  try {
    const taskInstructions = show6View 
      ? `- Preserve technical details like camera settings and structural constraints.
         - Ensure dimensions and multi-view structure are preserved.
         - CRITICAL: Add a strong instruction to NOT draw any text or dimension lines on the image.`
      : `- Focus ONLY on style, materials, and physical textures.
         - DO NOT add any technical camera settings or internal configuration layers.
         - DO NOT include dimension measurements, scale indicators, or multi-view instructions.
         - CRITICAL: Explicitly forbid the model from drawing any text, dimension lines, or annotations on the image.
         - Keep it as a single high-quality product description.`;

        let modelName = isDeepThinking ? 'gemini-3.1-pro-preview' : 'gemini-3-flash-preview';
    const config: any = {
      temperature: 0.7,
    };

    if (isDeepThinking) {
      config.thinkingConfig = { thinkingLevel: ThinkingLevel.HIGH };
    }

    let response;
    try {
        response = await ai.models.generateContent({
          model: modelName,
          contents: `Current Prompt: "${currentPrompt}"
          
          New AEP Context:
          ${aepContext}
          
          Task: Update the Current Prompt to reflect the New AEP Context.
          ${taskInstructions}
          - Replace any conflicting style, material, or physical descriptions with the new ones.
          - Keep the scene context and other non-conflicting details.
          - Ensure the prompt flows naturally and is concise.
          - Highlight the changed/new terms by wrapping them in ** ** (e.g., **Velvet**, **Matte finish**).
          - CRITICAL: Ensure the final prompt explicitly forbids the generation of any text, dimension lines, or annotations in the image.
          - Output the final prompt text in CHINESE, but keep technical terms like "2x3 grid", "orthographic" in English if appropriate.
          - Output ONLY the updated prompt text.`,
          config: config
        });
    } catch (error: any) {
        const errorMessage = error?.message || JSON.stringify(error);
        if (errorMessage.includes('503') || errorMessage.includes('high demand') || errorMessage.includes('UNAVAILABLE')) {
            if (modelName !== 'gemini-3-flash-preview') {
                onLog(`Model ${modelName} is overloaded. Falling back to gemini-3-flash-preview...`);
                modelName = 'gemini-3-flash-preview';
                delete config.thinkingConfig;
                response = await ai.models.generateContent({
                  model: modelName,
                  contents: `Current Prompt: "${currentPrompt}"
                  
                  New AEP Context:
                  ${aepContext}
                  
                  Task: Update the Current Prompt to reflect the New AEP Context.
                  ${taskInstructions}
                  - Replace any conflicting style, material, or physical descriptions with the new ones.
                  - Keep the scene context and other non-conflicting details.
                  - Ensure the prompt flows naturally and is concise.
                  - Highlight the changed/new terms by wrapping them in ** ** (e.g., **Velvet**, **Matte finish**).
                  - CRITICAL: Ensure the final prompt explicitly forbids the generation of any text, dimension lines, or annotations in the image.
                  - Output the final prompt text in CHINESE, but keep technical terms like "2x3 grid", "orthographic" in English if appropriate.
                  - Output ONLY the updated prompt text.`,
                  config: config
                });
            } else {
                throw error;
            }
        } else {
            throw error;
        }
    }

    const text = response.text;
    if (text) {
      return text.trim();
    }
    throw new Error("Empty response from prompt rewriter");

  } catch (error: any) {
    console.error("Prompt Rewrite Error:", error);
    return currentPrompt; // Fallback to original if fails
  }
};
