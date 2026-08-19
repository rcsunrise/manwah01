# G1-R1｜Provider Adapter、模型能力注册表与统一错误响应

版本：G1-R1  
基线：G1-P0-R2  
日期：2026-08-04

## 1. 本轮目标与边界

本轮完成以下内容：

1. 合并两套 Provider 配置解析，部门配置优先，其次为“全站系统”。
2. 建立显式图像模型能力注册表，声明真实模型 ID、显式别名、调用协议、Provider 兼容性、文生图/编辑/多图/蒙版能力和参考图数量。
3. 建立 Gemini Native 与 OpenAI Images Provider Adapter。
4. 停止根据模型名称中的 `flash` 或 `pro` 强制改写为 `gemini-2.5-flash-image`。
5. 图像编辑参考图无效时明确失败，禁止转为 `/v1/images/generations`。
6. 统一图像响应与 Provider 错误分类，并保留旧前端兼容字段。
7. 为 `/v1beta`、`/v1alpha`、`/v1` 通用代理补上 Bearer Token 认证。

本轮不包含：`gpt-image-2-all`、ImageRole、严格蒙版像素校验、Responses API、任务持久化、原子计费、熔断和幂等账本；这些分别属于 G2、G3、G4。

## 2. 修改文件

### 新增

- `server/ai/providerConfig.ts`
- `server/ai/modelRegistry.ts`
- `server/ai/imageProviderAdapter.ts`
- `server/ai/imageResponse.ts`
- `server/ai/providerError.ts`
- `tests/g1_provider_architecture.test.ts`
- `G1_R1_AI_STUDIO_操作与验收文档.md`

### 修改

- `server.ts`
- `server/utils/aiClient.ts`
- `src/services/geminiService.ts`
- `README.md`

## 3. 统一 Provider 配置

唯一配置解析入口为：

```text
server/ai/providerConfig.ts::resolveApiConfig(userUuid)
```

解析顺序：

```text
当前用户 profiles.dept_id
→ 对应 department_configs
→ “全站系统” department_configs
→ 无配置时返回 source=none，由调用端明确失败
```

`server.ts` 与 `server/utils/aiClient.ts` 不再各自维护一套查询逻辑。

## 4. 当前显式模型能力

| UI/请求模型 | 实际模型 | 协议 | Provider | 文生图 | 图像编辑 | 多图 | 蒙版声明 |
|---|---|---|---|---:|---:|---:|---:|
| `gemini-2.5-flash` | `gemini-2.5-flash-image` | Gemini Native | Google/RouterHub/VectorEngine | 是 | 是 | 是 | 否 |
| `gemini-3.1-flash-image-preview` | 同名 | Gemini Native | Google/RouterHub/VectorEngine | 是 | 是 | 是 | 否 |
| `gemini-3.1-flash-image` | 同名 | Gemini Native | Google/RouterHub/VectorEngine | 是 | 是 | 是 | 否 |
| `google/gemini-3-pro-image-preview` | `gemini-3-pro-image-preview` | Gemini Native | Google/RouterHub/VectorEngine | 是 | 是 | 是 | 否 |
| `google/gemini-3-pro-image` | `gemini-3-pro-image` | Gemini Native | Google/RouterHub/VectorEngine | 是 | 是 | 是 | 否 |
| `openai/gpt-image-1` | `gpt-image-1` | OpenAI Images | RouterHub/VectorEngine | 是 | 是 | 是 | 是 |
| `openai/gpt-image-1.5` | `gpt-image-1.5` | OpenAI Images | RouterHub/VectorEngine | 是 | 是 | 是 | 是 |
| `openai/gpt-image-2` | `gpt-image-2` | OpenAI Images | RouterHub/VectorEngine | 是 | 是 | 是 | 是 |

注意：注册表中的“蒙版声明”仅表示调用协议允许。PNG 签名、透明通道、尺寸一致性等严格校验仍在 G2 实现。

未注册模型会在调用 Provider 前返回 `MODEL_NOT_FOUND`；不兼容的 Provider/模型组合返回 `CAPABILITY_UNSUPPORTED`，不会尝试猜测或跨模型切换。

## 5. 统一响应与错误

成功响应新增统一字段：

```json
{
  "success": true,
  "images": [{ "mimeType": "image/png", "data": "..." }],
  "actualModel": "gemini-3.1-flash-image",
  "provider": "routerhub",
  "providerRequestId": "...",
  "finishReasons": ["STOP"],
  "usage": {},
  "candidates": []
}
```

`candidates` 暂时保留，保证旧页面正常工作；新代码应优先读取 `images[]`。

错误响应：

```json
{
  "error": {
    "code": "RATE_LIMITED",
    "category": "rate_limited",
    "message": "...",
    "retryable": true,
    "provider": "routerhub",
    "model": "gemini-3.1-flash-image",
    "upstreamStatus": 429,
    "requestId": "req_..."
  }
}
```

主要错误类别：`invalid_request`、`invalid_image_input`、`authentication`、`permission_denied`、`model_not_found`、`capability_unsupported`、`payload_too_large`、`rate_limited`、`timeout`、`upstream_unavailable`、`invalid_upstream_response`、`internal_error`。

前端遇到 `retryable=false` 会停止固定重试，避免能力错误、认证错误和无效图片重复请求。

## 6. AI Studio 修改步骤

### 方式 A：导入完整源码包（推荐）

1. 在 AI Studio 复制当前项目作为回滚副本，例如 `manwah-G1-P0-R2-backup`。
2. 解压 `manwah-G1-R1.zip`。
3. 用压缩包内文件覆盖项目源码，不上传以下目录：
   - `node_modules/`
   - `dist/`
   - `.data/`
   - `debug.log`
4. 确认 AI Studio Secrets 仅保留 Supabase 服务端配置；Provider 凭据继续在系统后台的部门或“全站系统”配置中维护。
5. 重新安装依赖并执行：

```bash
npm install
npm run lint
npm test
npm run build
```

6. 重新部署并等待新实例健康。

### 方式 B：在现有项目手工同步

1. 新建整个 `server/ai/` 目录及其中 5 个文件。
2. 替换 `server/utils/aiClient.ts`，确认它只导入并复用 `resolveApiConfig`。
3. 同步 `server.ts`：导入注册表/Adapter/响应/错误模块，删除原本的本地 `resolveApiConfig()`、`getGlobalApiConfig()`、`getFallbackConfig()`。
4. 同步 `src/services/geminiService.ts`，删除前端模型强制映射及 503 时跨模型切换。
5. 加入 `tests/g1_provider_architecture.test.ts`。
6. 执行类型检查、测试和构建后再部署。

## 7. 上线验收

### 认证

- 不带 Authorization 调用 `/api/gateway/generate-image`：应为 401。
- 不带 Authorization 调用 `/v1beta/...`、`/v1alpha/...`、`/v1/...`：应为 401。
- 合法用户 Token：按用户部门读取 Provider；部门无配置时读取“全站系统”。

### 模型保持

- 选择 `gemini-3.1-flash-image`：响应 `actualModel` 必须仍为该模型。
- 选择 `google/gemini-3-pro-image`：实际模型必须为 `gemini-3-pro-image`。
- 选择 `openai/gpt-image-2`：实际模型必须为 `gpt-image-2`。
- 提交未注册模型：网络请求不应到达上游，返回 `MODEL_NOT_FOUND`。

### 编辑禁止降级

- GPT 带有效参考图：必须请求 `/v1/images/edits` 且为 multipart。
- GPT 参考图为空、损坏或无法解析：返回 `INVALID_IMAGE_INPUT`。
- 上述失败场景不得出现 `/v1/images/generations` 请求。

### 响应与错误

- 成功响应包含 `images[]`、`actualModel`、`provider`。
- 429 返回 `category=rate_limited`、`retryable=true`。
- 401/403、模型不兼容、无效参考图返回 `retryable=false`。
- Provider 原始响应正文及 Base64 不应写入普通日志。

## 8. 自动化验证结果

本交付版本已完成：

- `npm run lint`：通过，TypeScript 0 错误。
- `npm test`：10 个测试文件、54 项测试全部通过。
- `npm run build`：通过，前端与服务端均成功构建。
- 静态检查：仅存在一套 `resolveApiConfig()` 实现。
- 静态检查：不存在按 `flash/pro` 模糊改写到 2.5 Flash 的逻辑。
- 静态检查：不存在 GPT/Gemini 跨模型候选数组。
- 静态检查：通用 AI 代理已挂 `authenticateToken`。

## 9. 回滚

若上线后出现兼容问题：

1. 将流量切回 G1-P0-R2 的已验证部署。
2. 恢复 G1-P0-R2 源码快照。
3. 不恢复旧 Provider 环境变量 Key，不恢复 `x-user-id` 或匿名代理。
4. 保存失败请求的 `requestId`、模型、Provider、HTTP 状态及脱敏错误体，供下一轮修复。

回滚只回退 G1-R1 的模型路由层，不应回退两个 P0 安全修复。
