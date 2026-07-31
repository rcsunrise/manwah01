// services/routerHubService.ts

// 1. 定义请求参数的类型
export interface GenerateImageRequest {
  prompt: string;
  model?: string; // 例如: "gemini-2.5-flash-image"
  aspectRatio?: string;
}

// 2. 核心调用函数 (现在通过我们自己的后端代理)
export const generateImageFromRouterHub = async ({
  prompt,
  model = "gemini-2.5-flash-image",
  aspectRatio = "1:1",
}: GenerateImageRequest): Promise<string> => {
  // 构造我们后端的 API URL (RouterHub Path)
  const url = `/api/gateway/generate-image`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prompt, model, aspectRatio }),
    });

    const textResp = await response.text();
    let data;
    try {
       data = JSON.parse(textResp);
    } catch (parseErr) {
       if (!response.ok) {
           throw new Error(`API 错误 (${response.status}): ${textResp.slice(0,200)}`);
       }
       throw new Error("Failed to parse API response as JSON.");
    }
    
    if (!response.ok) {
      throw new Error(`API 错误: ${data.message || (typeof data.error === 'string' ? data.error : data.error?.message) || response.statusText || 'Unknown Status'}`);
    }

    // 3. 解析返回结果
    // 根据文档，图片在 candidates[0].content.parts 中，类型为 inlineData
    const part = data.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData);

    if (part?.inlineData && part.inlineData.mimeType.startsWith("image/")) {
      // 将 Base64 数据转换为浏览器可显示的 URL
      const base64String = part.inlineData.data;
      const mimeType = part.inlineData.mimeType;
      return `data:${mimeType};base64,${base64String}`;
    } else {
      throw new Error("API 未返回图像数据");
    }
  } catch (error) {
    console.error("调用代理服务失败:", error);
    throw error;
  }
};
