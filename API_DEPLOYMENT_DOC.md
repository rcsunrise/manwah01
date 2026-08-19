# 🚀 应用程序 API 接口与部署指南（2026版）

## 一、 系统架构说明

本应用采用中转代理架构：
- **前端 (src/)**: React 应用，包含各业务组件（如图片上传、AI生成面板、提示词重写等），请求自身所在服务器的相对路径接口。
- **后端 (server.ts)**: Express 服务，作为轻量网关，所有外部大模型和云服务的调用均在此进行进行身份验证、Token鉴权扣费、以及代理转发。此架构非常成熟，保障了跨域问题（CORS）与敏感信息（API Keys、Supabase后台全权限密钥）的安全性。

## 二、 核心 HTTP POST 路由映射
无论部署在什么平台，服务器端都实现了以下核心 HTTP 路由代理：

### 1. 媒体前置处理 (自建业务)
- **Endpoint**: `POST /api/pre_process/mask`
- **功能**: 本地处理清洁图与遮罩图，将其转化为 Base64 并上传至云端 Supabase Storage。

### 2. RouterHub 与 VectorEngine 大模型代理
当前服务器在 `resolveApiConfig` 和统一代理中通过 Supabase 的 `admin_notes` 和 `profiles` 动态解析配置信息。并在统一处理时支持了如下供应商格式：
- RouterHub 格式 (基于 Google 原生形式的增强包装，通过 `/v1beta/` 代理)
- VectorEngine 向量API 格式 (完全兼容 OpenAI 形态模型请求或标准 Gemini 请求)

支持以下核心端点请求代理：
- **聊天补全 / OpenAI代理端点**: `POST /v1/chat/completions` (被代理通道覆盖)
- **图片生成 (DALL-E格式)**: `POST /v1/images/generations` (被代理通道覆盖)
- **图片编辑 (DALL-E格式)**: `POST /v1/images/edits` (被代理通道覆盖)
- **原生 Gemini 文本生成**: `POST /v1beta/models/...:generateContent`
- **统一图片生成/编辑网关**: `POST /api/gateway/generate-image`

### 3. Supabase 数据存储与配置注入
在最新版本中，**Global Config（全局设定）** 与部门配置统一存入 Supabase 的 `department_configs`。`server.ts` 使用服务端 Supabase 管理客户端读取配置，并根据经过认证的用户 UUID 选择所属部门或“全站系统”的 **RouterHub**、**VectorEngine** 或其他兼容 Provider：
```sql
-- department_configs 关键字段示意：
{
  "dept_name": "全站系统",
  "api_base_url": "...",
  "api_key": "...",
  "routing_mode": "...",
  "method1_key": "..."
}
```

## 三、 用户切换管理与控制面板使用指南
为方便管理，我们在前端“控制面板”的“小书本”中增加了一个新的管理页面（**API 路由设置**）：
1. 在网页界面点击顶部工具栏的 小书本 (Admin Notepad) 图标进入维护面板。
2. 切换至“API 路由设置” Tab。
3. 您可以自由切换当前的 Global API Provider 为 【RouterHub API】 或 【向量引擎 (VectorEngine)】。
4. 输入或检查两边的 `baseUrl` 与 `API Key`，点击保存。设置会通过具全权限的后端密钥热更新至云端（即时生效）。
5. 员工在访问时，如果未配置部门专项API，程序会自动 fallback 到您刚刚设定的这个默认通道。

### 总结
基于此指南所运行的 `server.ts` 既是本应用的安全网关，也是动态调配多模态生成资源的引擎。所有请求都会携带员工标识进入服务器端，进而进行预校验与后端真实 API 请求转换，做到全方位的风控与负载分离。
