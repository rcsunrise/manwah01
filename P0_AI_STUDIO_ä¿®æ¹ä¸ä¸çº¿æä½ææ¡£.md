# 敏华 AI 程序 G1｜两个 P0 安全问题修改与 AI Studio 上线操作文档

版本：G1-P0-R1  
日期：2026-08-04  
适用源码：`manwah.zip` 真实源码包  
本轮边界：只处理两个 P0，不修改模型注册表、Provider Adapter、模型映射、计费或 Agent Mock。

## 1. 本轮处理结论

两个 P0 已在修复包中完成：

1. Provider API Key 不再通过 `vite.config.ts` 的 `define` 编译进浏览器 JavaScript。
2. 服务端不再信任客户端提供的 `x-user-id`，也不再把未登录、无角色或 `system` 用户默认为管理员。

认证后的唯一身份来源为 Supabase Bearer Token。服务端调用 `supabaseAdmin.auth.getUser(token)` 验证 Token，再从 `profiles` 表读取角色和部门。客户端传来的用户 ID 不能决定登录身份或管理员权限。

## 2. 为什么必须先处理

### P0-1：Provider Key 被编译进前端

原 `vite.config.ts` 将以下服务器密钥注入浏览器包：

```text
GEMINI_API_KEY
BAILIAN_API_KEY
ROUTERHUB_API_KEY
```

只要部署时设置了这些变量，访问者就可能从浏览器下载的 JS 中恢复密钥。删除代码并不能自动撤销已经泄露的旧 Key，因此上线时必须执行第 7 节的密钥轮换。

### P0-2：客户端可伪造身份并取得管理员权限

原服务端存在三层危险回退：

```text
x-user-id → role=admin
无用户 → system/admin
用户资料无 role → admin
```

攻击者无需有效登录 Token 即可能伪造任意用户身份。修复后，缺少 Token 返回 401；无效 Token 返回 401；已经认证但没有 `profiles` 资料返回 403；未知角色按最低权限 `user` 处理。

## 3. 已修改文件

| 文件 | 修改目的 |
|---|---|
| `vite.config.ts` | 删除 Provider Key 和 Supabase 配置的前端编译注入 |
| `server/middleware/auth.ts` | Bearer Token 强校验、服务端角色读取、失败关闭 |
| `server.ts` | 删除全局 `x-user-id/system` 回退；为生图和蒙版接口增加强认证 |
| `src/services/geminiService.ts` | 删除真实 Provider Key 读取和 `x-user-id` 请求头；只发送登录 Token |
| `src/pages/AdminUsers.tsx` | 删除管理员接口中的 `x-user-id` |
| `src/components/ImageUploaderNew.tsx` | 蒙版上传改为携带真实会话 Token |
| `src/services/canvasService.ts` | 删除 LocalStorage 和演示 Token 回退 |
| `src/components/creative-canvas/AssetVersionModal.tsx` | 资产版本接口改为使用 Supabase 会话 Token |
| `src/pages/Profile.tsx` | 前端缺省角色由 `admin` 改为 `user` |
| `src/pages/ManwahStudio.tsx` | 前端缺省角色由 `admin` 改为 `user` |
| `src/lib/supabase.ts` | 本地 Mock 缺省角色改为 `user`，演示 Token 不再伪装生产凭证 |
| `tests/auth_security.test.ts` | 增加 6 项 P0 认证安全回归测试 |

## 4. AI Studio 推荐操作方式

### 方式 A：使用已修复源码包

1. 在 AI Studio 当前项目中先导出一个未修改的 ZIP 备份，名称建议为 `manwah-before-g1-p0-20260804.zip`。
2. 打开修复包，按第 3 节的路径替换同名文件，并新增 `tests/auth_security.test.ts`。
3. 不要把修复包中的 `node_modules/`、`dist/` 或本地缓存上传到 AI Studio。
4. 让 AI Studio Agent 运行类型检查、测试和构建；不要要求它重构其他 G1 模块。

### 方式 B：在 AI Studio Agent 中执行

将以下提示词原样粘贴给 AI Studio Agent：

```text
执行 G1-P0-R1，只处理两个 P0，不修改模型路由、模型 ID、Provider Adapter、计费、Agent 状态机或 Mock。

P0-1：删除 vite.config.ts 中所有 Provider API Key 的 define 注入，包括 API_KEY、GEMINI_API_KEY、BAILIAN_API_KEY、ROUTERHUB_API_KEY。Provider Key 只能由 Node 服务端通过 process.env 或 AI Studio Secrets 读取。前端 SDK 如必须传 apiKey，只允许使用无权限的固定占位字符串 server-proxy，真实请求必须经过服务端网关。

P0-2：服务端不再信任 x-user-id，不允许 system/admin、缺省 admin、预填 req.user 或演示 Token 绕过认证。所有受保护接口必须验证 Authorization: Bearer <Supabase access token>，调用 supabaseAdmin.auth.getUser(token)，再从 profiles 表读取 role、dept_id。无 Token=401，无效 Token=401，无 profiles=403，未知 role=user。管理员权限只能来自数据库 profiles.role。

必须同步处理调用兼容性：生图、蒙版上传、画布、资产版本、管理员接口均从 supabase.auth.getSession() 取得 access_token；删除 x-user-id 和 demo-token-123 回退。runtime-config 保持公开，以便登录页初始化 Supabase；/api/gateway/generate-image 和 /api/pre_process/mask 必须要求认证。

新增安全测试：无 Token、伪造 x-user-id、无效 Token、缺 profile、数据库角色、未知角色最小权限。完成后运行 npm run lint、npm test、npm run build。最后使用三个唯一哨兵值作为 GEMINI_API_KEY、ROUTERHUB_API_KEY、BAILIAN_API_KEY 构建，并确认 dist/assets 与 dist/index.html 中没有任何哨兵值。

输出修改文件列表、测试结果和未修改范围。不要打印任何真实 Key。
```

## 5. AI Studio Secrets 配置

Google AI Studio 当前支持在全栈应用的 `Settings → Secrets` 中保存服务器端密钥，服务端通过环境变量读取，浏览器端不应读取这些值。官方说明：

- <https://ai.google.dev/gemini-api/docs/aistudio-fullstack>
- <https://ai.google.dev/gemini-api/docs/aistudio-build-mode>

在 Secrets 中设置或更新：

```text
GEMINI_API_KEY
ROUTERHUB_API_KEY
BAILIAN_API_KEY
SUPABASE_SERVICE_ROLE_KEY
```

Supabase URL 与 anon key 本身是客户端可公开配置，但本项目建议继续通过 `/api/runtime-config` 返回：

```text
SUPABASE_URL
SUPABASE_ANON_KEY
```

不要再通过 Vite `define` 注入任何配置；不要创建 `VITE_GEMINI_API_KEY`、`VITE_ROUTERHUB_API_KEY`、`VITE_BAILIAN_API_KEY` 或 `VITE_SUPABASE_SERVICE_ROLE_KEY`。

## 6. Supabase 上线前检查

严格认证上线后，每个可登录用户都必须有一条 `profiles` 记录，否则接口会返回 `403 PROFILE_REQUIRED`。

确认 `profiles.role` 只使用以下值：

```text
user
dept_admin
admin
```

检查项：

1. 用户 `profiles.id` 与 Supabase Auth 的 `user.id` 一致。
2. 普通用户为 `user`，不要留空。
3. 部门管理员必须有正确的 `dept_id`。
4. 只有经过审批的账号可以设为 `admin`。
5. 不要在浏览器 LocalStorage 中保存角色作为服务端授权依据；前端角色只用于界面显示。

## 7. 旧密钥轮换与部署顺序

由于旧构建可能已经包含真实 Key，必须假设旧 Key 已经暴露。

1. 分别在 Google、RouterHub、百炼后台创建新 Key。
2. 在 AI Studio `Settings → Secrets` 中写入新 Key。
3. 部署修复后的新版本；确认构建成功并产生新 Cloud Run revision。
4. 完成第 8 节验证，确认新版本调用正常。
5. 禁用或删除旧 Key，并检查旧 Key 的调用量、账单和异常来源。
6. 清理 CDN/浏览器缓存，确保旧 JS Bundle 不再被访问。
7. 保留回滚源码，但不要回滚到包含旧 Key 注入的前端构建。

Google 官方建议的泄露 Key 处理顺序也是“生成新 Key → 使用新 Key 部署 → 验证 → 禁用旧 Key → 审计使用情况”：<https://ai.google.dev/gemini-api/docs/api-key>。

## 8. 验收清单

### 自动验证

在 AI Studio 或导出后的项目根目录执行：

```bash
npm run lint
npm test
npm run build
```

本修复包的已验证结果：

```text
TypeScript：通过
Vitest：8 个测试文件通过，36 项测试通过
生产构建：通过
```

密钥泄露专项验证：使用唯一哨兵值构建后，扫描 `dist/assets` 与 `dist/index.html`，三个 Provider 哨兵值必须全部为 0 个匹配。

### 手工 API 验证

| 场景 | 预期结果 |
|---|---|
| 无 Token 请求 `/api/gateway/generate-image` | 401 |
| 只发送伪造 `x-user-id` | 401，不能生成、不能扣费 |
| 发送无效 Bearer Token | 401 `INVALID_TOKEN` |
| 有效 Token，但没有 `profiles` | 403 `PROFILE_REQUIRED` |
| 普通用户访问 `/api/admin/*` | 403 |
| 部门管理员访问本部门允许接口 | 成功；跨部门仍应 403 |
| 管理员使用数据库中真实 `admin` 角色 | 成功 |
| 登录用户调用生图与蒙版接口 | 成功进入业务逻辑 |
| 未登录访问 `/api/runtime-config` | 200，登录初始化不被阻断 |

### 浏览器验证

1. 打开 DevTools → Network，确认受保护请求只包含 `Authorization: Bearer ...`，不再发送 `x-user-id`。
2. 在 Sources 中全局搜索真实 Key 或旧 Key 的特征片段，必须没有结果。
3. 查看生成后的 JS，允许出现字符串 `server-proxy`，但它没有 Provider 权限，不是真实 Key。
4. 普通用户即使篡改 LocalStorage 中的 `role=admin`，服务端管理员接口仍必须返回 403。

## 9. 回滚规则

如新版本出现认证兼容问题：

1. 不得恢复 `x-user-id`、`system/admin`、缺省 `admin` 或演示 Token 回退。
2. 优先补齐缺失的 `profiles` 记录，或修复前端遗漏的 Bearer Token。
3. 可回滚业务功能文件，但 `vite.config.ts` 的 Provider Key 注入删除和服务端强认证必须保留。
4. 如必须临时停止功能，应返回明确的 401/403/503，不能以管理员身份静默放行。

## 10. 本轮未处理范围

以下内容留到后续 G1/G2/G3/G4，不应在本次 AI Studio 操作中顺带修改：

- Gemini 3/3.1 被强制改为 2.5 的模型映射。
- 统一 Provider Adapter 与模型能力注册表。
- `gpt-image-2-all`、ImageRole 与严格 Mask 校验。
- Responses API、思考等级与结构化计划。
- Agent 真实渲染、幂等账本、原子计费、限流与熔断。

完成本文件全部验收后，才进入 G1 的“统一 AI Client 与模型能力路由”阶段。
