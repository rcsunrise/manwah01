# 大模型 API 拓展与接入指南（二次开发文档）

本文档旨在梳理当前系统中以“API 网关代理模式”调用 Gemini 的底层实现逻辑，并提供**“如何接入并兼容其他模型 API（如 OpenAI、DeepSeek、Anthropic 等）”**的评估与改造指引。

---

## 1. 核心代理模块分析

目前系统通过 Express 代理接管前端所有的模型调用请求。核心路由位于 `server.ts` 中的：
`app.use(['/v1beta', '/v1alpha', '/v1'], async (req, res) => { ... })`

当前逻辑**深度绑定了 Google Gemini 与 RouterHub 的交互特征**。若要接入其他标准的第三方模型（如符合 OpenAI 标准的接口），现有的四大环节均需进行评估与改造：

### 1.1 模型名称获取与路径映射
**现状：**
目前程序通过解析请求 URL 来获取要计费的模型名称：
```typescript
const modelMatch = originalUrl.match(/models\/([^\:]+)/);
const model = modelMatch ? modelMatch[1] : 'unknown-model';
```
**改造点 / 痛点：**
如果是 OpenAI 格式（如调用 `POST /v1/chat/completions`），模型名称不在 URL 里，而是藏在**请求体** `req.body.model` 中。
**改造方案建议：**
针对不同的 URL 路径进行预判。如果是 `/v1/chat/completions`，则执行 `const model = req.body.model`，否则继续走正则 URL 解析。

### 1.2 认证信息 Header 构造
**现状：**
网关目前硬编码了鉴权方式。除非 `baseUrl` 包含 `routerhub` 才会使用 `Bearer` 模式，否则强制视为原生 Google 并带上 `x-goog-api-key` 和 URL Query `?key=`：
```typescript
if (baseUrl.includes("routerhub")) {
    headers["Authorization"] = `Bearer ${apiKey}`;
} else {
    headers["x-goog-api-key"] = apiKey;
    urlObj.searchParams.set("key", apiKey); // 挂在 targetUrl 上
}
```
**改造方案建议：**
剥离对 `routerhub` 的硬编码依赖，提供一种通用的鉴权判定分发机制（比如基于 `baseUrl` 是否包含 OpenAI、DeepSeek、Zhipu 等渠道判定去设置对应的 Header）。
```typescript
if (baseUrl.includes("routerhub") || baseUrl.includes("openai") || baseUrl.includes("deepseek")) {
    headers["Authorization"] = `Bearer ${apiKey}`;
} // 其它特殊校验...
```

### 1.3 计费与流式 Token 解析 (核心难点)
**现状：**
因为大模型的流式传输 (SSE) 无法直接读取完整的 HTTP JSON，系统拦截流式传输后，采用正则实时提取 Gemini 独有的 Token 参数：
```typescript
const pCountMatch = chunkStr.match(/"promptTokenCount"\s*:\s*(\d+)/);
const cCountMatch = chunkStr.match(/"candidatesTokenCount"\s*:\s*(\d+)/);
// ...并在流结束时进行调用计费 chargeUser(...)
```
**改造点 / 痛点：**
OpenAI 标准的返回中对应名称是 `"prompt_tokens"`, `"completion_tokens"`, `"total_tokens"`，且这些信息通常仅在返回最后一块流末尾的 `usage` 字段中出现。
**改造方案建议：**
在截获 chunk 字符串 `chunkStr` 时，应加入多模型格式兼容适配：
```typescript
// 兼容标准
const pCountMatch = chunkStr.match(/"promptTokenCount"\s*:\s*(\d+)/) || chunkStr.match(/"prompt_tokens"\s*:\s*(\d+)/);
const cCountMatch = chunkStr.match(/"candidatesTokenCount"\s*:\s*(\d+)/) || chunkStr.match(/"completion_tokens"\s*:\s*(\d+)/);
```

### 1.4 Test Connection 服务改造
**现状：**
`/api/ai/test-connection` 中硬编码探测的是 `${baseUrl}/v1beta/models/gemini-pro?key=${apiKey}`。
**改造方案建议：**
如果是全兼容网关，Test Connection 需要判断 `baseUrl`：若是 OpenAI，则探测 `${baseUrl}/v1/models` 或发送一段非常简短的 Chat Completion 用来验证连通性。

---

## 2. 评估结论与方案规划

基于上述分析，如果需要在不破坏现有 Gemini 稳定性的前提下**接入一套新的 API 标准（如 OpenAI 协议体系）**，开发可行性是【极高的】，但需重构底层判断。

我们建议采用 **“双引擎路由分离”** 的方案：

### 方案 A：单一入口智能识别（微型改造，目前推荐）
继续保留 `app.use(['/v1beta', '/v1alpha', '/v1'])`，但在内部进行协议切割：
1. **判断请求特征**: 如果 `req.originalUrl.includes('chat/completions')`，进入【OpenAI 代理逻辑】。
2. **提取模型**: 读取 `req.body.model` 取代 URL 正则。
3. **转换鉴权**: 统一附加 `Authorization: Bearer`。
4. **统一计费口径**: 正则监听 `prompt_tokens` 等标记位完成异步扣费。

### 方案 B：拆分代理路由（重度扩展）
在 `server.ts` 中针对标准的 OpenAI 协议开辟一条全新代理链路。后端提供两个端点：
- 原生 Gemini 代理侧：`app.use(['/v1beta', '/v1alpha'])`
- OpenAI 兼容代理侧：`app.use('/v1/chat/completions')`
对于多渠道集成，这是一种扩展性更高的方式，能分别封装不同的计费监听和 Header 拼装方法，代码更加清晰解耦。

---

## 3. 部署此方案的潜在影响
* **依赖库**：纯网络透传与字符串正则解析（`TextDecoder`），无需安装额外的 NPM SDK 即可直接支持原生 SSE 代理。
* **额度计费系统（`chargeUser`）**：对底层无任何影响。只需要在网关提取出正确的 `totalTokens` 传入 `chargeUser` 就能复用原有的限流与计账模块。
