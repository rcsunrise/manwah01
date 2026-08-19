# MANWAH AI 国内商品企划中心 - 项目技术文档

本文档全面整理了项目的架构设计、核心技术栈、文件目录结构、AI & 数据库服务调用逻辑、计费与扣费机制、权限体系及下一步开发指引，便于后续快速迭代与二次开发。

---

## 1. 项目概述与技术栈

### 1.1 项目简介
MANWAH AI 是专为工业家居设计与企划打造的 AI 智能创作与管理平台。支持多通道 AI 图像生成、材质与细节重构（AEP）、智能扩图、视频生成、部门额度管控、多级管理员权限及消费统计仪表盘。

### 1.2 核心技术栈
- **前端框架**：React 19 + TypeScript + Vite 6
- **样式框架**：Tailwind CSS v4 + Motion
- **路由与状态**：React Router v7 + TanStack React Query v5
- **后端服务**：Node.js (v22+) + Express 5 + esbuild (打包 CJS 单文件 `dist/server.cjs`)
- **数据库与认证**：Supabase (PostgreSQL + RLS + GoTrue Auth)
- **AI 供应商接入**：
  - Gemini API (`@google/genai` 官方 SDK)
  - RouterHub API (多模型路由与代理)
- **测试框架**：Vitest

---

## 2. 目录结构与架构设计

```text
/
├── api/                        # Serverless/代理函数目录
├── public/                     # 静态资源文件
├── scripts/                    # 初始化与运维脚本 (create_admin.ts, create_user.ts)
├── tests/                      # 单元测试与集成测试 (Vitest)
├── src/
│   ├── components/             # React UI 基础与业务组件
│   │   ├── AEPPanelNew.tsx         # AEP 材质与局部分析面板
│   │   ├── AdminHeader.tsx         # 后台管理顶部导航
│   │   ├── BalanceDisplay.tsx      # 用户余额与额度实时显示组件
│   │   ├── GeneratedViewNew.tsx    # 渲染生成图、比较与操作区
│   │   ├── HistoryModalNew.tsx     # 历史记录模态框
│   │   ├── ImageUploaderNew.tsx    # 图片上传与局部 Mask 处理组件
│   │   ├── Layout.tsx              # 主界面响应式布局容器
│   │   ├── ProductChannelMaskNew.tsx # 遮罩与通道编辑组件
│   │   └── PromptBuilderNew.tsx    # 提示词词典与生成构建器
│   ├── data/                   # 词典数据 (craftVocab.ts 等)
│   ├── lib/                    # 公共客户端库
│   │   └── supabase.ts             # 浏览器端 Supabase Anon 客户端
│   ├── pages/                  # 页面路由视图
│   │   ├── AdminUsers.tsx          # 用户与额度管理页面
│   │   ├── Dashboard.tsx           # 统计仪表盘与日志页面
│   │   ├── DepartmentBilling.tsx   # 部门计费与充值管理页面
│   │   ├── Login.tsx               # 登录与认证页面
│   │   ├── ManwahStudio.tsx        # 核心 AI 图像生成与编辑工作台
│   │   └── Profile.tsx             # 个人中心与密码修改
│   ├── services/               # 核心业务服务层
│   │   ├── dbService.ts            # Supabase 前端数据库查询与本地缓存
│   │   ├── geminiService.ts        # AI 交互代理、生成请求与计算层
│   │   └── routerHubService.ts     # 路由站与中间服务
│   ├── App.tsx                 # 路由配置与动态 Lazy 引入
│   ├── constants.ts            # 全局模型与计费常量配置
│   ├── index.css               # Tailwind CSS 全局样式
│   ├── main.tsx                # 应用入口与兼容补丁
│   └── types.ts                # 共享 TypeScript 类型定义
├── server.ts                   # Express 后端全量 API 与代理中间件
├── vite.config.ts              # Vite 构建与环境变量替换注入
└── package.json                # 项目依赖与脚本配置
```

---

## 3. 核心功能模块与实现逻辑

### 3.1 异步认证与权限控制
- 前端通过 `RequireAuth` 保护受特权路由 (`/dashboard`, `/admin/users`, `/admin/billing`)。
- 所有敏感的管理接口（如 `/api/admin/create-user`、`/api/admin/reset-password`）均在后端通过 Bearer Token 校验 Supabase 用户 JWT，并查询 `profiles` 表的 `role` 字段是否为 `admin` 或 `dept_admin`。

### 3.2 AI 服务接入与代理层
- **服务端统一代理**：所有模型 Provider 通信均由 `server.ts` 后端网关和统一 AI Client 发起，严禁在前端暴露 Provider 凭据。
- **高可用与回退策略**：Gemini 服务在 `server.ts` 中配置了供应商故障容错与错误捕获机制，自动解析输出 Base64 或图片 URL。

### 3.3 扣费与计费机制 (Billing Architecture)
- **原子扣费**：每次生成前，后端验证用户可用余额（`quota_limit - quota_used`）。只有当 AI 供应商成功返回图像后，才执行服务端扣费。
- **退款与幂等**：若任务超时或供应商报错，后端记录日志并保障不扣费；生成失败支持 `/api/admin/refund-log` 幂等退款。
- **精准点数计算**：按模型单价与输入/输出 Token、分辨率（如 4K 额外系数）实时计算。

---

## 4. 环境变量说明

在 `.env` 或 `.env.local` 中配置以下环境变量：

| 变量名 | 类型 | 说明 |
| :--- | :--- | :--- |
| `SUPABASE_URL` | 公开/服务端 | Supabase 项目 URL |
| `SUPABASE_ANON_KEY` | 浏览器公开 | Supabase Anon 客户端 Key |
| `SUPABASE_SERVICE_ROLE_KEY` | 服务端私钥 | Supabase 管理员 Service Role Key（严禁暴露至前端） |
| `ADMIN_USERNAME` | 脚本变量 | `scripts/create_admin.ts` 使用的初始账号 |
| `ADMIN_PASSWORD` | 脚本变量 | `scripts/create_admin.ts` 使用的初始密码 |

模型 Provider 的 Base URL 与凭据统一存放在 Supabase `department_configs` 中，由部门配置或“全站系统”配置解析；不再提供项目环境变量形式的旧 Provider Key 回退。

---

## 5. 开发与部署命令

```bash
# 1. 安装项目依赖
npm install

# 2. 启动本地开发服务器 (端口 3000)
npm run dev

# 3. 运行 TypeScript 类型检查
npm run lint

# 4. 运行 Vitest 自动化单元测试
npm run test

# 5. 执行生产环境打包 (前端 Vite + 后端 esbuild 单文件 bundling)
npm run build

# 6. 启动生产环境 Node 服务器
npm run start
```

---

## 6. 下一步功能开发指引

1. **扩展新模型支持**：
   - 在 `src/constants.ts` 中添加新模型的名称、别名与计费公式。
   - 在 `server.ts` 的模型路由逻辑中配置适配器。
2. **新增后台管理功能**：
   - 前端在 `src/pages/` 下创建新视图，并在 `src/App.tsx` 中使用 `React.lazy()` 注册路由。
   - 后端在 `server.ts` 添加以 `/api/admin/` 开头的 API 路由，必须包含 JWT Bearer Header 校验与角色判断。
3. **新增单元测试**：
   - 在 `tests/` 目录下新增 `*.test.ts` 文件，覆盖计算公式或数据转换逻辑，运行 `npm run test` 进行验证。
