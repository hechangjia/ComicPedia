# ComicPedia Experience Overhaul Design

> 方案 C: 体验优先冲刺
> 三个 Sprint，按用户感知优先级排序
> 审批日期: 2026-04-04

---

## 问题总结

| # | 问题 | 根因 | 严重度 |
|---|------|------|--------|
| P3 | 管线不丝滑 | Research 阶段全串行 (3-4 次 LLM + 2 次 HTTP 链式等待) | 高 |
| P4 | Design System 未落地 | globals.css 仍用 shadcn 默认紫色主题，~420 处颜色硬编码 | 高 |
| P5 | 关系图谱体验差 | 纯 SVG 渲染无 Canvas、硬编码色、无曲线/动画/内联编辑/触摸 | 高 |
| P1 | 图片生成 400 错误 | firstPanelAsRef 对不支持 img2img 的端点注入 image 字段 | 中 |
| P2 | ComfyUI 图片丢失 | fire-and-forget 持久化 + 轮询超时短 + 退出前无 flush | 中 |
| P6 | 其他遗漏 | 并发恢复缺失、save-image 路径、错误恢复、节流冲突、clipPath ID | 低-中 |

---

## Sprint 1: Design System Tokens + 管线丝滑度

### 1A: Design System Token 落地

按 `docs/ai/design-system-implementation-plan.md` 已有方案执行。执行顺序：

**Phase 1 - 基础层** (最先做，后续全部依赖):

1. **重写 `src/app/globals.css`**
   - 替换 `:root` 下 shadcn 变量为 DESIGN.md Light Mode 变量
   - 替换 `.dark` 下变量为 DESIGN.md Dark Mode 变量
   - 添加 accent 变量 (`--teal`, `--coral`, `--ochre`, `--lavender`, `--sky` + soft/wash 变体)
   - 添加 semantic 变量 (`--success`, `--warning`, `--error`, `--info`)
   - 添加 shadow 变量 (`--shadow-subtle`, `--shadow-soft`, `--shadow-float`, `--shadow-glow`)
   - `--primary` 从紫色 (hsl 262) 改为 teal (`#3d8b84` light / `#5cb8ae` dark)
   - `--radius: 0.75rem` -> `--radius: 0.875rem` (14px)

2. **更新 `tailwind.config.ts`**
   - 修正 `borderRadius` 映射: sm=6px, md=10px, lg=14px, xl=20px
   - 添加自定义颜色映射: teal, coral, ochre, lavender, sky, success, warning, error, info
   - 添加 surface, text-primary, text-secondary, text-muted 语义 token

**Phase 3 - 语义颜色替换** (Phase 1 完成后 `bg-primary` 自动修正 63 文件 173 处):

3. **红色 -> error** (~35 文件, ~90 处)
   - `bg-red-50` -> `bg-error/5`, `text-red-600` -> `text-error`, `bg-red-600` -> `bg-error`

4. **绿色 -> success** (~30 文件, ~65 处)
   - `bg-green-50` -> `bg-success/5`, `text-green-600` -> `text-success`

5. **蓝色 -> info/sky** (~20 文件, ~55 处)
   - `bg-blue-50` -> `bg-info/5`, `text-blue-600` -> `text-info`
   - CharacterDialog Wikipedia 区块: 整块替换为 `--sky` + `--sky-soft`

6. **黄色 -> warning/ochre** (6 文件, ~9 处)

**Phase 4 - 硬编码 -> 变量引用** (可与 Phase 3 并行):

7. BottomTabBar, Toast, EpisodeProposalModal, CharacterDialog 等 8 文件 ~20 处

**Sprint 1 不做** (推迟到 Sprint 2 或独立处理):
- SVG 组件配色 (RelationEdge/CharacterNode/RelationGraph) -- Sprint 2 重写时处理
- PoetryForm serif 字体 -- 低优先级
- result/[id]/page.tsx 渐变文字 -- 低优先级

### 1B: 管线丝滑度优化

#### 1B.1 Research 阶段并行化

**文件**: `src/lib/client/phases/research.ts`

当前串行流程:
```
Topic Research (LLM) -> Wikipedia Fetch -> Accuracy Research (API) -> Director Outline (LLM)
总耗时 = T1 + T2 + T3 + T4
```

改造后:
```
+-  Topic Research (LLM) + Wikipedia Fetch  -+
|                                             +-->  Director Outline (LLM)
+-  Accuracy Research (API)  ----------------+
总耗时 = max(T1+T2, T3) + T4
```

实现:
- Phase 0 (Topic Research + Wikipedia) 和 Phase 0.5 (Accuracy Research) 用 `Promise.allSettled` 并行
- Phase 0.7 (Director) 依赖前两者结果，保持串行在并行组之后
- 任一分支失败不阻塞另一分支（当前已有 try-catch 降级）
- 预估节省 30-50% 研究阶段耗时

#### 1B.2 进度反馈增强

**文件**: `src/lib/client/phases/research.ts`, `src/components/GeneratingAnimation.tsx`

当前: `task.streamText = "正在研究主题..."` 粗粒度文案

改造:
- 为每个阶段添加结构化进度事件，在 `pipelineTrace` 中记录开始/结束/耗时
- 前端 `GeneratingAnimation.tsx` 读取 `pipelineTrace` 展示实时阶段进度:
  - 当前阶段高亮 + 已完成打勾 + 预估剩余时间
  - 每阶段展示具体信息 (如 "正在研究主题 -> 已找到 5 条关键事实")
- 不引入 SSE 新通道，复用现有 Zustand notifyListeners 机制

#### 1B.3 图片生成并发优化

**文件**: `src/lib/client/phases/imageGen.ts`, `src/lib/concurrency.ts`

**firstPanelAsRef 改为 opt-in**:
- 设置页新增"角色一致性增强"开关，默认关闭
- 开关关闭时，所有面板直接并发生成，消除首格串行等待 (20-50s)
- 开关打开时保留现有逻辑

**端点类型感知并发**:
- ComfyUI 端点: 自动降为 1-2 并发 (本地 GPU 一次只能处理一张)
- API 端点: 保持默认 6 并发
- 在 `runImageGenPhase` 中根据 `imageConfig.endpointType` 动态设置 limit

**429 渐进恢复** (`concurrency.ts`):
- 当前: 降级后 30s 固定低并发，无恢复
- 改造: 30s 后恢复到 `limit * 0.75`，60s 后恢复到 `limit`
- 添加 `recoverySteps` 配置项

---

## Sprint 2: 关系图谱完全重写

### 2A: 渲染架构升级

**方案: SVG/Canvas 混合渲染**

- **边 (edges)** -> Canvas 2D 绘制 (数量多，频繁重绘，Canvas 性能优于 SVG DOM)
- **节点 (nodes)** -> SVG 保留 (数量少，需丰富交互: hover tooltip、右键菜单)
- 一个 `<canvas>` 叠在底层画边，`<svg>` 叠在上层画节点，共享坐标系同步

**布局: d3-force + 约束**:
- 添加 `forceRadial`: 孤立节点推到外圈
- 添加 cluster 分组: 关系密切的角色自然聚拢
- 边长度与关系强度成反比 (strength 高 -> 距离近)

**文件结构**:
```
src/components/characters/
  RelationGraph.tsx          -- 主容器 (canvas + svg 层叠)
  graph/
    CanvasEdgeLayer.tsx      -- Canvas 边绘制层
    SvgNodeLayer.tsx         -- SVG 节点层
    GraphControls.tsx        -- 缩放/布局/筛选控件
    MiniMap.tsx              -- 右下角缩略图
    InlineEdgeEditor.tsx     -- 边的内联编辑气泡
    NodeContextMenu.tsx      -- 节点右键菜单
    useGraphSimulation.ts    -- d3-force 仿真 hook
    useGraphInteraction.ts   -- 统一交互 hook (pointer events)
    types.ts                 -- 图谱专用类型
  CharacterNode.tsx          -- 节点 SVG 组件 (重写)
  RelationEdge.tsx           -- 保留类型/颜色常量导出 (Canvas 绘制取代 SVG 组件)
  RelationDetailPanel.tsx    -- 保留，作为高级编辑入口
  RelationTimelineSlider.tsx -- 重写 (添加过渡动画)
```

### 2B: 视觉设计

遵循 DESIGN.md 印象派色调:

| 元素 | 当前 | 改造后 |
|------|------|--------|
| 节点底色 | `#374151` 硬编码 | `var(--surface)` |
| 节点高亮 | `#6366f1` indigo | `var(--teal)` |
| 节点名字 | `#d1d5db` 亮灰 | `var(--text-secondary)` |
| 边颜色 | 高饱和 Tailwind 色 | DESIGN.md 降饱和印象派色 |
| 边标签背景 | `#1f2937` 硬编码 | `var(--surface)` + backdrop-blur |
| 过滤栏 | 基础按钮列表 | 胶囊 pill + 颜色点 + 计数 |

**边的视觉升级**:
- 直线 -> 贝塞尔曲线 (两节点间多条关系时自动偏移)
- 强度: 线宽 + 透明度双编码
- 方向: mentor/family 等有方向性的关系添加小箭头
- hover: 沿边显示 tooltip (最近事件摘要 + 强度趋势)

**节点视觉升级**:
- 头像圆形裁切 + 描边环 (颜色 = 最强关系类型)
- hover: 放大 1.1x + 关系统计浮窗
- 选中: 发光环 CSS `@keyframes` 动画

**关系类型配色** (降饱和):
```
friend:  "#5b95b8"  (sky)
rival:   "#c05a4a"  (error)
mentor:  "#b8943e"  (ochre)
lover:   "#c4756a"  (coral)
family:  "#5a9e6f"  (success)
ally:    "#3d8b84"  (teal)
enemy:   "#8b4a42"  (dark coral)
student: "#8b7eb5"  (lavender)
servant: "#a09a93"  (text-muted)
partner: "#5cb8ae"  (teal-light)
```

### 2C: 交互升级

**拖拽**:
- mousedown/move/up -> 统一 pointer events (`pointerdown/move/up`)
- 同时支持鼠标和触摸
- 拖拽时固定节点 (fx/fy)，松开后 200ms ease-out 释放

**缩放**:
- minimap 缩略图 (右下角，显示全局视图 + 当前视口框)
- 双指/滚轮/按钮组 (+/-/fit)
- fit-to-content: 一键自适应所有节点到视口

**编辑**:
- 双击边 -> 内联编辑气泡 (类型/强度/标签)
- 拖拽节点 A 到节点 B -> 弹出"创建关系"对话框
- 右键节点 -> 上下文菜单 (编辑角色/添加关系/聚焦邻居/隐藏)

### 2D: 功能增强

**关系类型扩展**:
- 预置 7 -> 10 种: 新增 student, servant, partner
- 允许用户创建自定义类型 (名称 + 颜色)
- 存储在 `config` 表 (type 字段已是 TEXT，无需改 relations 表)

**Evolution 可视化**:
- timeline slider 拖动时边的颜色/粗细/虚实平滑 CSS transition
- 新增关系: "生长"动画 (线从起点延伸到终点)
- 关系消亡: "淡出"动画

**自动布局模式** (三选一切换):
- 力导向 (默认): 当前自由布局
- 按连载分组: 同一 series 高频共现角色聚簇
- 按关系类型分组: family 聚一起，rival 分两侧
- 布局切换带 500ms 过渡动画

---

## Sprint 3: Bug 修复 + 稳定性 + 遗漏扫描

### 3A: 图片 400 错误修复

**文件**: `src/lib/client/phases/imageGen.ts`, `src/lib/imageGen/index.ts`

**根因**: `phases/imageGen.ts:133-140` 的 `firstPanelAsRef` 对所有 images/auto 端点无差别注入 `image` 字段。

**修复**:
- `firstPanelAsRef` 改为显式 opt-in (设置页"角色一致性增强"开关，默认关闭)
- ComfyUI: 通过 IP-Adapter 注入 (已有逻辑)，不走 image 字段
- Chat Completions: 不支持 img2img，跳过注入
- Images API: 仅在开关打开时注入
- `buildImagesBody` 添加空值检查，undefined/null 时不发送 image 字段
- 400 错误增强: 解析上游 `error.message` 展示给用户

### 3B: ComfyUI 图片持久化修复

**文件**: `src/lib/client/phases/imageGen.ts`, `src/app/api/comfyui/route.ts`

**问题 1 - fire-and-forget 保存**:
- `.then()` 改为 `await`
- 保存失败时标记 `panel.persistFailed = true` 并重试一次
- 保存成功后立刻写 IndexedDB

**问题 2 - ComfyUI 轮询超时**:
- `MAX_POLL_TIME_MS` 从 120s 改为 300s (5 分钟)
- 添加 WebSocket 监听 (ComfyUI 原生支持 `ws://`) 作为主通知通道
- WebSocket 不可用时保持轮询，间隔动态调整: 前 30s 每 500ms，之后每 2s

**问题 3 - 退出丢数据**:
- 每面板完成后立即 `await saveImageToFileSystem()` (非 fire-and-forget)
- 新增 `beforeunload` 监听: 有未保存 generating 任务时弹离开确认
- ComfyUI 图片返回后额外写 IndexedDB，确保刷新不丢

### 3C: 其他遗漏修复

| # | 问题 | 文件 | 修复 |
|---|------|------|------|
| 1 | 并发 429 恢复缺失 | `concurrency.ts` | 30s 恢复到 75%，60s 恢复到 100% |
| 2 | save-image 路径 standalone 只读 | `api/save-image/route.ts` | `public/output/` -> `data/output/`，通过 `/api/images/` 访问 |
| 3 | 脚本阶段无法恢复 | `taskLifecycle.ts` | task 记录 `lastCompletedPhase`，恢复时从该阶段继续 |
| 4 | EventBus 节流 vs UI 实时性 | `eventBus.ts` | 分离两通道: save 300ms 节流 / notify 用 rAF |
| 5 | ClipPath ID 冲突 | `CharacterNode.tsx` | `clip-${name}` -> `clip-${character.id}` (Sprint 2 重写时修复) |

---

## 执行顺序与依赖

```
Sprint 1 (体验基础)
  1A.1  globals.css + tailwind.config.ts     <- 最先做，所有后续依赖
  1A.2  语义颜色批量替换 (red/green/blue/yellow)
  1A.3  硬编码 -> 变量引用
  1B.1  research.ts 并行化
  1B.2  GeneratingAnimation 进度增强
  1B.3  imageGen 并发优化 + concurrency 恢复

Sprint 2 (关系图谱)                          <- 依赖 Sprint 1A token
  2A    渲染架构 (canvas+svg)
  2B    视觉设计 (使用 Sprint 1 token)
  2C    交互升级
  2D    功能增强

Sprint 3 (稳定性)                            <- 可与 Sprint 2 部分并行
  3A    图片 400 修复
  3B    ComfyUI 持久化
  3C    遗漏修复
```

## 验证清单

### Sprint 1 验证
- [ ] 全站无紫色 (`--primary` 已改 teal)
- [ ] 深色模式切换后颜色正确
- [ ] 研究阶段耗时减少 30%+ (对比改造前后同一 topic)
- [ ] GeneratingAnimation 显示阶段进度条
- [ ] ComfyUI 并发自动降为 1-2
- [ ] `pnpm test` 通过
- [ ] `pnpm lint` 无新增错误

### Sprint 2 验证
- [ ] 关系图 20+ 节点不卡顿 (Canvas 边渲染)
- [ ] 贝塞尔曲线正确绘制，多关系自动偏移
- [ ] 触摸设备可拖拽/缩放
- [ ] 双击边弹出内联编辑
- [ ] 自定义关系类型可创建/使用
- [ ] timeline slider 拖动时边平滑过渡
- [ ] minimap 正确显示
- [ ] 所有颜色使用 DESIGN.md token

### Sprint 3 验证
- [ ] Images API 无 400 错误 (角色一致性关闭时)
- [ ] ComfyUI 连续生成 10+ 面板图片全部持久化
- [ ] 生成中关闭浏览器后重开，图片仍在
- [ ] 429 降级后 60s 内恢复到正常并发
- [ ] save-image 在 standalone 模式下正常工作

## 影响统计

| Sprint | 新增文件 | 修改文件 | 预估改动行 |
|--------|----------|----------|------------|
| 1A     | 0        | ~90      | ~500 (token 替换为主) |
| 1B     | 0        | 3-5      | ~200 |
| 2      | ~8       | ~5       | ~1500 |
| 3      | 0        | 6-8      | ~300 |
| **总计** | **~8** | **~100** | **~2500** |
