<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# MANWAH AI - 国内商品企划中心

This application is a premium interior design and image editing assistant tailored for industrial furniture design and planning.

## 🚀 Prerequisites

- **Node.js**: v22.x or higher recommended
- **Database**: Supabase (PostgreSQL)

## ⚙️ Environment Variables

Create a `.env.local` or `.env` file at the root of the project with the following keys:

```env
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

ADMIN_USERNAME=your_admin_username
ADMIN_PASSWORD=your_admin_password
USER_USERNAME=your_user_username
USER_PASSWORD=your_user_password
```

模型供应商凭据不再通过项目环境变量配置。请由管理员登录系统，在部门或“全站系统”的 Provider 配置中维护服务地址与凭据；浏览器端不会读取这些凭据。

## G1 AI Provider 架构

- `server/ai/providerConfig.ts`：唯一的部门/全站 Provider 配置解析入口。
- `server/ai/modelRegistry.ts`：显式模型、别名、Provider 兼容性和图像能力注册表。
- `server/ai/imageProviderAdapter.ts`：Gemini Native 与 OpenAI Images 端点适配。
- `server/ai/imageResponse.ts`：统一 `images[]` 响应，并保留旧 `candidates` 兼容字段。
- `server/ai/providerError.ts`：统一错误类别、HTTP 状态与 `retryable` 标记。

图像编辑请求只允许走编辑端点；参考图无效时会明确失败，不会静默降级为文生图。模型切换只允许使用注册表中的显式别名，不按名称中的 `flash`/`pro` 进行模糊改写。

## 🛠️ Initialization & Setup

### 1. Database Initialization
Ensure that your Supabase instance is running. You need to configure proper Row Level Security (RLS) policies for your tables (`profiles`, `usage_logs`, `department_configs`, etc.) according to your access needs.

### 2. Create Admin and Test Users
Run the provided scripts to seed initial users with environment variables provided above:
```bash
npx tsx scripts/create_admin.ts
npx tsx scripts/create_user.ts
```

## 💻 Development & Deployment

### Run Locally
Install dependencies:
```bash
npm install
```
Start the development server:
```bash
npm run dev
```

### Production Build
Build the client and server application:
```bash
npm run build
```
Start the production application:
```bash
npm run start
```

## 🧪 Testing

We use Vitest for automated testing.
```bash
npm run test
```
