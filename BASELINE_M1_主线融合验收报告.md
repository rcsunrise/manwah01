# BASELINE-M1｜C4B-3 + G0-1R + G3 Responses 主线融合验收报告

日期：2026-08-08

## 1. 阶段结论

BASELINE-M1 已完成并通过本地自动化验收。

本轮以压缩包根工程为唯一主线，保留 C4B-3、G0-1R 与 Provider G2-R2，仅将独立 `manwah-G3-R1` 中的 GPT-5.6 Responses 九屏策划能力择优合入。未用旧分支覆盖主线，未开发 G0-2、G0-3 或 C4B-4。

新的代码基线为：

```text
MAIN_BASELINE_M1
= C4B-3
+ G0-1R
+ Provider G2-R2
+ GPT-5.6 Responses G3-R1
```

注意：这里的 G3-R1 是 Provider/Responses 路线命名，不等于 Agent G0-3 受控工具调用。

## 2. 合入内容

- 新增 OpenAI-compatible `/v1/responses` 协议适配。
- 新增显式 Agent 模型能力注册表，禁止按模糊模型名路由。
- 新增 GPT-5.6 Responses 与 Gemini 2.5 Flash 的能力/Provider 兼容性校验。
- 新增九屏详情页严格 JSON Schema 与运行时完整性验证。
- 支持 `previous_response_id` 续接，并始终重发 instructions。
- 区分 completed、incomplete、refusal、content_filter 与异常状态。
- 前端九屏策划区新增策划模型和思考等级选择。
- 自动续接最多两次；连续不完整时停止并给出明确错误。
- AgentRun 记录 transport、model、reasoningEffort、responseId、状态与 usage。

## 3. 主线保护结果

- G0-1R Conversation、SSE、停止、重试、刷新恢复链路保留。
- C4B-2 Copy SKU / Copy Version 路由与不可变性保留。
- C4B-3 Typography Spec 工作区、路由与零 TextNode 约束保留。
- Provider G1/G2 图片输入安全、MIME 保真与旧 Key 清理测试保留。
- 登录、权限、计费、Supabase、VectorEngine、RouterHub 与原九屏闭环未被替换。
- 交付根目录不再包含 `manwah-g1`、`manwah-G3-R1` 重复工程及压缩包。
- `package-lock.json` 已保留，可作为依赖锁定基线。

## 4. 验证结果

| 验证项 | 结果 |
|---|---:|
| BASELINE-M1 融合门禁 | 22/22 |
| C4B-2 真实 HTTP 回归 | 11/11 |
| C4B-3 真实 HTTP 回归 | 18/18 |
| G0-1 静态结构验证 | 31/31 |
| G0-1R HTTP/SSE Mock Adapter | 30/30 |
| G3 Responses 专项测试 | 8/8 |
| 完整 Vitest | 15 files / 82 tests |
| TypeScript (`tsc --noEmit`) | 通过 |
| Production Build | 通过 |

构建仅出现 Vite 大型 chunk 提示，不影响构建通过。

## 5. 验收边界

G0-1R 自动化仍使用显式隔离的文本 Mock Adapter，不能替代以下 AI Studio 正式环境证据：

1. 真实 Supabase 双用户 RLS。
2. RouterHub 或 VectorEngine 的真实文本流式 Provider。
3. 浏览器 AgentPanel 的发送、停止、重试和刷新恢复。
4. GPT-5.6 `/v1/responses` 在部门真实线路上的一次九屏结构化输出冒烟。

## 6. 下一阶段

BASELINE-M1 完成后，先在 AI Studio 执行上述真实环境准入验收。通过后进入：

```text
G0-2｜画布上下文理解与只读诊断
```

G0-2 只读取 Project、Canvas、Scene、Asset、DNA、Copy、Typography 的真实绑定关系，诊断缺失、冲突、溢出与阶段状态；继续禁止修改画布、创建版本、调用图片模型、计费与工具调用。
