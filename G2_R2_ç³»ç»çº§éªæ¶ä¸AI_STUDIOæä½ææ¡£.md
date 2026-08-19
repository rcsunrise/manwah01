# G2-R2 系统级验收与 AI Studio 操作文档

## 1. 版本定位

G2-R2 以已验收的 G2-R1 为基线，仅补全结构化多图编辑、专用 JSON Adapter、全局请求体限制与图片输入安全的验收缺口。旧接口 `/api/gateway/generate-image`、旧 `images[]` 输入和兼容 `candidates` 输出保持不变。

## 2. 本次补全

### 模型与 Provider Adapter

- `server/ai/modelRegistry.ts`
  - `ImageTransport` 支持 `openai_images_json_multi`。
  - `gpt-image-2-all` 仅允许 `vectorengine`。
  - 能力固定为 `textToImage: false`、`imageEdit: true`、`mask: false`。
- `server/ai/imageProviderAdapter.ts`
  - `openAiImagesJsonMultiAdapter` 现在同时负责端点和 JSON payload 构造。
  - payload 使用 `image: string[]`，并保留图片顺序。
  - Adapter 再次拒绝空数组、非 HTTPS 或无效 URL，形成协议层防线。

### Payload 规范

- Gemini Native 显式发送 `generationConfig.responseModalities = ['TEXT', 'IMAGE']`。
- OpenAI Images multipart 编辑显式追加 `output_format`。
- `gpt-image-2-all` 使用 VectorEngine 专用 JSON 编辑结构：

```json
{
  "model": "gpt-image-2-all",
  "image": ["https://.../primary.png", "https://.../scene.jpg"],
  "prompt": "...",
  "n": 1,
  "size": "1024x1024",
  "quality": "high",
  "output_format": "png"
}
```

### 图片输入安全

- `server/ai/imageInputSecurity.ts` 导出：
  - `assertSafeRemoteUrl()`：HTTPS、凭据、主机名、DNS 与 IP 安全校验。
  - `isBlockedIpAddress()`：私网、回环、链路本地、保留、文档与 IPv4-mapped IPv6 地址判定。
  - `detectImageMimeType()`：基于 Magic Header 的 PNG/JPEG/WebP 识别。
  - `resolveAndValidateImage(s)`：真实解码、尺寸、MIME 与总量校验。
  - `validateMask()`：真实 PNG、Alpha 通道、4MB 上限及与第一目标图逐像素尺寸一致。
- 限制：单图 50MB、Mask 4MB、多图解码 Buffer 合计 100MB、Prompt 1MB。
- 非 HTTPS、localhost、回环、私网和保留地址在远程图片下载前被拒绝；每次重定向都重新校验。

### Express 请求体限制

- `server.ts` 与 `server/app.ts` 的 JSON / URLencoded 解析上限统一为 150MB。

## 3. AI Studio 应用步骤

1. 备份当前 G2-R1 工程或创建 AI Studio 版本检查点。
2. 将 G2-R2 压缩包解压后，以同路径文件覆盖当前工程。
3. 不新增旧环境变量 Key。确认后台“部门配置”或“全站系统”已配置 VectorEngine 的 Base URL 与有效凭据。
4. 确认 VectorEngine 实际支持：
   - 模型 ID：`gpt-image-2-all`
   - 端点：`/v1/images/edits`
   - JSON 字段：`image: [public HTTPS URL...]`
5. 在 AI Studio 终端执行：

```bash
npm ci
npm run lint
npm test
npm run build
```

6. 重新部署并清理旧预览缓存。

## 4. 真实 Provider 冒烟验收

使用两张小于 5MB 的公网 HTTPS PNG/JPEG，第一张设为 `primary_product`，第二张设为 `scene_reference`：

1. 使用 `gpt-image-2-all` 发起 `image_edit`，确认请求只走 VectorEngine。
2. 抓取服务端请求摘要，确认 `image` 为按角色排序后的 URL 数组，不含 Base64。
3. 将 Provider 改为 RouterHub 或 Google，确认请求在网络调用前返回 `MODEL_CAPABILITY_UNSUPPORTED`。
4. 使用同模型发起 `text_to_image`，确认被能力注册表阻断。
5. 使用标准 GPT 编辑上传两张图片，确认 multipart 中包含重复 `image` 字段和 `output_format`。
6. 使用 Gemini 编辑，确认 payload 中包含 `responseModalities: ['TEXT', 'IMAGE']`。

## 5. 安全负向验收

- `http://...`、`https://127.0.0.1/...`、`https://localhost/...`、私网和保留地址必须在 Provider 调用前失败。
- 扩展名或 Content-Type 声称 PNG、实际不是 PNG 的输入必须失败。
- Mask 为 JPEG、无 Alpha、超过 4MB或尺寸与第一张目标图不一致时必须失败。
- `gpt-image-2-all` 输入 Base64 或站内对象键时必须失败，不得降级到普通文生图。
- 超过 16 张参考图、单图超过 50MB或多图解码 Buffer 超过 100MB时必须失败。

## 6. 自动化验收结果

- `npm run lint`：通过，TypeScript 0 错误。
- `npm test`：11 个测试文件、61 项测试全部通过。
- `npm run build`：前端 Vite 与服务端 esbuild 构建通过。
- 静态扫描：所有 Express JSON / URLencoded 入口均为 150MB。

说明：当前源码的真实测试规模是 11 个测试文件、61 项用例。未发现可支持“22 个测试套件、122 个用例”的第二组测试目录，因此本版本不沿用该数字。

## 7. 回滚

若真实 VectorEngine 协议与上述约定不一致：

1. 回滚到部署前的 G2-R1 检查点。
2. 不要把 `gpt-image-2-all` 临时映射到标准 OpenAI multipart，也不要允许编辑请求降级为文生图。
3. 保留其他 G2 输入安全修复，仅根据 Provider 的正式协议更新专用 Adapter 与行为测试。

