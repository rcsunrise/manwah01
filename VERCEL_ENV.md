# Vercel 部署及多应用配置指南 (Phase 2: 融合与多应用设置)

本项目目前已被重构为 **多应用路由架构 (Multi-App Routing)**，并且已经完成了将新上传程序 (MANWAH 智能研发中心) 搬迁的工作。

## 环境变量配置

在 Vercel 或当前部署环境中，配置如下环境变量：

### 1. `ROUTERHUB_API_KEY` (或 `GEMINI_API_KEY` 作为回退)
*   **配置名称 (Key)**: `ROUTERHUB_API_KEY`
*   **配置值 (Value)**: 您的 RouterHub API 密钥（例如：`rh_live_xxxxxxxx...`）
*   **说明**: 我们使用了后端代理 (`/api/routerhub/generate-image`)，该代理支持 `/routerhub` 基础程序以及 `/manwah` 新应用程序。它们都统一通过该网关发起图像生成请求。

### 2. `SUPABASE_URL` 和 `SUPABASE_SERVICE_KEY`
*   **说明**: MANWAH 智能研发中心的通道和遮罩流程可能会用到存储上传，您需要配置这组凭证。

---

## 应用程序路径合并 (Completed Migration)
*   前往 `/` 查看您的 Application Hub（应用门户）。
*   您可以访问 `/routerhub` 来查阅极简的 RouterHub 实验生成器。
*   您可以访问 `/manwah` 来查阅融合后采用 RouterHub 模型的 **MANWAH Studio 智能研发中心**。

> **⚠️ 注意：**
> 在 Vercel 中，我们建议将部署配置调整指向 `package.json` 中的构建脚本。系统会自动使用 `node dist/server.cjs` 启动整合好后端的 Express 应用。

