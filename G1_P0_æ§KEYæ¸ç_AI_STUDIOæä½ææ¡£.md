# 敏华 AI 程序 G1｜旧 Provider Key 清理与 AI Studio 操作文档

版本：G1-P0-R2  
日期：2026-08-04  
适用源码：`manwah-G1-P0-R2.zip`

## 1. 本轮结论

Gemini、RouterHub、百炼三类旧环境变量 Key 已从当前源码中移除。项目不再从部署环境读取这三类 Key，也不再保留依赖它们的开放代理和调试入口。

现有模型调用统一从 Supabase `department_configs` 读取当前用户部门或“全站系统”的 Provider Base URL 与凭据。VectorEngine 及其他通过后台配置的在用线路不受本轮清理影响。

如果系统过去只依赖旧环境变量、后台从未配置 Provider，本次升级后模型请求会明确失败并提示管理员配置，不会静默使用旧 Key。

## 2. 已修改内容

| 范围 | 处理结果 |
|---|---|
| `.env.example`、`README.md` | 删除三类旧 Provider 环境变量示例 |
| `server.ts` | 删除 RouterHub、Gemini 环境变量回退；仅解析部门/全站配置 |
| `server/utils/aiClient.ts` | 删除第二套环境变量回退，未配置时安全失败 |
| `server/routes/copyRoutes.ts` | 文案生成改用统一服务端 AI Client，不再直接读取 Gemini Key |
| `api/proxy.ts` | 删除旧开放代理入口 |
| `api/routerhub/generate-image.ts` | 删除旧独立生图入口 |
| `fetch.ts`、`fetch_options.ts` | 删除旧线上调试脚本 |
| `vercel.json` | 删除指向旧开放代理的重写规则 |
| `VERCEL_ENV.md` | 删除已经失效的旧 Key 配置文档 |
| 技术/迁移文档 | 改为后台 Provider 配置与统一网关说明 |
| 自动测试 | 增加旧 Key 与旧入口不可回归测试 |

被删除的旧文件仍可从上一版 `manwah-G1-P0-R1.zip` 恢复，但不建议恢复到生产环境。

## 3. AI Studio 修改步骤

### 方式 A：导入完整修复包

1. 从 AI Studio 导出当前项目 ZIP 作为只读备份。
2. 使用 `manwah-G1-P0-R2.zip` 中的源码覆盖项目。
3. 不上传 `node_modules/`、`dist/`、`.data/` 或本地日志。
4. 在 AI Studio 中重新安装依赖并构建。
5. 部署新的 Cloud Run revision，先不删除旧 revision，完成第 6 节验收后再切换流量。

### 方式 B：交给 AI Studio Agent 修改

将下面内容粘贴给 AI Studio Agent：

```text
执行 G1-P0-R2，只清理 Gemini、RouterHub、百炼三类旧环境变量 Key 与依赖它们的旧入口。

要求：
1. 删除 .env.example、README、部署文档中的三类旧 Provider 环境变量配置。
2. server.ts 与 server/utils/aiClient.ts 不再从 process.env 读取这些旧 Key；只从 Supabase department_configs 读取用户部门或“全站系统”的 Provider 配置。
3. server/routes/copyRoutes.ts 改用统一 createServerGenAI()，禁止直接请求原生 Gemini 地址。
4. 删除 api/proxy.ts、api/routerhub/generate-image.ts、fetch.ts、fetch_options.ts 与失效的旧 Vercel Key 文档。
5. vercel.json 删除指向旧 proxy 的重写。
6. 不删除后台 Provider 配置能力，不改 VectorEngine 在用线路，不重构模型注册表、计费或 Agent 状态机。
7. 未配置后台 Provider 时必须明确失败，不允许恢复环境变量或匿名代理回退。
8. 运行类型检查、全部测试和生产构建；确认应用源码不再引用三类旧变量，并用唯一哨兵值构建验证真实凭据不会进入前端产物。
```

## 4. AI Studio Secrets 清理

部署 R2 源码后，在 AI Studio `Settings → Secrets` 中删除 Gemini、RouterHub、百炼对应的三项旧 Provider Secret。

保留当前项目仍需要的 Supabase 服务端配置，例如项目 URL、Anon Key、Service Role Key 与 Storage Bucket。不要删除数据库认证和存储所需配置。

操作顺序：

1. 先确认“管理后台 → API 路由设置”已经保存当前在用 Provider。
2. 部署 R2 并完成测试环境验收。
3. 删除 AI Studio 中三项旧 Provider Secret。
4. 再部署一次，确认删除 Secret 后构建及运行仍通过。
5. 在对应平台后台禁用旧 Key，并检查近期调用和账单。

## 5. 后台 Provider 配置检查

登录管理员界面，逐项检查：

1. “全站系统”存在有效的 Provider Base URL 与凭据。
2. 有独立线路的部门存在自己的 `department_configs` 记录。
3. 当前在用 VectorEngine 线路的 Base URL、模型权限与余额有效。
4. 混合模式如仍使用备用线路，备用凭据必须存放在数据库配置中，而不是环境变量。
5. 普通用户无法读取完整凭据；浏览器网络响应与前端 Bundle 不出现凭据。

## 6. 验收命令

在 AI Studio 终端或导出项目根目录运行：

```bash
npm run lint
npm test
npm run build
```

随后检查：

- 生图接口在登录状态下可调用后台已配置 Provider。
- 未登录调用受保护接口返回 401。
- 后台未配置 Provider 时返回明确配置错误，不自动切换旧环境变量。
- 文案生成仍通过统一服务端 AI Client 工作。
- 旧 `/api/proxy` 与 `/api/routerhub/generate-image` 不再可用。
- 前端构建产物不包含任何真实 Provider 凭据或测试哨兵值。

说明：`@google/genai` 第三方 SDK 自身的浏览器代码可能包含 Gemini 环境变量名称这一内部字符串，但项目没有读取或注入该变量。验收应检查真实 Key/唯一哨兵值是否进入产物，而不是仅凭第三方依赖中的变量名称判断泄露。

## 7. 回滚

如 R2 上线后发现后台 Provider 配置缺失：

1. 不要恢复旧开放代理或把 Key 重新注入前端。
2. 先在 `department_configs` 补齐“全站系统”或部门 Provider 配置。
3. 如必须回滚代码，可将 Cloud Run 流量临时切回 R1 revision；同时保持旧 Key 禁用，并尽快完成数据库配置后重新上线 R2。

本轮只清理旧 Key 与入口，没有进入 G1 后续模型能力注册表、Provider Adapter、Responses、计费原子性或 Agent 真生成改造。
