# MANWAH AI 智能研发中心 - 项目架构与迁移部署指引指南

本指南梳理了当前应用项目的核心技术栈、环境依赖、文件结构，以及如何将其从当前 AI Studio 开发环境迁移部署到第三方云平台（如 Vercel, 谷歌云 Cloud Run，或是私有服务器）的完整步骤。

## 1. 核心架构与技术栈

本项目采用 React/Vite 前端与 Node.js Express 服务端的一体化架构，适合 AI Studio 导出后部署到 Cloud Run、Docker 或其他可运行 Node.js 服务的环境。

*   **前端框架**: React 19 + Vite 6
*   **前端样式**: Tailwind CSS v4, Lucide React (图标), framer-motion (动画)
*   **路由**: `react-router-dom` 
*   **后端服务层**: Express.js（`server.ts`）
*   **核心 API 集成**: 
    *   **统一模型网关**: 通过 `/api/gateway/generate-image` 和服务端 AI Client 调用后台配置的模型 Provider。
    *   **Supabase**: 负责认证、部门 Provider 配置、Storage 与业务数据。

## 2. 关键环境变量 (Environment Variables)

无论部署到哪个平台，都需要配置以下环境变量（Secrets）：

| 变量名 | 说明 | 必需 |
| :--- | :--- | :--- |
| `SUPABASE_URL` | Supabase 项目 URL | 是 |
| `SUPABASE_ANON_KEY` | Supabase 浏览器 Anon Key | 是 |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase 服务端管理密钥 | 是 |
| `SUPABASE_STORAGE_BUCKET` | 画布资产 Bucket 名称 | 否 |

模型 Provider 的服务地址和凭据不再使用项目环境变量；由管理员在系统的部门或“全站系统”配置中维护。

## 3. 部署至 AI Studio / Docker / 私有服务器 / Cloud Run

本工程内部提供了一份基于 Express 的 `server.ts` 文件。在 Docker 或者私有 Node 服务器里，它将充当一个标准的全栈 Server，提供 API 代理，并同时利用 `express.static` 挂载 `dist` 前端构建产物。

### 步骤 (基于普通 Node.js 服务器)
1. **环境准备**: 服务器需安装 Node.js (推荐 v20 以上版本)。
2. **安装依赖**:
   ```bash
   npm install
   ```
3. **设置 Supabase 环境变量**：按第 2 节配置认证与数据服务所需变量。模型 Provider 凭据在系统后台配置，不写入 `.env`。
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
2. 构建并推送 Docker 镜像，在 Cloud Run 建立服务，并仅将第 2 节所列 Supabase 服务端配置作为 Secrets 注入。

## 5. 项目中的特定逻辑处理注意事项

* **图像转发处理**: `server.ts` 的统一网关处理 Base64、图片 URL 与不同 Provider 响应格式。
* **API 请求流**: 浏览器只调用同源业务接口；服务端根据当前用户所属部门或全站配置选择 Provider，并在服务端添加凭据。
* **蒙版（Mask）接口**: 如果使用该工具制作遮罩图或者去背景预处理功能，`/api/pre_process/mask` 会捕获文件。如果是内网使用，可能需要补充和检查 `Supabase` 那套真实的数据库连接配置。如果不涉及真实存储，目前也提供了 `dummy` 的 mock 返回结构供纯客户端流程跑通。

## 6. 总结迁移排障项

1. 出错 **“未配置有效 API KEY”**：检查当前用户部门或“全站系统”的 Provider 配置，不要新增旧环境变量回退。
2. Provider 生成失败：检查后台保存的 Base URL、凭据、模型权限、额度与上游状态。
3. 出错 **CORS**：检查 `server.ts` 的 CORS 与部署域名配置；不要恢复已经移除的开放代理接口。
