# G2-R1｜结构化多图编辑、严格 Mask 与图片输入安全

版本：G2-R1  
基线：G1-R1  
日期：2026-08-04

## 1. 本轮完成范围

G2-R1 已完成：

1. 新增显式 `GenerationIntent`：`text_to_image`、`image_edit`。
2. 新增 `ImageRole`：主产品、场景、材质、人物、构图、风格参考。
3. 每张参考图携带 `referenceAssetId` 与 `order`，服务端统一排序。
4. Gemini Native 按顺序发送角色标签与多个 `inlineData`，并显式请求 `TEXT`、`IMAGE` 响应模态。
5. 标准 OpenAI Images 编辑继续使用 `multipart/form-data`，多个同名 `image` 字段按角色顺序追加。
6. 新增 VectorEngine 专用 `gpt-image-2-all` JSON Adapter，不与标准 OpenAI Images 协议混用。
7. Mask 完成真实 PNG 签名、MIME、Alpha、尺寸和目标图校验。
8. 参考图完成真实文件签名、MIME、可解码性、尺寸、单图和总大小校验。
9. 远程图片完成 HTTPS、DNS 私网/回环/保留地址和逐跳重定向检查，并限制下载体积。
10. JSON 请求上限从 500MB 收紧至 150MB；解码后的参考图合计上限为 100MB。

本轮不包含 Responses API、Agent 真实任务持久化、原子计费、幂等账本、熔断与指数退避；这些属于 G3/G4。

## 2. 修改文件

### 新增

- `server/ai/imageRequest.ts`
- `server/ai/imageInputSecurity.ts`
- `tests/g2_image_edit_protocol.test.ts`
- `G2_R1_AI_STUDIO_操作与验收文档.md`

### 修改

- `server.ts`
- `server/ai/modelRegistry.ts`
- `server/ai/imageProviderAdapter.ts`
- `src/types.ts`
- `src/services/geminiService.ts`
- `src/hooks/useCreativeCanvasWorkspace.ts`
- `src/pages/ManwahStudio.tsx`
- `src/components/creative-canvas/AgentPanel.tsx`

## 3. 统一请求结构

新前端请求示例：

```json
{
  "generationIntent": "image_edit",
  "model": "openai/gpt-image-2",
  "prompt": "保持产品造型，替换为现代艺术馆场景",
  "images": [
    {
      "data": "BASE64",
      "mimeType": "image/png",
      "role": "primary_product",
      "referenceAssetId": "sku-12880-v3",
      "order": 0
    },
    {
      "data": "BASE64",
      "mimeType": "image/jpeg",
      "role": "scene_reference",
      "referenceAssetId": "scene-gallery-01",
      "order": 1
    }
  ],
  "mask": {
    "data": "data:image/png;base64,...",
    "mimeType": "image/png",
    "targetReferenceAssetId": "sku-12880-v3"
  }
}
```

旧版没有 `generationIntent`、`role` 和 `order` 的 `images[]` 仍可兼容：有图时推断为 `image_edit`；第一张默认为 `primary_product`，后续默认为 `style_reference`。新调用应使用显式字段。

## 4. ImageRole 与顺序

| `ImageRole` | 用途 |
|---|---|
| `primary_product` | 造型、比例、结构、颜色与工艺的主约束图 |
| `scene_reference` | 空间、家具关系和环境参考 |
| `material_reference` | 面料、皮纹、木纹、金属等材质参考 |
| `person_reference` | 人物身份、服装、姿态参考 |
| `composition_reference` | 镜位、景别、画面布局参考 |
| `style_reference` | 色调、光影、艺术风格参考 |

服务端先按 `order` 升序排序。Mask 永远作用于排序后的第一张图；如果传入 `targetReferenceAssetId`，必须与第一张图的 `referenceAssetId` 一致。

## 5. 当前协议矩阵

| 模型/协议 | 文生图 | 多图编辑 | Mask | 输入方式 | Provider |
|---|---:|---:|---:|---|---|
| Gemini Native 图像模型 | 是 | 是 | 否 | JSON 多个 `inlineData` | Google/RouterHub/VectorEngine |
| `gpt-image-1/1.5/2` | 是 | 是，最多 16 张 | 是 | 标准 multipart，同名 `image` | RouterHub/VectorEngine |
| `gpt-image-2-all` | 否 | 是，最多 16 张 | 否 | 专有 JSON：`image: [URL...]` | 仅 VectorEngine |

`gpt-image-2-all` 是 Provider 专有能力，不代表 OpenAI 官方模型或标准 Images API。UI 中显示为“GPT 多图”，只接受已经保存为可公开访问 HTTPS URL 的参考图；Base64、站内对象键或本机地址会在请求上游前失败。

## 6. Mask 校验规则

提交 Mask 时必须同时满足：

- 请求意图为 `image_edit`。
- 所选模型声明支持 Mask。
- 排序后的第一张目标图为 PNG。
- Mask 为真实 PNG，而不是只写了 `image/png` 的其他文件。
- PNG 含 Alpha 通道。
- Mask 尺寸与排序后的第一张目标图完全一致。
- `targetReferenceAssetId`（如有）与第一张图一致。
- Mask 解码后不超过 4MB。

校验失败返回 `INVALID_IMAGE_INPUT`、`CAPABILITY_UNSUPPORTED` 或 `PAYLOAD_TOO_LARGE`，`retryable=false`，不调用 Provider、不扣费、不降级为文生图。

OpenAI 官方说明：多输入编辑时 Mask 作用于第一张图；目标图和 Mask 需同格式、同尺寸，Mask 需包含 Alpha 通道。参考：[OpenAI Image generation guide](https://developers.openai.com/api/docs/guides/image-generation)。

## 7. 图片输入与 SSRF 防护

### 文件限制

- 支持真实 PNG、JPEG、WebP。
- 单张参考图最大 50MB。
- 所有参考图解码后合计最大 100MB。
- Prompt 最大 1MB。
- HTTP JSON/URL-encoded 请求体最大 150MB。
- 文件声明 MIME 必须与真实文件签名一致。

### 远程 URL 限制

- 只允许 HTTPS。
- 禁止 URL 用户名或密码。
- 禁止 localhost、`.local`、私网、回环、链路本地与保留 IP。
- DNS 解析结果包含受限地址即拒绝。
- 每次重定向重新校验，最多 3 次。
- 必须返回图片 Content-Type，并遵守 50MB 下载上限。
- Provider 返回图片 URL 时也使用相同安全下载器。

站内 `/api/...` 与 `obj_...` 对象键只通过受控的本机资产路径读取，不进入通用远程 URL 分支。

## 8. AI Studio 部署步骤

### 方式 A：导入完整源码包（推荐）

1. 复制当前 G1-R1 项目作为回滚副本，例如 `manwah-G1-R1-backup`。
2. 解压 `manwah-G2-R1.zip`。
3. 用压缩包内容覆盖 AI Studio 项目源码；不要上传 `node_modules/`、`dist/`、`.data/` 或 `debug.log`。
4. Provider 凭据继续由后台的部门或“全站系统”配置管理，不恢复旧环境变量 Key。
5. 在 AI Studio 终端执行：

```bash
npm install
npm run lint
npm test
npm run build
```

6. 验证全部通过后重新部署。

### 方式 B：手工同步

1. 新增 `server/ai/imageRequest.ts`、`server/ai/imageInputSecurity.ts`。
2. 替换 `server/ai/modelRegistry.ts`、`server/ai/imageProviderAdapter.ts`。
3. 同步 `server.ts` 的请求解析、图片预校验、Gemini payload、multipart、`gpt-image-2-all` JSON 和安全响应图片下载逻辑。
4. 同步 `src/types.ts` 与 `src/services/geminiService.ts`，确保前端发送意图、角色、顺序、资产 ID 和 Mask。
5. 同步两个模型选择界面，加入“GPT 多图”。
6. 加入 `tests/g2_image_edit_protocol.test.ts`，执行完整验证后再部署。

## 9. 上线冒烟验收

### Gemini 多图

1. 上传主产品图＋场景图，角色分别设为 `primary_product`、`scene_reference`。
2. 选择 Gemini 图像模型生成。
3. 抓取脱敏请求，确认 `inlineData` 顺序与 `order` 一致，且每张图前有角色标签。
4. 确认 `generationConfig.responseModalities` 包含 `TEXT`、`IMAGE`。

### 标准 GPT 多图编辑

1. 选择 `openai/gpt-image-2`，上传 2–3 张真实图片。
2. 确认调用 `/v1/images/edits`，请求为 multipart。
3. 确认多个同名 `image` 字段按顺序出现，文件名带角色，不出现 `/v1/images/generations` 降级。
4. 确认输出参数使用 `output_format`。

### Mask

1. 对第一张目标图绘制 Mask，生成带 Alpha 的同尺寸 PNG，应允许请求。
2. 改用 JPEG 假 Mask、无 Alpha PNG、不同尺寸 PNG：均应在上游调用前失败。
3. 将 Mask 指向第二张图的资产 ID：应返回 `INVALID_IMAGE_INPUT`。

### `gpt-image-2-all`

1. 先确认 VectorEngine 的当前生产账号真实支持模型 ID 与 `{ "image": ["URL1", "URL2"] }` 字段。
2. 使用 2 张公网 HTTPS 云端资产，选择“GPT 多图”，确认 JSON 请求到 `/v1/images/edits`。
3. 使用 Base64、本机地址或 RouterHub：应明确失败，不应切换为其他模型。

### 安全

- `http://...`、`https://127.0.0.1/...`、私网域名：应拒绝。
- 重定向到私网：应拒绝。
- MIME 伪造、损坏图片、总大小超过 100MB：应拒绝。
- 所有拒绝场景：不得调用 Provider，不得扣费。

## 10. 自动化验证结果

本交付版本已完成：

- `npm run lint`：通过，TypeScript 0 错误。
- `npm test`：11 个测试文件、61 项测试全部通过。
- `npm run build`：通过，前端和服务端成功构建。
- 静态检查：不存在 500MB JSON 请求上限。
- 静态检查：不存在直接 `fetch(item.url)` 的上游图片下载旁路。
- 静态检查：标准 GPT 请求使用 `output_format`。
- 静态检查：`gpt-image-2-all` 只注册为 VectorEngine 专有 JSON 编辑协议。

本地验证未调用付费模型、生产数据库或生产 Provider。生产可用性必须通过上述真实 Provider 冒烟测试确认，尤其是 `gpt-image-2-all` 的模型 ID、端点和字段兼容性。

## 11. 回滚

1. 将流量切回已验证的 G1-R1 部署。
2. 恢复 G1-R1 源码快照。
3. 不回退 G1-P0-R2 的密钥与认证修复，不恢复匿名代理或客户端自报身份。
4. 保存失败请求的 `requestId`、Provider、实际模型、HTTP 状态和脱敏错误，不保存 Base64 图片正文。

回滚 G2 后，必须同时从 UI 移除 `gpt-image-2-all`，避免前端展示服务端不认识的模型。
