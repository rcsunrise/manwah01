# 敏华 AI 平台：数据精度与计费校准技术文档 (V1.1)

## 1. 核心计费标准定义 (Standard Definition)
为了统一各版部署的显示与后台逻辑，必须严格执行以下换算关系：

*   **基本单位**: `$1 USD = 1.0 W = 10,000 内部点数 (Points)`
*   **新用户初始额度**: `100,000 Points` (即 $10 / 10W 额度)
*   **生图计费基准**: 
    *   1K 分辨率 = 400 点 ($0.04)
    *   2K 分辨率 = 1,400 点 ($0.14)
    *   4K 分辨率 = 5,000 点 ($0.50)
*   **文本计费**: 按照模型官方价格映射到 10,000 比例。例如 $0.14/1M Tokens 对应 `1400` 点/1M。

## 2. 数据库校准 SQL 与 脚本逻辑
### 2.1 预防“翻倍更新”触发器 (Trigger Awareness)
注意：`usage_logs` 表通常挂载了触发器会自动更新 `profiles` 表。同步历史数据时，请务必执行“清空 -> 注入 -> 2次修正”逻辑。

### 2.2 数据清理与重新校准脚本提示
1. 清空 `usage_logs`。
2. 执行 Profile 更新 SQL: `UPDATE profiles SET quota_limit = 250000, quota_used = 150000 WHERE employee_id = '309079';`
3. 检查是否有触发器导致数值变为 300000，若是，请手动 SET 回 150000。

## 3. 后端代码关键配置 (/server.ts)
```typescript
const modelPrices = {
  'gemini-3.1-pro-preview': { input: 12500, output: 50000 },
  'gemini-3.1-flash-preview': { input: 1400, output: 1400 },
  'gemini-3-pro-image-preview': { input: 0, output: 0, per_image: 400 }, 
};

const resolutionMultipliers = {
  '1K': 1.0, 
  '2K': 3.5, 
  '4K': 12.5
};
```

## 4. 前端展示规范
- 消耗单位展示：`{ (points / 10000).toFixed(1) } W`
- 消费金额展示：`{ (points / 10000).toFixed(2) } $`
- 新用户注册初始值：`100000`
