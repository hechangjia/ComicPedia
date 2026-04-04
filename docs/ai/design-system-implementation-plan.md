# Design System Implementation Plan

> 目标：将 DESIGN.md 定义的设计系统完整落地到代码中。
> 预估工作量：human ~4h / CC ~20min
> 审计日期：2026-04-04

---

## Phase 1: 基础层（最高优先级）

### 1.1 重写 globals.css CSS 变量

**文件:** `src/app/globals.css`

当前状态：使用 shadcn/ui 默认变量，`--primary` = 紫色 (hsl 262)。DESIGN.md 定义的变量（`--bg`, `--surface`, `--teal`, `--coral` 等）完全不存在。

**操作:**
- 替换 `:root` 下的 shadcn 变量为 DESIGN.md Light Mode 变量
- 替换 `.dark` 下的变量为 DESIGN.md Dark Mode 变量
- 添加 accent 变量（`--teal`, `--coral`, `--ochre`, `--lavender`, `--sky` + soft/wash 变体）
- 添加 semantic 变量（`--success`, `--warning`, `--error`, `--info`）
- 添加 shadow 变量（`--shadow-subtle`, `--shadow-soft`, `--shadow-float`, `--shadow-glow`）
- **关键：** `--primary` 必须从紫色改为 teal（`#3d8b84` light / `#5cb8ae` dark）
- `--primary-foreground` 改为 `#ffffff`

**参考值:** 全部来自 DESIGN.md Color 章节。

### 1.2 更新 tailwind.config.ts

**文件:** `tailwind.config.ts`

**操作:**
- 修正 `borderRadius` 映射：
  - `sm`: `6px`（当前 8px）
  - `md`: `10px`（当前正确）
  - `lg`: `14px`（当前 12px）
  - `xl`: `20px`（当前缺失）
- 添加自定义颜色映射到 CSS 变量：
  ```
  teal: "var(--teal)"
  coral: "var(--coral)"
  ochre: "var(--ochre)"
  lavender: "var(--lavender)"
  sky: "var(--sky)"
  success: "var(--success)"
  warning: "var(--warning)"
  error: "var(--error)"
  info: "var(--info)"
  ```
- 添加 `surface`, `text-primary`, `text-secondary`, `text-muted` 等语义 token

### 1.3 修正 globals.css 中 --radius 变量

**操作:** `--radius: 0.75rem` → `--radius: 0.875rem`（14px，对应 lg）

---

## Phase 2: SVG 组件配色修正

### 2.1 RelationEdge.tsx TYPE_COLORS

**文件:** `src/components/characters/RelationEdge.tsx` (lines 6-14)

当前值 → 目标值（降饱和到印象派风格）：

```
friend: "#3b82f6" → "#5b95b8"  (sky)
rival:  "#ef4444" → "#c05a4a"  (error)
mentor: "#eab308" → "#b8943e"  (ochre)
lover:  "#ec4899" → "#c4756a"  (coral)
family: "#22c55e" → "#5a9e6f"  (success)
ally:   "#14b8a6" → "#3d8b84"  (teal)
enemy:  "#991b1b" → "#8b4a42"  (darker coral variant)
```

Line 60 fallback: `"#6b7280"` → `"#a09a93"` (text-muted)
Line 103 label bg: `"#1f2937"` → `"#2c2825"` (text-primary dark)

### 2.2 CharacterNode.tsx 高亮色

**文件:** `src/components/characters/CharacterNode.tsx`

- Line 35: `stroke="#6366f1"` → `stroke="#3d8b84"` (teal)
- Line 43: `fill={highlighted ? "#4f46e5" : "#374151"}` → `fill={highlighted ? "#3d8b84" : "#6b6560"}`
- Line 44: `stroke={highlighted ? "#818cf8" : "#6b7280"}` → `stroke={highlighted ? "#5cb8ae" : "#a09a93"}`
- Line 79: `fill="#d1d5db"` → `fill="#a09a93"` (text-muted)

### 2.3 RelationGraph.tsx

**文件:** `src/components/characters/RelationGraph.tsx`

- Line 311: `"#9ca3af"` → `"#a09a93"` (text-muted)

---

## Phase 3: 语义颜色替换（按影响面排序）

### 3.1 高杠杆文件（改一处影响多处）

| 文件 | 操作 | 影响 |
|------|------|------|
| `ErrorAlert.tsx:20-24` | 替换 variant 颜色映射为 DESIGN.md semantic 值 | 全站 error/warning/info/success alert 统一 |
| `DownloadMenu.tsx:102-105` | 替换 status 颜色映射 | 下载状态统一 |
| `result/CompositeScore.tsx:71-86` | 替换 score tier 颜色 | 评分显示统一 |
| `result/score/ScoreBar.tsx:5` | 替换 bar 颜色条件 | 评分条统一 |
| `result/PipelineTimeline.tsx:40-52` | 替换 step 状态颜色 | 管线时间轴统一 |
| `result/PanelGrid.tsx:50-78,179-182` | 替换 panel badge 颜色 | 面板状态统一 |
| `result/ScriptValidationPanel.tsx:28-30` | 替换 severity 颜色映射 | 校验面板统一 |

### 3.2 `bg-primary` 自动修正

**Phase 1 完成后 `--primary` 变为 teal，以下 63 个文件的 173 处 `bg-primary`/`text-primary` 用法会自动变正确，无需逐个改。**

完整文件列表见审计报告。验证方法：完成 Phase 1 后全站浏览，确认紫色完全消失。

### 3.3 红色类 → error semantic（约 35 个文件，~90 处）

统一模式：
- `bg-red-50` → `bg-error/5` 或 `bg-[var(--error-soft)]`
- `text-red-600` / `text-red-700` → `text-error`
- `bg-red-600 text-white` → `bg-error text-white`（危险按钮）
- `border-red-200` → `border-error/20`

**高频文件（10+ 处）:**
- `CharacterDialog.tsx` (lines 177, 421, 486)
- `result/[id]/page.tsx` (lines 175, 176, 444, 565)
- `settings/page.tsx` (lines 490, 752-759)
- `result/VisualDiagnosisAuditCard.tsx` (lines 36, 80, 134, 147)
- `result/QuizPanel.tsx` (lines 45, 63, 138)
- `EditablePanel.tsx` (lines 161, 169, 172)
- `result/PanelGrid.tsx` (lines 53, 78, 182)
- `trash/page.tsx` (lines 126, 237)

### 3.4 绿色类 → success semantic（约 30 个文件，~65 处）

统一模式：
- `bg-green-50` → `bg-success/5`
- `text-green-600` / `text-green-700` → `text-success`
- `bg-green-500` → `bg-success`

**高频文件:**
- `CharacterDialog.tsx` (lines 156, 503)
- `settings/page.tsx` (lines 91, 489, 504, 515, 526)
- `GeneratingAnimation.tsx` (lines 301, 312, 322)
- `result/CompositeScore.tsx` (lines 71, 78, 84)
- `result/QuizPanel.tsx` (lines 44, 62, 160)
- `result/PanelGrid.tsx` (lines 50, 64, 77, 179)

### 3.5 蓝色类 → info/sky semantic（约 20 个文件，~55 处）

统一模式：
- `bg-blue-50` → `bg-info/5`
- `text-blue-600` / `text-blue-700` → `text-info`
- `border-blue-200` → `border-info/20`

**特殊处理:**
- `CharacterDialog.tsx` Wikipedia 区块 (lines 181-213)：大面积蓝色 UI，需要整块替换为 `--sky` + `--sky-soft`
- `ScriptReadyBar.tsx` (lines 51-96)：整个提示条是蓝色，改为 `--info` 系列
- `FormLayout.tsx` (lines 152-159)：hint box 蓝色

### 3.6 黄色类 → warning/ochre semantic（6 个文件，~9 处）

最小改动量。`ThemeToggle.tsx:36` 的太阳图标黄色可保留（装饰性）。

---

## Phase 4: 硬编码正确值 → CSS 变量引用

这些组件使用了 DESIGN.md 的正确 hex 值，但绕过了 CSS 变量系统。改为变量引用后，主题切换和未来调整会自动生效。

| 文件 | 当前写法 | 目标写法 |
|------|----------|----------|
| `BottomTabBar.tsx:19` | `border-[#e2ddd4]` | `border-border` |
| `BottomTabBar.tsx:29-30` | `text-[#3d8b84]` / `text-[#a09a93]` | `text-teal` / `text-muted` |
| `Toast.tsx:36-39` | `bg-[#f0fdf4]` / `text-[#5a9e6f]` etc | `bg-success/5` / `text-success` etc |
| `EpisodeProposalModal.tsx` | `bg-surface`, `text-accent-teal` etc | 依赖 Phase 1 定义变量后自动生效 |
| `CharacterDialog.tsx:70` | `border-[#3d8b84]/30` | `border-teal/30` |
| `CharacterDialog.tsx:409` | `bg-[#3d8b84]` | `bg-teal` |
| `page.tsx:77` | `rounded-[20px]` | `rounded-xl`（Phase 1 修正后 xl=20px） |
| `page.tsx:92,96,109,206` | `rounded-[10px]` | `rounded-md` |

---

## Phase 5: 低优先级修正

### 5.1 PoetryForm.tsx font-serif

**文件:** `src/components/PoetryForm.tsx` (lines 147, 251)

DESIGN.md 没有定义衬线字体。两种处理方式：
- A) 在 DESIGN.md 补充一个中文衬线字体定义（如 Noto Serif SC），用于诗词展示
- B) 移除 `font-serif`，统一使用 DM Sans + Noto Sans SC

建议选 A（诗词场景衬线合理），需要在 layout.tsx 加载字体 + globals.css 添加变量。

### 5.2 result/[id]/page.tsx 渐变文字

**文件:** `src/app/result/[id]/page.tsx` (line 223)

`bg-gradient-to-r from-[#3d8b84] to-[#5cb8ae]` 用于标题。DESIGN.md anti-patterns 禁止渐变。改为纯色 `text-teal`。

### 5.3 settings/page.tsx 语义颜色误用

**文件:** `src/app/settings/page.tsx` (line 693)

`bg-[#8b7eb5]`（lavender）用于删除按钮。Lavender 是诗词内容类型色，不应用于删除操作。改为 `bg-error` 或 `bg-coral`。

---

## 执行顺序

```
Phase 1 (基础层)     ← 必须最先做，所有后续都依赖它
  1.1 globals.css
  1.2 tailwind.config.ts
  1.3 --radius

Phase 2 (SVG 组件)   ← Phase 1 不会自动修正 SVG 硬编码
  2.1 RelationEdge TYPE_COLORS
  2.2 CharacterNode 高亮色
  2.3 RelationGraph 灰色

Phase 3 (语义颜色)   ← Phase 1 完成后 bg-primary 自动修正，只需处理 red/green/blue/yellow
  3.1 高杠杆 variant 映射文件
  3.3 红色 → error (~35 files)
  3.4 绿色 → success (~30 files)
  3.5 蓝色 → info/sky (~20 files)
  3.6 黄色 → warning (~6 files)

Phase 4 (变量引用)   ← 可与 Phase 3 并行
  硬编码正确值 → CSS 变量

Phase 5 (低优先级)   ← 可单独做
  serif 字体、渐变文字、语义误用
```

## 验证清单

- [ ] 全站无紫色出现（`--primary` 已改为 teal）
- [ ] 深色模式切换后颜色正确
- [ ] `EpisodeProposalModal` 样式正确渲染（依赖 `bg-surface` 等 token）
- [ ] 关系图节点高亮为 teal 而非 indigo
- [ ] 关系边颜色为降饱和印象派色调
- [ ] 所有 ErrorAlert/Toast 使用 semantic 颜色
- [ ] `rounded-xl` 渲染为 20px（模态框）
- [ ] `pnpm test` 通过
- [ ] `pnpm lint` 无新增错误

## 影响统计

| 类别 | 文件数 | 改动处数 |
|------|--------|----------|
| 基础层（globals.css + tailwind.config） | 2 | ~100 行重写 |
| SVG 组件配色 | 3 | ~12 处 |
| bg-primary 自动修正 | 63 | 173 处（无需手动改） |
| 红色 → error | ~35 | ~90 处 |
| 绿色 → success | ~30 | ~65 处 |
| 蓝色 → info | ~20 | ~55 处 |
| 黄色 → warning | 6 | ~9 处 |
| 硬编码 → 变量 | 8 | ~20 处 |
| **总计** | **~90 个文件** | **~420+ 处** |
