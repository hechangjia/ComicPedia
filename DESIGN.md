# Design System — ComicPedia

## Product Context
- **What this is:** AI 驱动的漫画生成工具，用户输入文字内容生成分镜漫画
- **Who it's for:** 对科普/文学/百科感兴趣的中文用户，非专业设计师
- **Space/industry:** AI 创作工具（漫画叙事方向）
- **Project type:** Web app (工具型)

## Aesthetic Direction
- **Direction:** Organic/Natural + 印象派色彩
- **Decoration level:** Intentional — 用色彩晕染和微妙阴影营造氛围，不做无意义装饰
- **Mood:** 温暖的创作空间。像一间明亮的画室，工具摆放整齐，墙上挂着作品。界面退到背景，漫画内容是主角。
- **Anti-patterns:** 禁止紫粉渐变、emoji 做图标、3列 feature 网格、居中万物、统一大圆角

## Typography
- **Body/UI:** DM Sans — 干净中性，CJK 混排友好
- **Chinese:** Noto Sans SC, PingFang SC, Microsoft YaHei (系统字体栈)
- **Data/Tables:** DM Sans (tabular-nums)
- **Code/Mono:** JetBrains Mono
- **Loading:** Google Fonts CDN (`DM Sans`, `Noto Sans SC`, `JetBrains Mono`)
- **Scale:**

| Level | Size | Weight | Use |
|-------|------|--------|-----|
| h1 | 1.65rem (26px) | 700 | 页面标题 |
| h2 | 1.25rem (20px) | 600 | 区块标题 |
| body | 0.875rem (14px) | 400 | 正文 |
| small | 0.75rem (12px) | 500 | 标签、时间、元信息 |
| tiny | 0.625rem (10px) | 600 | 徽章、uppercase label |
| mono | 12.5px | 400 | 代码、prompt、API 地址 |

## Color

### Approach: Impressionist
颜色饱和度降低 20-30%，像油画颜料在调色板上混合后的感觉。每种颜色都有对应的 soft（浅底）和 wash（极淡底）变体。

### Light Mode (default)

```css
--bg: #f8f6f1;            /* 象牙暖白 */
--bg-subtle: #f3f0e8;
--surface: #ffffff;
--surface-warm: #fdfcf9;
--surface-raised: #f0ede5;
--border: #e2ddd4;
--border-subtle: #ece8e0;
--text-primary: #2c2825;
--text-secondary: #6b6560;
--text-muted: #a09a93;
```

### Dark Mode

```css
--bg: #161412;
--bg-subtle: #1c1a17;
--surface: #221f1c;
--surface-warm: #1e1b18;
--surface-raised: #2a2724;
--border: #3a3632;
--border-subtle: #302d29;
--text-primary: #ede9e3;
--text-secondary: #9e9890;
--text-muted: #6b665f;
```

### Accent Colors (印象派调色板)

| Name | Light | Dark | Soft (light) | Use |
|------|-------|------|-------------|-----|
| Teal | `#3d8b84` | `#5cb8ae` | `#e8f4f2` | 主强调：按钮、链接、进度、导航高亮 |
| Coral | `#c4756a` | `#d4918a` | `#faf0ee` | 暖色点缀：生成按钮、重要操作 |
| Ochre | `#b8943e` | `#d4b44e` | `#faf6ea` | 小说/暖色内容类型 |
| Lavender | `#8b7eb5` | `#a99ad0` | `#f3f1f8` | 诗词/文学内容类型 |
| Sky | `#5b95b8` | `#7cb5d4` | `#edf4f8` | 百科/科普内容类型 |

### Semantic Colors

| Name | Light | Dark | Use |
|------|-------|------|-----|
| Success | `#5a9e6f` | `#6db882` | 完成、通过 |
| Warning | `#c49a3d` | `#d4b44e` | 低评分、待确认 |
| Error | `#c05a4a` | `#d47060` | 失败、连接错误 |
| Info | `#5b8fb8` | `#7cb5d4` | 提示、待审查 |

### Impressionist 效果
Hero 和卡片背景使用多层 radial-gradient 叠加模拟色彩晕染：
```css
/* Hero wash */
background:
  radial-gradient(ellipse at 20% 80%, var(--teal-soft) 0%, transparent 60%),
  radial-gradient(ellipse at 80% 20%, var(--coral-soft) 0%, transparent 60%),
  radial-gradient(ellipse at 50% 50%, var(--ochre-soft) 0%, transparent 70%),
  var(--surface-warm);

/* Card image wash variants */
.wash-1: radial-gradient(ellipse at 30% 70%, #c8e6e3, #e0f0f8 50%, #f0ece4);
.wash-2: radial-gradient(ellipse at 70% 30%, #d4dff0, #e8e0f0 50%, #f4ece8);
.wash-3: radial-gradient(ellipse at 40% 60%, #f0e8d0, #e8dcc8 50%, #f8f4ec);
```

## Spacing
- **Base unit:** 4px
- **Density:** Comfortable
- **Scale:** xs(4) sm(8) md(16) lg(24) xl(32) 2xl(48) 3xl(64)

## Layout
- **Approach:** Grid-disciplined
- **Max content width:** 1120px
- **Container padding:** 28px
- **Grid:** responsive, 1-3 columns depending on viewport

## Border Radius (hierarchical)

| Token | Value | Use |
|-------|-------|-----|
| sm | 6px | badge, tag, chip |
| md | 10px | 按钮, 输入框, alert |
| lg | 14px | 卡片, 面板 |
| xl | 20px | 模态框, 大容器, mockup |
| full | 9999px | 圆形头像, pill |

## Shadows

```css
--shadow-subtle: 0 1px 3px rgba(44,40,37,0.04);
--shadow-soft: 0 2px 8px rgba(44,40,37,0.06), 0 1px 2px rgba(44,40,37,0.03);
--shadow-float: 0 8px 24px rgba(44,40,37,0.08), 0 2px 6px rgba(44,40,37,0.04);
--shadow-glow: 0 0 20px rgba(61,139,132,0.08);
```

按钮使用 `inset 0 1px 0 rgba(255,255,255,0.12)` 模拟光照高光。

## Motion
- **Approach:** Minimal-functional
- **Easing:** `ease-out` (enter), `ease-in` (exit), `cubic-bezier(0.2, 0, 0, 1)` (card hover)
- **Duration:** 150ms (hover/toggle), 200ms (input focus), 250ms (panel), 300ms (card hover)
- **Card hover:** `translateY(-4px)` + shadow 提升
- **Button hover:** `translateY(-1px)` + shadow 扩展

## Icons
- **Library:** Lucide React
- **Stroke width:** 2
- **Size:** 16px (inline), 18px (创作类型图标), 20px (导航)
- **Color:** 继承 `currentColor`

## Content Type Colors

每种内容类型有专属配色，用在创建入口和 gallery badge 上：

| Type | Color | Soft Background |
|------|-------|----------------|
| 百科 (wikipedia) | Teal `#3d8b84` | `#e8f4f2` |
| 科普 (science) | Lavender `#8b7eb5` | `#f3f1f8` |
| 诗词 (poetry) | Sky `#5b95b8` | `#edf4f8` |
| 小说 (novel) | Ochre `#b8943e` | `#faf6ea` |
| 小红书 (xiaohongshu) | Coral `#c4756a` | `#faf0ee` |

## Component Patterns

### Button Variants
- **Primary (teal):** 主操作 — 开始创作、确认、保存
- **Warm (coral):** 生成类操作 — 生成漫画、重新生成
- **Secondary:** 次要操作 — 取消、返回
- **Ghost:** 链接式操作 — 查看详情、展开
- **Danger:** 用 soft 底色 + error 文字色，不用实色红底

### Card Hover
所有可点击卡片：`translateY(-4px)` + `shadow-float`，cubic-bezier easing。

### Input Focus
`border-color: var(--teal)` + `box-shadow: 0 0 0 3px var(--teal-wash)`

### Alert
Soft 底色 + 语义色文字 + 1px 语义色边框（opacity 15%）。不使用实色背景。

## Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-04-03 | 去除紫粉渐变 | AI slop 典型模式，用户反感 |
| 2026-04-03 | 浅色默认 | 创作工具用户更习惯浅色，暗色模式可切换 |
| 2026-04-03 | 去除 Instrument Serif | 英文衬线体与中文系统字体混排违和 |
| 2026-04-03 | 印象派配色 | 降低饱和度 20-30%，颜色像调色板上混合出来的 |
| 2026-04-03 | Stone 暖灰底色 | `#f8f6f1` 象牙暖白，比冷白更有画室氛围 |
| 2026-04-03 | Teal + Coral 双强调 | Teal 主操作，Coral 生成类操作，避免单色单调 |
| 2026-04-03 | Lucide 图标库 | 替代手写 inline SVG，统一视觉 |
| 2026-04-03 | 内容类型专属配色 | 5 种内容类型各有印象派色系，gallery badge 和创建入口共用 |
