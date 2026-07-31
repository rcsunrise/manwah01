# ManwahStudio 产品说明文档

本文档整理了 `ManwahStudio` 平台（家具设计与材质录入系统）的系统架构、UI 交互逻辑以及前后端核心链路，旨在为后续重构和迭代优化提供清晰的指导。

## 一、产品概述

`ManwahStudio` 是一款面向家具（特别是沙发等）工业设计与视觉渲染的网页端 AI 生成工具。它的主要功能是将产品的多角度或单角度线稿、白模图等（称为“产品通道”），结合参考的环境材质或场景（称为“材质样图”），以及用户输入的自然语言逻辑指令，经过自定义渲染引擎，生成高分辨率且具有逼真光影与材质细节的产品渲染图。

主要特性包含：
1. **产品通道录入 (Window 1)**：支持最多 6 个视角的参考图上传，支持批量框选分发上传。
2. **场景/材质录入 (Window 2)**：支持上传参考的背景、环境和材质特征。
3. **设计逻辑指令 (Window 3)**：输入核心设计和调整 Prompt。
4. **内置 AEP 视觉分析功能**：使用 AI 自动识别图纸的长宽高尺寸及风格。
5. **支持多种出图尺寸、比例和高保真 AI 模型**。

---

## 二、界面与交互体验设计 (UI/UX)

### 2.1 主体布局
界面采用了左右分栏响应式布局（Desktop-first, 兼顾 Mobile）：
- **左侧边栏 (Control Panel)**：放置了 1-3 个输入“窗口”及所有核心参数配置（通道管理、AEP 获取、长宽高、设计指令、渲染引擎配置、比例关联等）。左侧边栏可通过滚动条独立滚动。
- **右侧预览区 (Main Content Area)**：放置骨架对比面板（AEPPanel）和生成的历史记录、以及大尺寸生成图预览层（SV/History 模式、画廊对比等）。

### 2.2 核心组件交互说明

1. **图片上传器 (ImageUploaderNew)**
   - **支持批量上传**：当用户框选多张图时，系统会自动“分流”到不同的产品通道。
   - **空状态占位符**：未上传图片时展示虚线框和引导性 Icon/文字。支持拖拽（Drag & Drop）和粘贴（Paste）。
   - **遮罩/蒙版生成**：上传图片后，提供魔术棒 Icon，点击后触发 `/api/pre_process/mask` 生成通道蒙版图。
   - **锁定 & 修复**：可锁定某张图不参与删除，或在经过 AI 预处理后恢复原始画质。

2. **尺寸与透视管理 (AEP Data / Dimensions)**
   - **W / D / H 毫米级控制**：用户手动调整并使用 “比例关联 (Ratio Lock)” 控制宽深高联动缩放。
   - **AEP 面板获取**：通过 AI 自动分析第一张输入图的风格和尺寸（通过 `gemini-3.1-pro-preview` 模型）。

3. **渲染配置选项面板**
   - **引擎算力 (Compute Power)**：提供 极速(2.5 Flash)、标准(3.1 Flash)、旗舰(3.0 Pro) 等选择。
   - **画质分辨率 (Resolution)**：可选 1K、2K、4K。有些极速模型会自动禁用 2K/4K。
   - **画幅宽高比 (Aspect Ratio)**：预设 1:1, 16:9, 4:3, 自定义输入等。
   - **出图命名规则**：标准、详细、自定义三种规范以便对导出的工程包或存入 DB 方便检索。

4. **实时反馈与遮罩加载 (Loading / Toast)**
   - 包含多级别的 Spinner 及状态条，例如生成前的 AEP 分析、上传状态、和模型渲染排队状态。

---

## 三、前端逻辑结构

**入口文件**：`src/pages/ManwahStudio.tsx` 及其附属组件库（`src/components/*`）。

1. **状态管理 (Hooks)**
   - `useState` 大量管理了组件开闭状态、图片数据、渲染配置以及当前 prompt。
   - 示例：`visibleChannelCount` 控制 Window 1 中最多显示几个子通道，这解决了渲染通道不够的问题。
   - 示例：`aepData` 保存并更新全局尺寸属性。

2. **Prompt 自动拼装 (PromptBuilder)**
   - 为了确保出图视角和材质准确，应用根据用户的维度设置和内置规则（正交透视约束、光照约束）自动组合了大量隐藏 Prompt，最后以 `user prompt` 组合给到服务端网关。

3. **请求流 (API Call Flow)**
   - 前端通过封装的 `routerHubService.ts` 调用 `/api/gateway/generate-image` 进行流转，或通过基础 `fetch` 调用 `/api/pre_process/mask`。

---

## 四、后端逻辑与网关 (Server/API Layer)

应用配有专门代理/转发请求的 Express Server (`server.ts`)。

### 4.1 路由层级
- `POST /api/gateway/generate-image`
  - 核心出图网关。处理来自前端的模型、提示词、参考图片数组。
  - **动态密钥获取**：通过对当前用户的路由规则做判断（`globalConfig`、部门配置，读取 DB 的 `department_configs`表），决策走全局 Google 通道还是自有 RouterHub/VectorEngine 模型网关通道。
  - **降载与兼容解析**：网关完成请求到标准的 Gemini/OpenAI 接口转换；解决图片在后端转为 base64 的兼容性逻辑。

- `POST /api/pre_process/mask` 
  - 图片掩码、去除背景的内部上传接口（使用了 Multer 接收 FormData），后端目前提供了逻辑占位（如果内部处理依赖真实 DB/Supabase 的 bucket，也从这里切入）。

- `GET /api/ai/test-connection`, `POST /api/admin/*`
  - 后台管理员节点测试（AdminNotepad）以及配置管理的 CRUD 接口。

### 4.2 数据层结构 (Supabase)
系统主要围绕这三个表交互获取鉴权和归属信息：
- `profiles`: 用户主属性，计费余额（Credits/Points）。
- `department_configs`: 企业或部门对于 API 网关的具体配额配置和私有 `baseUrl` / `apiKey` 下发，支持混合调度（例如主力引擎宕机后切换备用引擎）。
- `generation_history`: **(扩展概念)** 用于持久化已出图记录，便于界面 Gallery 或历史面板检索。

### 4.3 计费与算力点数控制
服务端内置了精确的汇率表 (`modelPrices`) 和 分辨率乘数 (`resolutionMultipliers`)。
执行每次生成请求前，都会计算理论消耗（例：3.0 Pro 生成一张 4K 消耗 `5000` 点积分），如果计费校验失败则阻断请求。

---

## 五、重构与优化建议 💡

1. **组件解耦 (State Management)**
   - **痛点**：当前 `ManwahStudio.tsx` 文件过于庞大（2000+行），`useState` 过多。
   - **优化**：推荐引入 `Zustand` 或 `React Context` 将“图片渲染数据字典”、“AEP与尺寸数据字典”剥离出去，以实现渲染和数据解耦。

2. **视图切片 (Component Splitting)**
   - 将“侧边栏控制面板 (Control Panel)”中的所有模块单独剥离成 `ControlPanel.tsx`，将内部渲染引擎配置、尺寸面板分离成独立可重用组件。
   - `ManwahStudio.tsx` 仅做为主控制台和右侧 History 画廊的挂载点。

3. **后端类型验证 (Server Types)**
   - `server.ts` 中的许多配置转换依然使用 `any`，可以引入 `zod` 在请求到达路由处理函数前统一对其做输入验证，避免 `API_KEY` 或 `model` 空指针引发系统崩溃。

4. **UI 对齐与响应式**
   - 当前在特定尺寸下由于 `col-span-2` 网格定义，组件在极端小屏幕或宽屏下的文本或图片会发生略微偏移（如之前修复的 `ImageUploaderNew` 的占位符图例）。需继续使用 `md:`, `lg:` 梳理所有的 Flex 和 Grid 断点。
