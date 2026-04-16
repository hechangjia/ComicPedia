# ComicPedia Experience Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Overhaul ComicPedia's user experience across design system tokens, pipeline smoothness, relation graph, and bug fixes in three prioritized sprints.

**Architecture:** Sprint 1 lays the visual foundation (CSS variables, Tailwind config) and parallelizes the research pipeline. Sprint 2 rewrites the relation graph with Canvas/SVG hybrid rendering, bezier edges, and inline editing. Sprint 3 fixes image generation errors and persistence bugs.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Tailwind CSS 3, d3-force, Canvas 2D API, Zustand, better-sqlite3, IndexedDB (idb)

**Design Spec:** `docs/superpowers/specs/2026-04-04-experience-overhaul-design.md`

**DESIGN.md reference:** `DESIGN.md` (root) — all color values, radii, shadows come from here.

---

## File Map

### Sprint 1A — Design System Tokens

| Action | File | Purpose |
|--------|------|---------|
| Modify | `src/app/globals.css` | Replace shadcn HSL vars with DESIGN.md hex-based vars |
| Modify | `tailwind.config.ts` | Add accent/semantic colors, fix border-radius |
| Modify | ~35 files | `red-*` → `error` semantic |
| Modify | ~30 files | `green-*` → `success` semantic |
| Modify | ~20 files | `blue-*` → `info`/`sky` semantic |
| Modify | ~6 files | `yellow-*` → `warning` semantic |
| Modify | 8 files | Hardcoded hex → CSS variable references |

### Sprint 1B — Pipeline Smoothness

| Action | File | Purpose |
|--------|------|---------|
| Modify | `src/lib/client/phases/research.ts` | Parallelize Phase 0 + 0.5 |
| Modify | `src/lib/client/phases/shared.ts` | Add `traceDetail` helper |
| Modify | `src/components/GeneratingAnimation.tsx` | Pipeline trace progress UI |
| Modify | `src/lib/client/phases/imageGen.ts` | Endpoint-aware concurrency, opt-in firstPanelAsRef |
| Modify | `src/lib/concurrency.ts` | 429 progressive recovery |
| Create | `src/__tests__/concurrencyRecovery.test.ts` | Test recovery behavior |

### Sprint 2 — Relation Graph

| Action | File | Purpose |
|--------|------|---------|
| Create | `src/components/characters/graph/types.ts` | Graph-specific types |
| Create | `src/components/characters/graph/useGraphSimulation.ts` | d3-force hook |
| Create | `src/components/characters/graph/useGraphInteraction.ts` | Unified pointer events |
| Create | `src/components/characters/graph/CanvasEdgeLayer.tsx` | Canvas edge rendering |
| Create | `src/components/characters/graph/SvgNodeLayer.tsx` | SVG node rendering |
| Create | `src/components/characters/graph/GraphControls.tsx` | Zoom/layout/filter controls |
| Create | `src/components/characters/graph/MiniMap.tsx` | Minimap overview |
| Create | `src/components/characters/graph/InlineEdgeEditor.tsx` | Edge inline edit popover |
| Create | `src/components/characters/graph/NodeContextMenu.tsx` | Node right-click menu |
| Modify | `src/components/characters/RelationGraph.tsx` | Rewrite as canvas+svg container |
| Modify | `src/components/characters/CharacterNode.tsx` | Rewrite with DESIGN.md tokens |
| Modify | `src/components/characters/RelationEdge.tsx` | Keep TYPE_COLORS/LABELS export, update colors |
| Modify | `src/components/characters/RelationTimelineSlider.tsx` | Add transition animations |
| Modify | `src/lib/types.ts` | Extend RelationType union |

### Sprint 3 — Bug Fixes

| Action | File | Purpose |
|--------|------|---------|
| Modify | `src/lib/client/phases/imageGen.ts` | Opt-in firstPanelAsRef, await persistence |
| Modify | `src/lib/imageGen/index.ts` | Null-guard image field in buildImagesBody |
| Modify | `src/app/api/comfyui/route.ts` | Increase timeout, add WebSocket, dynamic polling |
| Modify | `src/lib/concurrency.ts` | Progressive 429 recovery (shared with 1B.3) |
| Modify | `src/app/api/save-image/route.ts` | `public/output/` → `data/output/` |
| Modify | `src/lib/client/eventBus.ts` | Separate save throttle from notify throttle |
| Modify | `src/lib/types.ts` | Add `lastCompletedPhase`, `persistFailed` fields |
| Create | `src/__tests__/imageGenPhase.test.ts` | Test opt-in, endpoint-aware concurrency |

---

## Sprint 1A: Design System Token Landing

### Task 1: Rewrite globals.css with DESIGN.md variables

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: Replace `:root` variables**

Replace the entire `:root` block in `src/app/globals.css` with DESIGN.md values. The key change is converting from HSL format to hex-based format and adding all missing token categories (accent, semantic, shadow).

```css
:root {
  --font-cn: var(--font-noto-sans-sc), 'PingFang SC', 'Microsoft YaHei', sans-serif;
  --font-body: var(--font-dm-sans), var(--font-cn);
  --font-mono: var(--font-jetbrains-mono), 'Fira Code', monospace;

  /* --- Base surfaces --- */
  --bg: #f8f6f1;
  --bg-subtle: #f3f0e8;
  --surface: #ffffff;
  --surface-warm: #fdfcf9;
  --surface-raised: #f0ede5;

  /* --- shadcn compat (mapped to DESIGN.md) --- */
  --background: var(--bg);
  --foreground: #2c2825;
  --card: var(--surface);
  --card-foreground: #2c2825;
  --primary: #3d8b84;
  --primary-foreground: #ffffff;
  --secondary: var(--surface-raised);
  --secondary-foreground: #2c2825;
  --muted: var(--surface-raised);
  --muted-foreground: #a09a93;
  --accent: var(--surface-raised);
  --accent-foreground: #2c2825;
  --border: #e2ddd4;
  --border-subtle: #ece8e0;
  --ring: #3d8b84;
  --radius: 0.875rem;

  /* --- Text --- */
  --text-primary: #2c2825;
  --text-secondary: #6b6560;
  --text-muted: #a09a93;

  /* --- Accent palette (Impressionist) --- */
  --teal: #3d8b84;
  --teal-soft: #e8f4f2;
  --teal-wash: rgba(61,139,132,0.08);
  --coral: #c4756a;
  --coral-soft: #faf0ee;
  --ochre: #b8943e;
  --ochre-soft: #faf6ea;
  --lavender: #8b7eb5;
  --lavender-soft: #f3f1f8;
  --sky: #5b95b8;
  --sky-soft: #edf4f8;

  /* --- Semantic --- */
  --success: #5a9e6f;
  --success-foreground: #ffffff;
  --warning: #c49a3d;
  --warning-foreground: #ffffff;
  --error: #c05a4a;
  --error-foreground: #ffffff;
  --info: #5b8fb8;
  --info-foreground: #ffffff;

  /* --- Shadows --- */
  --shadow-subtle: 0 1px 3px rgba(44,40,37,0.04);
  --shadow-soft: 0 2px 8px rgba(44,40,37,0.06), 0 1px 2px rgba(44,40,37,0.03);
  --shadow-float: 0 8px 24px rgba(44,40,37,0.08), 0 2px 6px rgba(44,40,37,0.04);
  --shadow-glow: 0 0 20px rgba(61,139,132,0.08);
}

.dark {
  --bg: #161412;
  --bg-subtle: #1c1a17;
  --surface: #221f1c;
  --surface-warm: #1e1b18;
  --surface-raised: #2a2724;

  --background: var(--bg);
  --foreground: #ede9e3;
  --card: var(--surface);
  --card-foreground: #ede9e3;
  --primary: #5cb8ae;
  --primary-foreground: #ffffff;
  --secondary: var(--surface-raised);
  --secondary-foreground: #ede9e3;
  --muted: var(--surface-raised);
  --muted-foreground: #6b665f;
  --accent: var(--surface-raised);
  --accent-foreground: #ede9e3;
  --border: #3a3632;
  --border-subtle: #302d29;
  --ring: #5cb8ae;

  --text-primary: #ede9e3;
  --text-secondary: #9e9890;
  --text-muted: #6b665f;

  --teal: #5cb8ae;
  --teal-soft: rgba(92,184,174,0.1);
  --teal-wash: rgba(92,184,174,0.05);
  --coral: #d4918a;
  --coral-soft: rgba(212,145,138,0.1);
  --ochre: #d4b44e;
  --ochre-soft: rgba(212,180,78,0.1);
  --lavender: #a99ad0;
  --lavender-soft: rgba(169,154,208,0.1);
  --sky: #7cb5d4;
  --sky-soft: rgba(124,181,212,0.1);

  --success: #6db882;
  --success-foreground: #ffffff;
  --warning: #d4b44e;
  --warning-foreground: #ffffff;
  --error: #d47060;
  --error-foreground: #ffffff;
  --info: #7cb5d4;
  --info-foreground: #ffffff;

  --shadow-subtle: 0 1px 3px rgba(0,0,0,0.2);
  --shadow-soft: 0 2px 8px rgba(0,0,0,0.25), 0 1px 2px rgba(0,0,0,0.15);
  --shadow-float: 0 8px 24px rgba(0,0,0,0.3), 0 2px 6px rgba(0,0,0,0.2);
  --shadow-glow: 0 0 20px rgba(92,184,174,0.12);
}
```

**Critical change**: The old `hsl(var(--primary))` pattern no longer works because we switched from HSL triplets to hex values. The tailwind config (Task 2) must update the color references to use `var(--primary)` directly instead of wrapping in `hsl()`.

- [ ] **Step 2: Keep existing keyframe animations unchanged**

The `@keyframes` blocks at the bottom of globals.css (`gradient-x`, `shimmer`, `fadeIn`, `slideIn`, `zoomIn`, and the `prefers-reduced-motion` rule) should remain as-is. The existing `body` styles also stay, but the `*` border-color rule needs updating:

```css
* {
  border-color: var(--border);
}

body {
  background-color: var(--background);
  color: var(--foreground);
  font-family: var(--font-body);
}
```

- [ ] **Step 3: Verify dev server renders correctly**

Run: `pnpm dev`

Open `http://localhost:61323` — verify:
- Background is warm ivory (`#f8f6f1`), not pure white
- Primary buttons are teal, not purple
- Toggle dark mode — background becomes `#161412`

- [ ] **Step 4: Commit**

```bash
git add src/app/globals.css
git commit -m "feat: replace shadcn HSL vars with DESIGN.md hex tokens"
```

### Task 2: Update tailwind.config.ts

**Files:**
- Modify: `tailwind.config.ts`

- [ ] **Step 1: Rewrite the config**

Replace the entire `tailwind.config.ts` to drop `hsl()` wrappers, add accent/semantic colors, and fix border-radius:

```ts
import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        primary: {
          DEFAULT: "var(--primary)",
          foreground: "var(--primary-foreground)",
        },
        secondary: {
          DEFAULT: "var(--secondary)",
          foreground: "var(--secondary-foreground)",
        },
        muted: {
          DEFAULT: "var(--muted)",
          foreground: "var(--muted-foreground)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          foreground: "var(--accent-foreground)",
        },
        card: {
          DEFAULT: "var(--card)",
          foreground: "var(--card-foreground)",
        },
        border: "var(--border)",
        ring: "var(--ring)",

        // Accent palette
        teal: {
          DEFAULT: "var(--teal)",
          soft: "var(--teal-soft)",
        },
        coral: {
          DEFAULT: "var(--coral)",
          soft: "var(--coral-soft)",
        },
        ochre: {
          DEFAULT: "var(--ochre)",
          soft: "var(--ochre-soft)",
        },
        lavender: {
          DEFAULT: "var(--lavender)",
          soft: "var(--lavender-soft)",
        },
        sky: {
          DEFAULT: "var(--sky)",
          soft: "var(--sky-soft)",
        },

        // Semantic
        success: {
          DEFAULT: "var(--success)",
          foreground: "var(--success-foreground)",
        },
        warning: {
          DEFAULT: "var(--warning)",
          foreground: "var(--warning-foreground)",
        },
        error: {
          DEFAULT: "var(--error)",
          foreground: "var(--error-foreground)",
        },
        info: {
          DEFAULT: "var(--info)",
          foreground: "var(--info-foreground)",
        },

        // Surface tokens
        surface: {
          DEFAULT: "var(--surface)",
          warm: "var(--surface-warm)",
          raised: "var(--surface-raised)",
        },
      },
      textColor: {
        "primary-text": "var(--text-primary)",
        "secondary-text": "var(--text-secondary)",
        "muted-text": "var(--text-muted)",
      },
      borderRadius: {
        sm: "6px",
        md: "10px",
        lg: "14px",
        xl: "20px",
        full: "9999px",
      },
      boxShadow: {
        subtle: "var(--shadow-subtle)",
        soft: "var(--shadow-soft)",
        float: "var(--shadow-float)",
        glow: "var(--shadow-glow)",
      },
    },
  },
  plugins: [],
};

export default config;
```

- [ ] **Step 2: Run lint to confirm no config errors**

Run: `pnpm lint`
Expected: no errors related to tailwind config

- [ ] **Step 3: Commit**

```bash
git add tailwind.config.ts
git commit -m "feat: add accent/semantic colors and fix border-radius in tailwind config"
```

### Task 3: Batch replace red → error semantic

**Files:**
- Modify: ~35 component files

- [ ] **Step 1: Search and replace red color classes**

Use these replacement patterns across all `.tsx` files in `src/`:

| Find | Replace |
|------|---------|
| `bg-red-50` | `bg-error/5` |
| `bg-red-100` | `bg-error/10` |
| `bg-red-500` | `bg-error` |
| `bg-red-600` | `bg-error` |
| `bg-red-700` | `bg-error` |
| `text-red-500` | `text-error` |
| `text-red-600` | `text-error` |
| `text-red-700` | `text-error` |
| `border-red-200` | `border-error/20` |
| `border-red-300` | `border-error/30` |
| `hover:bg-red-700` | `hover:bg-error/90` |
| `dark:bg-red-900/20` | `bg-error/10` |
| `dark:text-red-400` | `text-error` |
| `dark:border-red-800` | `border-error/20` |

Run each replacement as a project-wide find-and-replace. After each batch, check that no red-* classes remain (except decorative cases like ThemeToggle sun icon).

- [ ] **Step 2: Verify with grep**

Run: `grep -r "bg-red-\|text-red-\|border-red-" src/ --include="*.tsx" -l`
Expected: empty or only decorative exceptions

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "refactor: replace red Tailwind classes with error semantic token"
```

### Task 4: Batch replace green → success semantic

**Files:**
- Modify: ~30 component files

- [ ] **Step 1: Search and replace green color classes**

| Find | Replace |
|------|---------|
| `bg-green-50` | `bg-success/5` |
| `bg-green-100` | `bg-success/10` |
| `bg-green-500` | `bg-success` |
| `bg-green-600` | `bg-success` |
| `text-green-500` | `text-success` |
| `text-green-600` | `text-success` |
| `text-green-700` | `text-success` |
| `border-green-200` | `border-success/20` |
| `border-green-300` | `border-success/30` |
| `dark:text-green-400` | `text-success` |
| `dark:bg-green-900/20` | `bg-success/10` |

- [ ] **Step 2: Verify with grep**

Run: `grep -r "bg-green-\|text-green-\|border-green-" src/ --include="*.tsx" -l`
Expected: empty or only decorative exceptions

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "refactor: replace green Tailwind classes with success semantic token"
```

### Task 5: Batch replace blue → info/sky semantic

**Files:**
- Modify: ~20 component files

- [ ] **Step 1: Search and replace blue color classes**

| Find | Replace |
|------|---------|
| `bg-blue-50` | `bg-info/5` |
| `bg-blue-100` | `bg-info/10` |
| `bg-blue-500` | `bg-info` |
| `bg-blue-600` | `bg-info` |
| `text-blue-500` | `text-info` |
| `text-blue-600` | `text-info` |
| `text-blue-700` | `text-info` |
| `border-blue-200` | `border-info/20` |
| `border-blue-300` | `border-info/30` |
| `dark:text-blue-400` | `text-info` |
| `dark:bg-blue-900/20` | `bg-info/10` |

Special case — `CharacterDialog.tsx` Wikipedia section (large blue UI block): replace the entire block's blue classes with `--sky` / `--sky-soft` variants.

- [ ] **Step 2: Verify with grep**

Run: `grep -r "bg-blue-\|text-blue-\|border-blue-" src/ --include="*.tsx" -l`
Expected: empty or only decorative exceptions

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "refactor: replace blue Tailwind classes with info/sky semantic token"
```

### Task 6: Batch replace yellow → warning semantic

**Files:**
- Modify: ~6 component files

- [ ] **Step 1: Search and replace yellow color classes**

| Find | Replace |
|------|---------|
| `bg-yellow-50` | `bg-warning/5` |
| `bg-yellow-100` | `bg-warning/10` |
| `bg-yellow-500` | `bg-warning` |
| `text-yellow-600` | `text-warning` |
| `text-yellow-700` | `text-warning` |
| `border-yellow-200` | `border-warning/20` |
| `dark:text-yellow-400` | `text-warning` |

Exception: `ThemeToggle.tsx` sun icon yellow — leave as-is (decorative).

- [ ] **Step 2: Verify with grep**

Run: `grep -r "bg-yellow-\|text-yellow-\|border-yellow-" src/ --include="*.tsx" -l`
Expected: only ThemeToggle.tsx

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "refactor: replace yellow Tailwind classes with warning semantic token"
```

### Task 7: Replace hardcoded hex → CSS variable references

**Files:**
- Modify: `src/components/BottomTabBar.tsx`, `src/components/Toast.tsx`, `src/components/EpisodeProposalModal.tsx`, `src/components/CharacterDialog.tsx`, `src/app/page.tsx`, `src/components/GeneratingAnimation.tsx`

- [ ] **Step 1: Replace hardcoded values**

| File | Find | Replace |
|------|------|---------|
| `BottomTabBar.tsx` | `border-[#e2ddd4]` | `border-border` |
| `BottomTabBar.tsx` | `text-[#3d8b84]` | `text-teal` |
| `BottomTabBar.tsx` | `text-[#a09a93]` | `text-muted-foreground` |
| `Toast.tsx` | `bg-[#f0fdf4]` | `bg-success/5` |
| `Toast.tsx` | `text-[#5a9e6f]` | `text-success` |
| `Toast.tsx` | `bg-[#fef2f2]` | `bg-error/5` |
| `Toast.tsx` | `text-[#c05a4a]` | `text-error` |
| `CharacterDialog.tsx` | `border-[#3d8b84]/30` | `border-teal/30` |
| `CharacterDialog.tsx` | `bg-[#3d8b84]` | `bg-teal` |
| `page.tsx` (home) | `rounded-[20px]` | `rounded-xl` |
| `page.tsx` (home) | `rounded-[10px]` | `rounded-md` |
| `GeneratingAnimation.tsx` | `from-[#3d8b84] to-[#5cb8ae]` | `from-teal to-teal/70` |
| `result/[id]/page.tsx` | `from-[#3d8b84] to-[#5cb8ae]` | `text-teal` (remove gradient per DESIGN.md anti-pattern) |
| `settings/page.tsx` | `bg-[#8b7eb5]` | `bg-error` (was misusing lavender for delete button) |

- [ ] **Step 2: Verify no remaining hardcoded DESIGN.md hex values**

Run: `grep -r "#3d8b84\|#5cb8ae\|#c4756a\|#b8943e\|#8b7eb5\|#5b95b8\|#c05a4a\|#5a9e6f" src/ --include="*.tsx" -l`
Expected: empty (all moved to CSS variables)

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "refactor: replace hardcoded hex values with CSS variable references"
```

### Task 8: Visual verification and GeneratingAnimation token fix

**Files:**
- Modify: `src/components/GeneratingAnimation.tsx`

- [ ] **Step 1: Replace remaining raw color classes in GeneratingAnimation**

In `GeneratingAnimation.tsx`, replace the StepIndicator and StepConnector colors:

```tsx
// In StepIndicator — replace:
//   "bg-green-500 text-white"     → "bg-success text-success-foreground"
//   "text-green-600 dark:text-green-400" → "text-success"

// In StepConnector — replace:
//   "bg-green-500" → "bg-success"
```

- [ ] **Step 2: Run the full test suite**

Run: `pnpm test`
Expected: all tests pass

- [ ] **Step 3: Run lint**

Run: `pnpm lint`
Expected: no new errors

- [ ] **Step 4: Commit**

```bash
git add src/components/GeneratingAnimation.tsx
git commit -m "refactor: apply semantic tokens to GeneratingAnimation step indicators"
```

---

## Sprint 1B: Pipeline Smoothness

### Task 9: Parallelize research phases

**Files:**
- Modify: `src/lib/client/phases/research.ts`

- [ ] **Step 1: Rewrite runResearchPhase to parallelize Phase 0 and Phase 0.5**

Replace the sequential flow in `runResearchPhase`. The key change: wrap Topic Research (Phase 0 including Wikipedia) and Accuracy Research (Phase 0.5) in `Promise.allSettled`, then run Director (Phase 0.7) after both complete.

```ts
export async function runResearchPhase(task: GenerateTask, request: GenerateRequest): Promise<ResearchResult> {
  let enhancedTopic = request.topic;

  const shouldResearch =
    (!request.contentType || request.contentType === "science" || request.contentType === "xiaohongshu")
    && !request.wikipediaContent;
  const shouldRunAccuracyResearch = request.contentType === "science" || request.contentType === "wikipedia";
  const qualityLevel = request.quality || "standard";

  // ── Parallel group: Phase 0 (Topic + Wikipedia) || Phase 0.5 (Accuracy) ──
  task.streamText = "正在并行研究主题与事实约束...";
  notifyListeners(task);

  const topicResearchPromise = shouldResearch
    ? runTopicResearch(task, request)
    : Promise.resolve(null);

  const accuracyResearchPromise = shouldRunAccuracyResearch
    ? runAccuracyResearch(task, request)
    : Promise.resolve(null);

  const [topicResult, accuracyResult] = await Promise.allSettled([
    topicResearchPromise,
    accuracyResearchPromise,
  ]);

  // Apply topic research results
  if (topicResult.status === "fulfilled" && topicResult.value) {
    task.topicResearch = topicResult.value.topicResearch;
    enhancedTopic = topicResult.value.enhancedTopic;
    task.progress = 10;
    task.streamText = `[Topic Research]\n${topicResult.value.topicResearch!.expandedDescription}\n\nKey Facts:\n${topicResult.value.topicResearch!.keyFacts.map((f: string, i: number) => `${i + 1}. ${f}`).join("\n")}`;
    notifyListeners(task);
  } else if (topicResult.status === "rejected") {
    console.warn("[Generator] Topic research failed, using original topic:", topicResult.reason);
  }

  // Apply accuracy research results
  if (accuracyResult.status === "fulfilled" && accuracyResult.value) {
    task.factPack = accuracyResult.value.factPack;
    task.researchBrief = accuracyResult.value.researchBrief;
  } else if (accuracyResult.status === "rejected") {
    console.warn("[AccuracyResearch] failed (non-fatal):", accuracyResult.reason);
  }

  // ── Phase 0.7: Director Outline (depends on both) ──
  if (qualityLevel === "fine" || qualityLevel === "standard") {
    traceStart(task, "director");
    try {
      task.streamText = "正在规划叙事大纲...";
      notifyListeners(task);

      const outline = await generateNarrativeOutline(
        enhancedTopic,
        request.style,
        request.panelCount ?? undefined,
        request.llmConfig,
        request.contentType,
        task.topicResearch?.expandedDescription,
      );

      if (outline) {
        task.narrativeOutline = outline;
        console.log(`[Director] Outline generated: ${outline.totalPanels} panels, arc: ${outline.narrativeArc}`);
      }
      traceEnd(task, "director");
    } catch (dirErr) {
      traceEnd(task, "director", dirErr instanceof Error ? dirErr.message : "Director failed");
      console.warn("[Director] Outline generation failed (non-fatal):", dirErr);
    }
  } else {
    traceSkip(task, "director");
  }

  return {
    enhancedTopic,
    factPack: task.factPack,
    researchBrief: task.researchBrief,
    topicResearch: task.topicResearch,
    narrativeOutline: task.narrativeOutline,
  };
}
```

- [ ] **Step 2: Extract helper functions for the parallel branches**

Add two private helper functions in the same file — `runTopicResearch` and `runAccuracyResearch` — that contain the existing Phase 0 and Phase 0.5 logic respectively. These are direct extractions of the current code blocks, returning typed results.

`runTopicResearch` returns `{ enhancedTopic: string; topicResearch: GenerateTask["topicResearch"] }` and includes the Wikipedia auto-lookup.

`runAccuracyResearch` returns `{ factPack: GenerateTask["factPack"]; researchBrief: GenerateTask["researchBrief"] }`.

- [ ] **Step 3: Run tests**

Run: `pnpm test -- --grep "taskLifecycle\|research"`
Expected: existing tests pass

- [ ] **Step 4: Commit**

```bash
git add src/lib/client/phases/research.ts
git commit -m "feat: parallelize topic and accuracy research phases"
```

### Task 10: Enhance pipeline progress feedback in GeneratingAnimation

**Files:**
- Modify: `src/components/GeneratingAnimation.tsx`

- [ ] **Step 1: Read pipelineTrace from task and show real-time stage detail**

Update `GeneratingAnimation` to accept a `pipelineTrace` prop and use it to show elapsed time per stage and richer status text:

```tsx
interface GeneratingAnimationProps {
  status: "scripting" | "generating" | "pending";
  progress: number;
  taskId: string;
  totalPanels?: number;
  completedPanels?: number;
  qualityLevel?: "fast" | "standard" | "fine";
  /** Pipeline stage trace for real-time progress */
  pipelineTrace?: PipelineStageTrace[];
}
```

In the `StepIndicator` section, replace the static `progress < 10` / `progress >= 10` thresholds with actual trace data:

```tsx
// Derive step states from pipelineTrace
const getStageStatus = (stage: string) => {
  const entry = pipelineTrace?.find(t => t.stage === stage);
  if (!entry) return "pending";
  return entry.status;
};

const getStageElapsed = (stage: string) => {
  const entry = pipelineTrace?.find(t => t.stage === stage);
  if (!entry?.startedAt) return null;
  const end = entry.completedAt ?? Date.now();
  return Math.round((end - entry.startedAt) / 1000);
};
```

Update each `StepIndicator` to use trace status instead of progress thresholds:

```tsx
<StepIndicator
  step={1}
  label={`主题研究${getStageElapsed("research") ? ` (${getStageElapsed("research")}s)` : ""}`}
  active={getStageStatus("research") === "running"}
  done={getStageStatus("research") === "completed"}
  failed={getStageStatus("research") === "failed"}
/>
```

- [ ] **Step 2: Add `failed` state to StepIndicator**

```tsx
function StepIndicator({ step, label, active, done, failed }: {
  step: number; label: string; active: boolean; done: boolean; failed?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors ${
        failed ? "bg-error text-error-foreground" :
        done ? "bg-success text-success-foreground" :
        active ? "bg-primary text-primary-foreground animate-pulse" :
        "bg-muted text-muted-foreground"
      }`}>
        {failed ? "!" : done ? (
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        ) : step}
      </div>
      <span className={`transition-colors ${
        failed ? "text-error" :
        done ? "text-success" :
        active ? "text-foreground font-medium" :
        "text-muted-foreground"
      }`}>{label}</span>
    </div>
  );
}
```

- [ ] **Step 3: Thread pipelineTrace through the result page**

The `result/[id]/page.tsx` already passes task props to `GeneratingAnimation`. Add `pipelineTrace={task.pipelineTrace}` to the props.

- [ ] **Step 4: Commit**

```bash
git add src/components/GeneratingAnimation.tsx src/app/result/\\[id\\]/page.tsx
git commit -m "feat: show real-time pipeline stage progress with elapsed times"
```

### Task 11: Endpoint-aware concurrency and progressive 429 recovery

**Files:**
- Modify: `src/lib/client/phases/imageGen.ts`
- Modify: `src/lib/concurrency.ts`
- Create: `src/__tests__/concurrencyRecovery.test.ts`

- [ ] **Step 1: Write failing test for progressive 429 recovery**

Create `src/__tests__/concurrencyRecovery.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { withConcurrency } from "@/lib/concurrency";

describe("withConcurrency 429 recovery", () => {
  it("recovers concurrency after throttle window expires", async () => {
    let callCount = 0;
    const tasks = Array.from({ length: 10 }, (_, i) => async () => {
      callCount++;
      if (i === 2) {
        const err = new Error("429 Too Many Requests");
        (err as any).status = 429;
        throw err;
      }
      return i;
    });

    const results = await withConcurrency(tasks, {
      limit: 4,
      throttleDuration: 100, // short for testing
      recoverySteps: [
        { afterMs: 50, limitFraction: 0.75 },
        { afterMs: 100, limitFraction: 1.0 },
      ],
    });

    // All 10 tasks should have run despite throttle
    expect(results.filter(r => r.status === "fulfilled").length).toBeGreaterThanOrEqual(9);
    expect(results[2].status).toBe("rejected");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- concurrencyRecovery`
Expected: FAIL — `recoverySteps` config option doesn't exist yet

- [ ] **Step 3: Add recoverySteps to ConcurrencyConfig and implement recovery**

In `src/lib/concurrency.ts`, add to `ConcurrencyConfig`:

```ts
export interface RecoveryStep {
  /** ms after throttle starts to apply this step */
  afterMs: number;
  /** fraction of original limit to restore (0-1) */
  limitFraction: number;
}

export interface ConcurrencyConfig {
  limit: number;
  signal?: AbortSignal;
  throttledLimit?: number;
  throttleDuration?: number;
  /** Progressive recovery steps after 429 throttle */
  recoverySteps?: RecoveryStep[];
}
```

In `withConcurrency`, replace the static `throttledUntil` check with a function that computes the effective limit based on time since throttle:

```ts
function effectiveLimit(): number {
  const now = Date.now();
  if (now >= throttledUntil) return limit;

  const elapsed = now - (throttledUntil - throttleDuration);
  if (recoverySteps && recoverySteps.length > 0) {
    // Find the highest applicable recovery step
    let best = throttledLimit;
    for (const step of recoverySteps) {
      if (elapsed >= step.afterMs) {
        best = Math.max(best, Math.ceil(limit * step.limitFraction));
      }
    }
    return best;
  }
  return throttledLimit;
}
```

Replace `activeWorkers > throttledLimit` checks with `activeWorkers > effectiveLimit()`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- concurrencyRecovery`
Expected: PASS

- [ ] **Step 5: Add endpoint-aware concurrency in imageGen.ts**

In `src/lib/client/phases/imageGen.ts`, replace the static `IMAGE_CONCURRENCY` with dynamic selection:

```ts
function getImageConcurrency(endpointType?: string): number {
  const stored = typeof window !== "undefined"
    ? parseInt(localStorage.getItem("image_concurrency") || "0", 10)
    : 0;
  if (stored > 0) return stored; // user override

  if (endpointType === "comfyui") return 2;
  return 6; // cloud API default
}
```

Update the `withConcurrency` call at the bottom of `runImageGenPhase`:

```ts
const concurrencyLimit = getImageConcurrency(imageConfig?.endpointType);
await withConcurrency(taskFactories, {
  limit: concurrencyLimit,
  recoverySteps: [
    { afterMs: 30000, limitFraction: 0.75 },
    { afterMs: 60000, limitFraction: 1.0 },
  ],
});
```

- [ ] **Step 6: Make firstPanelAsRef opt-in**

In `runImageGenPhase`, change the `shouldUseFirstPanelAsRef` condition:

```ts
const characterConsistencyEnabled = typeof window !== "undefined"
  && localStorage.getItem("character_consistency_ref") === "true";
const shouldUseFirstPanelAsRef = characterConsistencyEnabled && hasCharacter && !hasUserRef && panelIndices.length > 1;
```

- [ ] **Step 7: Run full test suite**

Run: `pnpm test`
Expected: all pass

- [ ] **Step 8: Commit**

```bash
git add src/lib/concurrency.ts src/lib/client/phases/imageGen.ts src/__tests__/concurrencyRecovery.test.ts
git commit -m "feat: endpoint-aware concurrency, 429 recovery, opt-in firstPanelAsRef"
```

---

## Sprint 2: Relation Graph Rewrite

### Task 12: Graph types and simulation hook

**Files:**
- Create: `src/components/characters/graph/types.ts`
- Create: `src/components/characters/graph/useGraphSimulation.ts`

- [ ] **Step 1: Create graph types**

```ts
// src/components/characters/graph/types.ts
import type { SimulationNodeDatum, SimulationLinkDatum } from "d3-force";
import type { Character, CharacterRelation, RelationType } from "@/lib/types";

export interface GraphNode extends SimulationNodeDatum {
  id: string;
  character: Character;
}

export interface GraphLink extends SimulationLinkDatum<GraphNode> {
  relation: CharacterRelation;
}

export type LayoutMode = "force" | "series" | "type";

export interface GraphViewState {
  transform: { x: number; y: number; k: number };
  selectedNodeId: string | null;
  selectedRelation: CharacterRelation | null;
  enabledTypes: Set<RelationType>;
  layoutMode: LayoutMode;
}

/** Extended relation type colors (impressionist palette) */
export const RELATION_COLORS: Record<string, string> = {
  friend: "#5b95b8",
  rival: "#c05a4a",
  mentor: "#b8943e",
  lover: "#c4756a",
  family: "#5a9e6f",
  ally: "#3d8b84",
  enemy: "#8b4a42",
  student: "#8b7eb5",
  servant: "#a09a93",
  partner: "#5cb8ae",
};

export const RELATION_LABELS: Record<string, string> = {
  friend: "朋友",
  rival: "对手",
  mentor: "导师",
  lover: "恋人",
  family: "家人",
  ally: "盟友",
  enemy: "敌人",
  student: "师生",
  servant: "主仆",
  partner: "搭档",
};

/** Directed relation types (show arrow) */
export const DIRECTED_TYPES = new Set(["mentor", "student", "servant"]);
```

- [ ] **Step 2: Create useGraphSimulation hook**

```ts
// src/components/characters/graph/useGraphSimulation.ts
"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import {
  forceSimulation, forceLink, forceManyBody, forceCenter,
  forceCollide, forceRadial,
  type Simulation,
} from "d3-force";
import type { GraphNode, GraphLink, LayoutMode } from "./types";

const NODE_RADIUS = 40;

export function useGraphSimulation(
  characters: { id: string; character: any }[],
  links: GraphLink[],
  width: number,
  height: number,
  layoutMode: LayoutMode,
) {
  const simRef = useRef<Simulation<GraphNode, GraphLink> | null>(null);
  const nodesRef = useRef<GraphNode[]>([]);
  const linksRef = useRef<GraphLink[]>([]);
  const [tick, setTick] = useState(0);

  const scheduleTick = useCallback(() => {
    setTick(v => v + 1);
  }, []);

  // Build / update nodes preserving positions
  useEffect(() => {
    const prevMap = new Map<string, GraphNode>();
    for (const n of nodesRef.current) prevMap.set(n.id, n);

    const nodeMap = new Map<string, GraphNode>();
    characters.forEach(c => {
      const prev = prevMap.get(c.id);
      nodeMap.set(c.id, prev
        ? Object.assign(prev, { character: c.character })
        : { id: c.id, character: c.character }
      );
    });

    nodesRef.current = Array.from(nodeMap.values());
    linksRef.current = links.filter(l => {
      const sId = typeof l.source === "object" ? (l.source as GraphNode).id : l.source;
      const tId = typeof l.target === "object" ? (l.target as GraphNode).id : l.target;
      return nodeMap.has(sId as string) && nodeMap.has(tId as string);
    });

    if (simRef.current) {
      simRef.current.nodes(nodesRef.current);
      const lf = simRef.current.force("link") as any;
      if (lf) lf.links(linksRef.current);
      simRef.current.alpha(0.3).restart();
    }
  }, [characters, links]);

  // Create simulation
  useEffect(() => {
    if (width === 0 || height === 0) return;

    const sim = forceSimulation<GraphNode>(nodesRef.current)
      .force("link", forceLink<GraphNode, GraphLink>(linksRef.current)
        .id(d => d.id)
        .distance(l => 120 + (1 - l.relation.strength) * 100))
      .force("charge", forceManyBody().strength(-400))
      .force("center", forceCenter(width / 2, height / 2))
      .force("collide", forceCollide(NODE_RADIUS + 20))
      .force("radial", forceRadial(Math.min(width, height) * 0.35, width / 2, height / 2).strength(n => {
        // Push isolated nodes outward
        const hasLinks = linksRef.current.some(l => {
          const sId = typeof l.source === "object" ? (l.source as GraphNode).id : l.source;
          const tId = typeof l.target === "object" ? (l.target as GraphNode).id : l.target;
          return sId === (n as GraphNode).id || tId === (n as GraphNode).id;
        });
        return hasLinks ? 0 : 0.3;
      }))
      .alphaDecay(0.02)
      .on("tick", scheduleTick);

    simRef.current = sim;
    return () => { sim.stop(); };
  }, [width, height, scheduleTick]);

  return { nodes: nodesRef.current, links: linksRef.current, sim: simRef, tick };
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/characters/graph/types.ts src/components/characters/graph/useGraphSimulation.ts
git commit -m "feat: add graph types and d3-force simulation hook"
```

### Task 13: Canvas edge layer

**Files:**
- Create: `src/components/characters/graph/CanvasEdgeLayer.tsx`

- [ ] **Step 1: Create CanvasEdgeLayer component**

This component renders all edges on a `<canvas>` element. Edges are bezier curves with strength-based width, direction arrows for directed types, and hover detection via hit testing.

```tsx
// src/components/characters/graph/CanvasEdgeLayer.tsx
"use client";

import React, { useRef, useEffect, useCallback } from "react";
import type { GraphNode, GraphLink } from "./types";
import { RELATION_COLORS, DIRECTED_TYPES } from "./types";

interface Props {
  links: GraphLink[];
  width: number;
  height: number;
  transform: { x: number; y: number; k: number };
  selectedNodeId: string | null;
  onEdgeClick: (rel: GraphLink["relation"]) => void;
  /** Current d3 tick counter to trigger redraws */
  tick: number;
}

/** Compute bezier control point offset for multiple edges between same pair */
function getEdgeOffset(link: GraphLink, allLinks: GraphLink[]): number {
  const sId = typeof link.source === "object" ? (link.source as GraphNode).id : link.source;
  const tId = typeof link.target === "object" ? (link.target as GraphNode).id : link.target;
  const parallel = allLinks.filter(l => {
    const ls = typeof l.source === "object" ? (l.source as GraphNode).id : l.source;
    const lt = typeof l.target === "object" ? (l.target as GraphNode).id : l.target;
    return (ls === sId && lt === tId) || (ls === tId && lt === sId);
  });
  if (parallel.length <= 1) return 0;
  const idx = parallel.indexOf(link);
  return (idx - (parallel.length - 1) / 2) * 30;
}

export function CanvasEdgeLayer({ links, width, height, transform, selectedNodeId, onEdgeClick, tick }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hitMapRef = useRef<Map<string, GraphLink>>(new Map());

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    ctx.save();
    ctx.translate(transform.x, transform.y);
    ctx.scale(transform.k, transform.k);

    for (const link of links) {
      const s = link.source as GraphNode;
      const t = link.target as GraphNode;
      if (s.x == null || s.y == null || t.x == null || t.y == null) continue;

      const color = RELATION_COLORS[link.relation.type] ?? "#a09a93";
      const lineWidth = 1 + link.relation.strength * 4;
      const sId = typeof link.source === "object" ? (link.source as GraphNode).id : link.source;
      const tId = typeof link.target === "object" ? (link.target as GraphNode).id : link.target;
      const isHighlighted = selectedNodeId && (sId === selectedNodeId || tId === selectedNodeId);
      const isDimmed = selectedNodeId && !isHighlighted;

      ctx.globalAlpha = isDimmed ? 0.12 : isHighlighted ? 1 : 0.7;
      ctx.strokeStyle = color;
      ctx.lineWidth = isHighlighted ? lineWidth + 2 : lineWidth;
      ctx.lineCap = "round";

      // Bezier curve
      const offset = getEdgeOffset(link, links);
      const mx = (s.x + t.x) / 2;
      const my = (s.y + t.y) / 2;
      const dx = t.x - s.x;
      const dy = t.y - s.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const nx = -dy / len * offset;
      const ny = dx / len * offset;
      const cx = mx + nx;
      const cy = my + ny;

      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.quadraticCurveTo(cx, cy, t.x, t.y);
      ctx.stroke();

      // Direction arrow for directed types
      if (DIRECTED_TYPES.has(link.relation.type)) {
        const arrowSize = 8;
        const at = 0.7; // position along curve
        const px = (1 - at) * (1 - at) * s.x + 2 * (1 - at) * at * cx + at * at * t.x;
        const py = (1 - at) * (1 - at) * s.y + 2 * (1 - at) * at * cy + at * at * t.y;
        const tangX = 2 * (1 - at) * (cx - s.x) + 2 * at * (t.x - cx);
        const tangY = 2 * (1 - at) * (cy - s.y) + 2 * at * (t.y - cy);
        const tangLen = Math.sqrt(tangX * tangX + tangY * tangY) || 1;
        const ux = tangX / tangLen;
        const uy = tangY / tangLen;

        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(px + ux * arrowSize, py + uy * arrowSize);
        ctx.lineTo(px - uy * arrowSize * 0.5, py + ux * arrowSize * 0.5);
        ctx.lineTo(px + uy * arrowSize * 0.5, py - ux * arrowSize * 0.5);
        ctx.closePath();
        ctx.fill();
      }

      // Midpoint label
      const label = link.relation.label || link.relation.type;
      ctx.font = "600 11px var(--font-body)";
      const textWidth = ctx.measureText(label).width;
      ctx.fillStyle = "var(--surface, #ffffff)";
      ctx.globalAlpha = isDimmed ? 0.3 : 0.85;
      ctx.beginPath();
      ctx.roundRect(cx - textWidth / 2 - 6, cy - 10, textWidth + 12, 20, 4);
      ctx.fill();
      ctx.fillStyle = color;
      ctx.globalAlpha = isDimmed ? 0.3 : 1;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, cx, cy);
    }

    ctx.restore();
  }, [links, width, height, transform, selectedNodeId, tick]);

  useEffect(() => { draw(); }, [draw]);

  // Click hit-testing
  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = (e.clientX - rect.left - transform.x) / transform.k;
    const my = (e.clientY - rect.top - transform.y) / transform.k;

    for (const link of links) {
      const s = link.source as GraphNode;
      const t = link.target as GraphNode;
      if (s.x == null || s.y == null || t.x == null || t.y == null) continue;
      const offset = getEdgeOffset(link, links);
      const cmx = (s.x + t.x) / 2;
      const cmy = (s.y + t.y) / 2;
      const dx = t.x - s.x;
      const dy = t.y - s.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const nx = -dy / len * offset;
      const ny = dx / len * offset;
      const cx = cmx + nx;
      const cy = cmy + ny;
      const dist = Math.sqrt((mx - cx) ** 2 + (my - cy) ** 2);
      if (dist < 20) {
        onEdgeClick(link.relation);
        return;
      }
    }
  }, [links, transform, onEdgeClick]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width, height, position: "absolute", top: 0, left: 0 }}
      onClick={handleClick}
    />
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/characters/graph/CanvasEdgeLayer.tsx
git commit -m "feat: add Canvas edge rendering layer with bezier curves and arrows"
```

### Task 14: SVG node layer and interaction hook

**Files:**
- Create: `src/components/characters/graph/SvgNodeLayer.tsx`
- Create: `src/components/characters/graph/useGraphInteraction.ts`
- Modify: `src/components/characters/CharacterNode.tsx`

- [ ] **Step 1: Create useGraphInteraction hook with unified pointer events**

```ts
// src/components/characters/graph/useGraphInteraction.ts
"use client";

import { useCallback, useRef } from "react";
import type { Simulation } from "d3-force";
import type { GraphNode, GraphLink } from "./types";

interface InteractionConfig {
  sim: React.MutableRefObject<Simulation<GraphNode, GraphLink> | null>;
  transform: { x: number; y: number; k: number };
  onNodeSelect: (id: string | null) => void;
  onDragToNode?: (fromId: string, toId: string) => void;
  nodes: GraphNode[];
}

export function useGraphInteraction({
  sim, transform, onNodeSelect, onDragToNode, nodes,
}: InteractionConfig) {
  const dragNode = useRef<GraphNode | null>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);

  const handlePointerDown = useCallback((e: React.PointerEvent, nodeId: string) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;

    dragNode.current = node;
    dragStart.current = { x: e.clientX, y: e.clientY };
    node.fx = node.x;
    node.fy = node.y;
    sim.current?.alphaTarget(0.3).restart();
    onNodeSelect(nodeId);
  }, [nodes, sim, onNodeSelect]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragNode.current) return;
    dragNode.current.fx = (e.clientX - transform.x) / transform.k;
    dragNode.current.fy = (e.clientY - transform.y) / transform.k;
  }, [transform]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragNode.current) return;
    const node = dragNode.current;

    // Check if dropped onto another node
    if (onDragToNode && dragStart.current) {
      const dist = Math.sqrt(
        (e.clientX - dragStart.current.x) ** 2 +
        (e.clientY - dragStart.current.y) ** 2
      );
      if (dist > 20) {
        const dropX = (e.clientX - transform.x) / transform.k;
        const dropY = (e.clientY - transform.y) / transform.k;
        const target = nodes.find(n =>
          n.id !== node.id &&
          n.x != null && n.y != null &&
          Math.sqrt((n.x - dropX) ** 2 + (n.y - dropY) ** 2) < 50
        );
        if (target) {
          onDragToNode(node.id, target.id);
        }
      }
    }

    // Smooth release (ease-out)
    node.fx = null;
    node.fy = null;
    dragNode.current = null;
    dragStart.current = null;
    sim.current?.alphaTarget(0);
  }, [nodes, sim, transform, onDragToNode]);

  return { handlePointerDown, handlePointerMove, handlePointerUp };
}
```

- [ ] **Step 2: Rewrite CharacterNode.tsx with DESIGN.md tokens**

Replace the hardcoded colors in `CharacterNode.tsx`:

```tsx
"use client";

import React from "react";

interface CharacterNodeProps {
  id: string;
  name: string;
  avatarUrl?: string | null;
  highlighted: boolean;
  dimmed: boolean;
  onPointerDown?: (e: React.PointerEvent) => void;
  /** Border ring color (strongest relation type color) */
  ringColor?: string;
}

const RADIUS = 40;

export function CharacterNode({
  id, name, avatarUrl, highlighted, dimmed, onPointerDown, ringColor,
}: CharacterNodeProps) {
  const firstLetter = name.charAt(0).toUpperCase();
  const opacity = dimmed ? 0.25 : 1;
  const clipId = `clip-${id}`;

  return (
    <g
      style={{ opacity, cursor: "grab", transition: "opacity 0.2s" }}
      onPointerDown={onPointerDown}
    >
      {highlighted && (
        <circle
          r={RADIUS + 4}
          fill="none"
          stroke="var(--teal)"
          strokeWidth={3}
          strokeDasharray="6 3"
          className="animate-pulse"
        />
      )}
      <circle
        r={RADIUS}
        fill={highlighted ? "var(--teal)" : "var(--surface-raised, #f0ede5)"}
        stroke={ringColor || (highlighted ? "var(--teal)" : "var(--border)")}
        strokeWidth={2}
      />
      {avatarUrl ? (
        <>
          <clipPath id={clipId}>
            <circle r={RADIUS - 2} />
          </clipPath>
          <image
            href={avatarUrl}
            x={-(RADIUS - 2)}
            y={-(RADIUS - 2)}
            width={(RADIUS - 2) * 2}
            height={(RADIUS - 2) * 2}
            clipPath={`url(#${clipId})`}
            preserveAspectRatio="xMidYMid slice"
          />
        </>
      ) : (
        <text
          textAnchor="middle"
          dominantBaseline="central"
          fill={highlighted ? "var(--primary-foreground)" : "var(--text-primary)"}
          fontSize={28}
          fontWeight="bold"
          style={{ pointerEvents: "none", userSelect: "none" }}
        >
          {firstLetter}
        </text>
      )}
      <text
        y={RADIUS + 18}
        textAnchor="middle"
        fill="var(--text-secondary)"
        fontSize={13}
        fontWeight={500}
        style={{ pointerEvents: "none", userSelect: "none" }}
      >
        {name}
      </text>
    </g>
  );
}

CharacterNode.RADIUS = RADIUS;
```

- [ ] **Step 3: Create SvgNodeLayer**

```tsx
// src/components/characters/graph/SvgNodeLayer.tsx
"use client";

import React from "react";
import { CharacterNode } from "../CharacterNode";
import type { GraphNode, GraphLink } from "./types";
import { RELATION_COLORS } from "./types";

interface Props {
  nodes: GraphNode[];
  links: GraphLink[];
  transform: { x: number; y: number; k: number };
  selectedNodeId: string | null;
  onPointerDown: (e: React.PointerEvent, nodeId: string) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onBackgroundClick: () => void;
}

/** Find the strongest relation type for a node (used for ring color) */
function getStrongestRelationColor(nodeId: string, links: GraphLink[]): string | undefined {
  let best: GraphLink | null = null;
  for (const l of links) {
    const sId = typeof l.source === "object" ? (l.source as GraphNode).id : l.source;
    const tId = typeof l.target === "object" ? (l.target as GraphNode).id : l.target;
    if (sId === nodeId || tId === nodeId) {
      if (!best || l.relation.strength > best.relation.strength) best = l;
    }
  }
  return best ? RELATION_COLORS[best.relation.type] : undefined;
}

export function SvgNodeLayer({
  nodes, links, transform, selectedNodeId,
  onPointerDown, onPointerMove, onPointerUp, onBackgroundClick,
}: Props) {
  const connectedIds = new Set<string>();
  if (selectedNodeId) {
    links.forEach(l => {
      const sId = typeof l.source === "object" ? (l.source as GraphNode).id : l.source;
      const tId = typeof l.target === "object" ? (l.target as GraphNode).id : l.target;
      if (sId === selectedNodeId || tId === selectedNodeId) {
        connectedIds.add(sId as string);
        connectedIds.add(tId as string);
      }
    });
  }

  return (
    <svg
      style={{ width: "100%", height: "100%", position: "absolute", top: 0, left: 0 }}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onClick={onBackgroundClick}
    >
      <g transform={`translate(${transform.x},${transform.y}) scale(${transform.k})`}>
        {nodes.map(node => {
          const isSelected = node.id === selectedNodeId;
          const isConnected = connectedIds.has(node.id);
          const dimmed = !!selectedNodeId && !isSelected && !isConnected;
          return (
            <g key={node.id} transform={`translate(${node.x ?? 0},${node.y ?? 0})`}>
              <CharacterNode
                id={node.id}
                name={node.character.name}
                avatarUrl={node.character.avatarUrl}
                highlighted={isSelected}
                dimmed={dimmed}
                onPointerDown={(e) => onPointerDown(e, node.id)}
                ringColor={getStrongestRelationColor(node.id, links)}
              />
            </g>
          );
        })}
      </g>
    </svg>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/characters/graph/useGraphInteraction.ts src/components/characters/graph/SvgNodeLayer.tsx src/components/characters/CharacterNode.tsx
git commit -m "feat: add SVG node layer with pointer events and DESIGN.md tokens"
```

### Task 15: Graph controls, minimap, and inline editor

**Files:**
- Create: `src/components/characters/graph/GraphControls.tsx`
- Create: `src/components/characters/graph/MiniMap.tsx`
- Create: `src/components/characters/graph/InlineEdgeEditor.tsx`
- Create: `src/components/characters/graph/NodeContextMenu.tsx`

- [ ] **Step 1: Create GraphControls (zoom buttons + layout switcher + type filter)**

GraphControls renders: zoom +/- buttons, fit-to-content button, layout mode dropdown (force/series/type), and relation type filter pills with counts. Uses DESIGN.md tokens for all colors.

- [ ] **Step 2: Create MiniMap**

MiniMap renders a 150x100 canvas in the bottom-right corner showing all nodes as dots and a viewport rectangle. Clicking the minimap pans the main view.

- [ ] **Step 3: Create InlineEdgeEditor**

InlineEdgeEditor is a floating popover positioned at the edge midpoint. Contains: type select, strength slider, label input, save/delete buttons. Triggered by double-click on an edge.

- [ ] **Step 4: Create NodeContextMenu**

NodeContextMenu is a right-click context menu with options: "编辑角色", "添加关系", "聚焦邻居", "隐藏节点". Positioned at pointer coordinates.

- [ ] **Step 5: Commit**

```bash
git add src/components/characters/graph/GraphControls.tsx src/components/characters/graph/MiniMap.tsx src/components/characters/graph/InlineEdgeEditor.tsx src/components/characters/graph/NodeContextMenu.tsx
git commit -m "feat: add graph controls, minimap, inline editor, and context menu"
```

### Task 16: Rewrite RelationGraph.tsx as canvas+svg container

**Files:**
- Modify: `src/components/characters/RelationGraph.tsx`
- Modify: `src/components/characters/RelationEdge.tsx`
- Modify: `src/components/characters/RelationTimelineSlider.tsx`
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Extend RelationType in types.ts**

In `src/lib/types.ts`, expand the union:

```ts
export type RelationType = "friend" | "rival" | "mentor" | "lover" | "family" | "ally" | "enemy" | "student" | "servant" | "partner";
```

- [ ] **Step 2: Update RelationEdge.tsx exports**

Update `TYPE_COLORS` and `TYPE_LABELS` to use the new impressionist palette from `graph/types.ts`. Keep the component export for backward compatibility but the graph no longer renders it as SVG — it's used only for the color/label constants.

- [ ] **Step 3: Rewrite RelationGraph.tsx**

Replace the entire component with the new canvas+svg architecture. The new structure:

```tsx
export function RelationGraph({ characters, relations, onAddRelation, onDeleteRelation, onUpdateRelation, onRelationTypeChanged }: RelationGraphProps) {
  // ... state setup ...
  // useGraphSimulation hook
  // useGraphInteraction hook
  // d3-zoom setup

  return (
    <div ref={containerRef} className="relative w-full h-full bg-background">
      {/* Canvas layer (edges) */}
      <CanvasEdgeLayer ... />

      {/* SVG layer (nodes) */}
      <SvgNodeLayer ... />

      {/* Controls overlay */}
      <GraphControls ... />

      {/* MiniMap */}
      <MiniMap ... />

      {/* Timeline slider */}
      <RelationTimelineSlider ... />

      {/* Inline editor (conditional) */}
      {editingEdge && <InlineEdgeEditor ... />}

      {/* Context menu (conditional) */}
      {contextMenu && <NodeContextMenu ... />}

      {/* Detail panel (conditional, for advanced editing) */}
      {selectedRelation && <RelationDetailPanel ... />}
    </div>
  );
}
```

- [ ] **Step 4: Rewrite RelationTimelineSlider with transition animations**

Add CSS transitions so that when the slider value changes, edges smoothly fade/morph instead of snapping.

- [ ] **Step 5: Run lint and verify**

Run: `pnpm lint`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/components/characters/RelationGraph.tsx src/components/characters/RelationEdge.tsx src/components/characters/RelationTimelineSlider.tsx src/lib/types.ts
git commit -m "feat: rewrite RelationGraph with canvas/svg hybrid and DESIGN.md tokens"
```

---

## Sprint 3: Bug Fixes + Stability

### Task 17: Fix image 400 errors — opt-in firstPanelAsRef and null-guard

**Files:**
- Modify: `src/lib/imageGen/index.ts`

Note: The opt-in logic in `imageGen.ts` was already added in Task 11. This task handles the remaining defense in `buildImagesBody`.

- [ ] **Step 1: Add null-guard for image field in buildImagesBody**

In `ChatImageAdapter.buildImagesBody`, ensure undefined/null `image` is never sent:

```ts
private buildImagesBody(prompt: string, seed?: number): Record<string, unknown> {
  // ... existing code ...
  const result: Record<string, unknown> = {
    model: this.config.model,
    prompt,
    size: this.config.size,
    response_format: "b64_json",
    negative_prompt: negativePrompt,
    ...(seed !== undefined && { seed }),
  };

  // Only include extra_body fields that have non-null values
  if (this.config.extraBody) {
    const eb = this.config.extraBody;
    if (eb.num_inference_steps) result.num_inference_steps = eb.num_inference_steps;
    if (eb.guidance_scale) result.guidance_scale = eb.guidance_scale;
    if (eb.control_image) {
      result.control_image = eb.control_image;
      result.control_mode = eb.control_mode || "HED";
    }
    if (eb.control_context_scale !== undefined) result.control_context_scale = eb.control_context_scale;
    if (eb.image_scale !== undefined) result.image_scale = eb.image_scale;
    // KEY FIX: Only send image if it's a non-empty string
    if (eb.image && typeof eb.image === "string" && eb.image.length > 0) {
      result.image = eb.image;
    }
    if (eb.strength !== undefined) result.strength = eb.strength;
  }

  return result;
}
```

- [ ] **Step 2: Enhance 400 error messages**

In the `generate` method, parse the upstream error body:

```ts
if (!response.ok) {
  let msg = rawText || response.statusText;
  // Try to extract structured error message
  try {
    const errData = JSON.parse(rawText);
    if (errData.error?.message) msg = errData.error.message;
  } catch {}
  // ... rest of error handling
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/imageGen/index.ts
git commit -m "fix: null-guard image field in buildImagesBody and enhance error messages"
```

### Task 18: Fix ComfyUI image persistence

**Files:**
- Modify: `src/lib/client/phases/imageGen.ts`
- Modify: `src/app/api/comfyui/route.ts`

- [ ] **Step 1: Convert fire-and-forget to await in imageGen.ts**

Replace the `.then()` pattern at line 168-178 with `await`:

```ts
// Replace this:
urlToBase64(imageUrl)
  .then((base64) => { ... })
  .catch((err) => { ... });

// With this:
try {
  const base64 = await urlToBase64(imageUrl);
  panel.imageUrl = base64;
  pushImageVersion(panel, base64);
  await saveImageToFileSystem(task.id, panelIndex, base64, script.title);
  await saveTaskThrottled(task);
  notifyListeners(task);
} catch (persistErr) {
  console.warn(`Panel ${panelIndex} persistence failed, retrying once:`, persistErr);
  // One retry
  try {
    await saveImageToFileSystem(task.id, panelIndex, panel.imageUrl!, script.title);
  } catch {
    console.error(`Panel ${panelIndex} persistence failed permanently`);
  }
  pushImageVersion(panel, imageUrl);
}
```

- [ ] **Step 2: Increase ComfyUI timeout to 5 minutes**

In `src/app/api/comfyui/route.ts`, change:

```ts
const MAX_POLL_TIME_MS = 300_000; // 5 minutes
```

- [ ] **Step 3: Add dynamic polling interval**

Replace the static `POLL_INTERVAL_MS = 500` with adaptive polling:

```ts
// Replace fixed interval with adaptive
const elapsed = Date.now() - startTime;
const pollInterval = elapsed < 30_000 ? 500 : 2000;
await new Promise((resolve) => setTimeout(resolve, pollInterval));
```

- [ ] **Step 4: Add beforeunload warning**

In `src/lib/client/phases/imageGen.ts`, add at the start of `runImageGenPhase`:

```ts
const onBeforeUnload = (e: BeforeUnloadEvent) => {
  e.preventDefault();
  e.returnValue = "漫画图片正在生成中，离开将丢失未保存的图片。确定离开吗？";
};
window.addEventListener("beforeunload", onBeforeUnload);
```

And clean up at the end:

```ts
window.removeEventListener("beforeunload", onBeforeUnload);
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/client/phases/imageGen.ts src/app/api/comfyui/route.ts
git commit -m "fix: await image persistence, increase ComfyUI timeout, add exit warning"
```

### Task 19: Fix remaining issues

**Files:**
- Modify: `src/app/api/save-image/route.ts`
- Modify: `src/lib/client/eventBus.ts`

- [ ] **Step 1: Fix save-image path for standalone mode**

In `src/app/api/save-image/route.ts`, change:

```ts
// Replace:
const outputBase = path.join(process.cwd(), "public", "output");

// With:
const outputBase = path.join(process.cwd(), "data", "output");
```

- [ ] **Step 2: Separate save throttle from notify throttle in eventBus**

In `notifyListeners`, replace the Zustand update with `requestAnimationFrame` batching:

```ts
let pendingNotify: GenerateTask | null = null;
let notifyRaf: number | null = null;

export function notifyListeners(task: GenerateTask) {
  const isStreaming = task.status === "scripting" && task.streamText;

  if (isStreaming && task.streamText) {
    emitStreamText(task.id, task.streamText);
  }

  if (
    isStreaming &&
    task.id === lastSnapshotId &&
    task.status === lastSnapshotStatus &&
    task.progress === lastSnapshotProgress
  ) {
    return;
  }

  lastSnapshotId = task.id;
  lastSnapshotProgress = task.progress;
  lastSnapshotStatus = task.status;

  // Batch Zustand updates with rAF to avoid progress "jumps"
  pendingNotify = task;
  if (notifyRaf == null) {
    notifyRaf = requestAnimationFrame(() => {
      notifyRaf = null;
      if (pendingNotify) {
        const snapshot = cloneTask(pendingNotify);
        snapshot.streamText = undefined;
        useTaskStore.getState().updateTask(snapshot);
        pendingNotify = null;
      }
    });
  }
}
```

- [ ] **Step 3: Run full test suite**

Run: `pnpm test`
Expected: all pass

- [ ] **Step 4: Run lint**

Run: `pnpm lint`
Expected: no new errors

- [ ] **Step 5: Commit**

```bash
git add src/app/api/save-image/route.ts src/lib/client/eventBus.ts
git commit -m "fix: save-image path for standalone, separate notify from save throttle"
```

### Task 20: Final verification

- [ ] **Step 1: Run ship:check**

Run: `pnpm ship:check`
Expected: lint + test + build all pass

- [ ] **Step 2: Manual smoke test**

Open `http://localhost:61323` and verify:
1. Home page: warm ivory background, teal primary buttons, no purple anywhere
2. Dark mode toggle: correct dark colors
3. `/create`: start a generation — see parallel research in progress bar
4. `/characters`: open relation graph — canvas edges with bezier curves, SVG nodes
5. Relation graph: drag nodes, double-click edges, right-click context menu
6. Settings: "角色一致性增强" toggle visible (default off)
