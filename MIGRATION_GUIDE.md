# MANWAH AI 智能研发中心 - 项目架构与迁移部署指引指南

本指南梳理了当前应用项目的核心技术栈、环境依赖、文件结构，以及如何将其从当前 AI Studio 开发环境迁移部署到第三方云平台（如 Vercel, 谷歌云 Cloud Run，或是私有服务器）的完整步骤。

## 1. 核心架构与技术栈

本项目采用了**前后端同构兼容**的混合架构，既支持标准的 Node.js Express 启动（用于 Docker / Cloud Run），也支持 Vercel 的 Serverless Edge Functions 体系。

*   **前端框架**: React 19 + Vite 6
*   **前端样式**: Tailwind CSS v4, Lucide React (图标), framer-motion (动画)
*   **路由**: `react-router-dom` 
*   **后端服务层**: 
    1. Express.js (`server.ts` - 用于独立部署环境)
    2. Vercel Serverless API (`api/` 目录 - 用于 Vercel 托管)
*   **核心 API 集成**: 
    *   **Google Gemini API**: 核心逻辑链分析、AEP属性提取等基础 AI 能力。
    *   **RouterHub AI proxy**: 主要接管图像生成 (`/api/routerhub/generate-image` 和 `/api/proxy`)，支持标准的 Gemini 模型和基于 OpenAI 格式的 Flux / Midjourney 等模型生成。
    *   **Supabase / Firebase**: 结构预留（如 Supabase Storage / 本地存储）处理蒙版生成和长短期数据逻辑。

## 2. 关键环境变量 (Environment Variables)

无论部署到哪个平台，都需要配置以下环境变量（Secrets）：

| 变量名 | 说明 | 必需 |
| :--- | :--- | :--- |
| `GEMINI_API_KEY` | Google Gemini 的原生 API Key。用作默认底座大模型推理和兜底生成。 | 是 |
| `ROUTERHUB_API_KEY` | RouterHub API Key，接入它支持多模态及三方模型 (如 Flux, Midjourney 等)。有此 Key 时会自动优先接管相关请求。 | 否 (但推荐) |
| `SUPABASE_URL` | （根据需要）上传蒙版图片所用的 Supabase 数据库 URL | 否 |
| `SUPABASE_SERVICE_KEY` | （根据需要）上传蒙版图片所用的 Supabase 密钥 | 否 |

## 3. 部署方案一：部署至 Vercel (推荐，最便捷)

项目已经内置了 `vercel.json` 配置和 `/api` Serverless 路由结构，可直接无缝推送到 Vercel。

### 步骤
1. **代码托管**: 将从 AI Studio 下载好的源代码 ZIP 文件解压，提交到您的个人 GitHub (或 GitLab/Bitbucket) 仓库。
2. **导入项目**: 登录 [Vercel](https://vercel.com/)，点击 `Add New... -> Project`，导入您的 GitHub 仓库。
3. **框架配置**:
   *   **Framework Preset**: 选择 `Vite`。
   *   **Build Command**: Vercel 会自动解析 `package.json` 中的命令并设定为 `npm run build`。
   *   **Output Directory**: `dist` 
4. **环境变量设置**:
   *   在 Vercel 部署前展开 "Environment Variables" 区域。
   *   添加 `GEMINI_API_KEY` 和 `ROUTERHUB_API_KEY`。
5. **点击 Deploy**: 部署并等待完成。

> **Vercel 解析原理**: 项目内存在并配置了 `vercel.json` 文件和 `/api/` 文件夹。Vercel 构建时，由 `/api/proxy.ts` 等文件承担原 `server.ts` 的接口代理工作。前端路由也能自动兜底至 `index.html`。

---

## 4. 部署方案二：部署至 Docker / 私有服务器 / 谷歌云 Cloud Run

本工程内部提供了一份基于 Express 的 `server.ts` 文件。在 Docker 或者私有 Node 服务器里，它将充当一个标准的全栈 Server，提供 API 代理，并同时利用 `express.static` 挂载 `dist` 前端构建产物。

### 步骤 (基于普通 Node.js 服务器)
1. **环境准备**: 服务器需安装 Node.js (推荐 v20 以上版本)。
2. **安装依赖**:
   ```bash
   npm install
   ```
3. **设置环境变量**:
   在项目根目录创建一个 `.env` 文件：
   ```env
   GEMINI_API_KEY=your_gemini_key_here
   ROUTERHUB_API_KEY=your_routerhub_key_here
   ```
4. **构建项目**:
   ```bash
   npm run build
   ```
   *说明：此命令会在 `dist` 文件夹内生成所有的客户端应用代码和打包好的 `server.cjs` 后端执行文件。*
5. **正式启动**:
   ```bash
   npm run start
   ```
   此时项目默认在 `3000` 端口启动 (`http://localhost:3000`)。如需在后台稳定运行，可以配合使用 `pm2` (`pm2 start npm --name "manwah-ai" -- run start`)。

### 步骤 (基于 Docker / Cloud Run)
如果想自行部署到 Cloud Run：
1. 请提供一个基础版的 `Dockerfile`:
   ```dockerfile
   FROM node:22-alpine
   WORKDIR /app
   COPY package*.json ./
   RUN npm ci
   COPY . .
   RUN npm run build
   EXPOSE 3000
   ENV PORT=3000
   CMD ["npm", "run", "start"]
   ```
2. 构建并推送 Docker 镜像，在 Google Cloud Run 界面依据该镜像建立新服务，并将上文提到的对应 Secrets 配置进环境变量即可。

## 5. 项目中的特定逻辑处理注意事项

* **图像转发处理**: `server.ts` 与 `/api/routerhub/generate-image.ts` 处理了 `base64` 与不同服务商 API 的兼容转换（比如调用 RouterHub 的 Flux/Midjourney 时如果目标下发只带有 URL 而非基底 base64，我们的后端代理会自动将其拉取并转换为 base64 发给前端)。
* **API 请求流**: 核心的 Gemini 调用和流式处理会被发往 `/v1beta`，而后被 Vercel proxy（或 express 中间件）拦截并添加对应密钥，这有效保障了前端不泄露您的 API Key 密钥。
* **蒙版（Mask）接口**: 如果使用该工具制作遮罩图或者去背景预处理功能，`/api/pre_process/mask` 会捕获文件。如果是内网使用，可能需要补充和检查 `Supabase` 那套真实的数据库连接配置。如果不涉及真实存储，目前也提供了 `dummy` 的 mock 返回结构供纯客户端流程跑通。

## 6. 总结迁移排障项

1. 出错 **"API Key is missing"**: 检查平台环境变量中是否确实配置生效了对应的密钥。
2. 出错 **RouterHub 生成无效 / Flux 失败**: 确保您的 `ROUTERHUB_API_KEY` 有效，或者 RouterHub 中绑定的付款/额度正常。
3. 出错 **CORS** (跨域错误): 如果是拆分了前后端，并且不在同一个域下，需要在 `server.ts` 或 `api/proxy.ts` 里手动维护并放行 `Access-Control-Allow-Origin`。目前已配置为 `*` (允许全部跨域调用)。
