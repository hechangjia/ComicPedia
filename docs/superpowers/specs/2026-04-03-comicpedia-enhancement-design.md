# ComicPedia Enhancement Design — Architecture + Features + UX

> Date: 2026-04-03
> Status: Approved
> Scope: Architecture refactoring, deep character system, UX improvements, pipeline enhancements

---

## 1. Goals

- **Architecture**: Break apart 5 oversized files (900-2100 lines), add test coverage for 10 untested core modules
- **Character System**: Deep character modeling with personality, relationships, Obsidian-style force-directed graph, and cross-episode arc evolution
- **UX**: Progressive disclosure for result page, WYSIWYG script editor, gallery upgrade with tags/favorites/multi-view
- **Pipeline**: Multi-character prompt orchestration, topic recommendations, per-stage observability

Approach: parallel iteration — each phase interleaves refactoring with feature work.

---

## 2. Workstream 1 — Architecture Remediation

### 2.1 File Splits

| File | Lines | Split Strategy |
|------|-------|----------------|
| `src/app/characters/page.tsx` | 2102 | Extract `CharacterDialog`, `CharacterList`, `CharacterPreview`, `CharacterVLMPanel` components + `useCharacterForm` hook |
| `src/lib/client/taskLifecycle.ts` | 1112 | Split by pipeline phase: `phases/research.ts`, `phases/script.ts`, `phases/imageGen.ts`, `phases/vlm.ts`, `phases/quality.ts`. Main file becomes orchestrator only |
| `src/lib/downloadUtils.ts` | 1449 | Split by format: `export/pdf.ts`, `export/zip.ts`, `export/xhs.ts`, `export/seedance.ts`, `export/markdown.ts`, `export/image.ts`. Shared utils in `export/shared.ts` |
| `src/lib/llm.ts` | 1012 | Split into `llm/client.ts` (HTTP calls), `llm/parsers.ts` (response parsing), `llm/characterGen.ts` (character profile/prompt generation) |
| `src/components/result/QualityScorePanel.tsx` | 906 | Extract `ScoreDimension`, `ScoreRadar`, `ScoreSummary`, `RetryRecommendations` sub-components |

**Constraints**:
- All splits are pure refactors — zero behavior change, existing tests must pass
- Public API surface of each module stays identical (re-export from original path if needed temporarily)
- Each split is one atomic commit

### 2.2 Test Coverage Priorities

Ordered by risk (likelihood of regression x impact):

1. `llm.ts` — Core LLM call chain, response parsing has many edge cases
2. `series.ts` — Foundation for upcoming character arc features
3. `exportImport.ts` — Data loss risk on import/export bugs
4. `downloadUtils.ts` — 8+ export formats, many canvas/PDF edge cases
5. `imageGen/index.ts` — Multi-adapter switching logic
6. `utils.ts`, `shareCard.ts`, `quizGenerator.ts`, `relatedTopics.ts`, `aiEditor.ts` — Lower risk, batch later

**Test approach**: Unit tests with vitest. Mock external API calls (LLM, image gen). For downloadUtils, test helper functions (layout calculation, markdown generation) without canvas/PDF rendering.

---

## 3. Workstream 2 — Deep Character System

### 3.1 Data Model Extensions

```typescript
// New table: character_relations
interface CharacterRelation {
  id: string;
  fromId: string;              // Character A
  toId: string;                // Character B
  type: RelationType;          // friend | rival | mentor | lover | family | ally | enemy
  label: string;               // Custom description, e.g. "表兄妹", "青梅竹马"
  strength: number;            // 0-1, closeness
  bidirectional: boolean;
  createdAt: number;
  updatedAt: number;
}

type RelationType = "friend" | "rival" | "mentor" | "lover" | "family" | "ally" | "enemy";

// Extended on existing Character type
interface CharacterPersonality {
  traits: PersonalityTrait[];          // Dimensional traits (introvert/extrovert, rational/emotional, etc.)
  speechStyle: string;                 // Dialogue style description for prompt injection
  emotionalState: EmotionalState;      // Current emotional state
  arc?: CharacterArc;                  // Cross-episode arc (series-scoped)
}

interface PersonalityTrait {
  dimension: string;     // e.g. "openness", "assertiveness"
  value: number;         // -1 to 1 spectrum
  label: string;         // Human-readable, e.g. "内向偏多"
}

interface EmotionalState {
  primary: string;       // e.g. "melancholy", "determined"
  intensity: number;     // 0-1
  trigger?: string;      // What caused this state
}

interface CharacterArc {
  seriesId: string;
  startState: string;          // e.g. "天真少年"
  endState?: string;           // e.g. "成熟领袖"
  currentState?: string;       // Derived from latest episode
  turningPoints: {
    episodeNumber: number;
    event: string;
    stateAfter: string;
  }[];
}

// Relation evolution tracking (for series timeline)
interface RelationEvent {
  episodeNumber: number;
  change: string;              // e.g. "从对手变为盟友"
  newStrength: number;
  newType?: RelationType;
}
```

### 3.2 SQLite Migration

New table `character_relations`:
```sql
CREATE TABLE IF NOT EXISTS character_relations (
  id TEXT PRIMARY KEY,
  from_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  to_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  label TEXT DEFAULT '',
  strength REAL DEFAULT 0.5,
  bidirectional INTEGER DEFAULT 1,
  evolution TEXT DEFAULT '[]',  -- JSON array of RelationEvent
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_relations_from ON character_relations(from_id);
CREATE INDEX IF NOT EXISTS idx_relations_to ON character_relations(to_id);
```

Existing `characters` table gains a `personality` TEXT column (JSON-serialized `CharacterPersonality`).

### 3.3 Relationship Graph UI (Obsidian-style)

**Technology**: `d3-force` force-directed graph

**Components**:
- `CharacterRelationGraph` — Main canvas, renders force-directed layout
- `RelationEdge` — Line between nodes, color = relation type, width = strength
- `CharacterNode` — Avatar circle + name label
- `RelationDetailPanel` — Slide-out panel on edge/node click, shows relation details + edit
- `RelationTimelineSlider` — For series mode: scrub through episodes to see relationship evolution

**Interactions**:
- Click node: highlight connected edges and neighbors, dim others
- Click edge: show relation detail panel
- Drag nodes: reposition (d3 force simulation pauses)
- Zoom/pan: standard d3-zoom
- Filter bar: toggle relation types on/off
- Add relation: drag from one node to another, opens creation dialog
- Series timeline: slider at bottom, moving it filters relation state to that episode

**Color scheme** (relation types):
- friend: blue, rival: red, mentor: gold, lover: pink, family: green, ally: teal, enemy: dark red

**Layout**:
- Standalone page: `/characters/relations` (full-screen graph)
- Inline widget: Collapsible panel in character detail dialog

### 3.4 Pipeline Integration — Multi-Character Orchestration

Current state: `taskLifecycle.ts:580` takes only `characterIds[0]`.

New behavior:
1. Accept full `characterIds[]` array, load all characters with their relations
2. Build a **character context block** for prompt injection:
   - Each character: name, appearance, personality traits, speech style, emotional state
   - Relationships between characters in this task
   - If series: current arc state, previous episode recap
3. Panel assignment: After script generation, a post-processing step annotates each panel with `appearingCharacters: string[]` based on scene content matching
4. Image prompt construction: For each panel, inject appearance descriptions only for characters appearing in that panel, plus relationship dynamics if multiple characters interact

**Prompt template addition** (injected into all content type handlers):
```
CHARACTERS IN THIS STORY:
{{#each characters}}
- {{name}}: {{appearance}}. Personality: {{personalityDesc}}. Speech style: {{speechStyle}}.
{{/each}}

CHARACTER RELATIONSHIPS:
{{#each relations}}
- {{fromName}} and {{toName}}: {{label}} ({{type}})
{{/each}}

{{#if seriesContext}}
STORY CONTINUITY:
- Episode {{episodeNumber}} of "{{seriesTitle}}"
- {{previousRecap}}
- Character development since last episode: {{arcUpdates}}
{{/if}}
```

---

## 4. Workstream 3 — UX Improvements

### 4.1 Result Page — Progressive Disclosure

**Current problem**: QualityScorePanel (906 lines), AccuracySummary, VLM diagnosis, script validation, pipeline summary all rendered flat. Information overload.

**New layout**:

```
+--------------------------------------------------+
|  [Comic Panels Grid — primary focus area]        |
|                                                  |
+--------------------------------------------------+
|  Overall Score: 8.2/10  [●●●●●●●●○○]           |
|  ⚠ 2 accuracy issues  · ✓ VLM passed            |
+--------------------------------------------------+
|  [Quality] [Accuracy] [VLM Diagnosis] [Script]   |  <- Tab bar
|  ┌──────────────────────────────────────────┐    |
|  │  (Selected tab content, lazy-loaded)     │    |
|  └──────────────────────────────────────────┘    |
+--------------------------------------------------+
|  [Export ▼] [Share] [Edit Script] [Regenerate]   |  <- Sticky bottom bar
+--------------------------------------------------+
```

**Rules**:
- Tabs with issues show a red badge count
- Tabs with no data are hidden (e.g., no accuracy tab in fast mode)
- Default tab: none expanded (comic panels fill viewport)
- Overall score is a weighted composite: `qualityScore * 0.4 + accuracyScore * 0.3 + vlmScore * 0.3` (each normalized to 0-10). If a component is missing (e.g., fast mode skips accuracy), remaining weights redistribute proportionally
- Sticky bottom action bar replaces scattered action buttons

### 4.2 WYSIWYG Script Editor

Replaces the current `script_ready` review experience.

**Layout**: Two-column
- Left: Panel card list (sortable via drag-and-drop)
- Right: Live preview (comic layout simulation)

**Per-panel card**:
```
+------------------------------------------+
| Panel 3 of 8                    [⋮] [×]  |
|------------------------------------------|
| Scene: [editable textarea]               |
| Dialogue: [editable textarea]            |
| Image Prompt: [editable, with assist ▼]  |
| Characters: [Tag1] [Tag2] [+ Add]        |
| Style Override: [dropdown, optional]      |
+------------------------------------------+
```

**Features**:
- Drag-and-drop reorder panels
- Add/delete/duplicate panels
- "Assist" dropdown on image prompt: apply style modifier, add composition hint, enhance with character details
- Undo/redo (leverage existing `useUndoRedo` hook)
- "Reset to original" per panel — reverts to LLM-generated version
- Character tags auto-populated from panel content analysis, editable

**Implementation note**: Build on top of existing `ScriptReadyBar` component, which currently handles the script_ready state. The new editor replaces its inline display.

### 4.3 Gallery Upgrade

**New features**:
- **Favorites**: Heart icon on each card, persisted to IndexedDB, filterable
- **Tags**: User-defined tags per task (stored in `tasks` table, new `tags TEXT` column)
- **Multi-view layouts**:
  - Grid (current, default)
  - Timeline (vertical scroll, grouped by date)
  - Series view (grouped by series, episodes in order)
- **Enhanced filters**: Content type + style + tags + date range + favorites-only, combinable
- **Search**: Fuzzy search across topic, title, tags

**Data changes**: Add `tags TEXT DEFAULT '[]'` and `favorited INTEGER DEFAULT 0` columns to `tasks` table.

---

## 5. Workstream 4 — Pipeline Enhancements

### 5.1 Topic Recommendations ("Inspiration Square")

A new section on the create page, above the content type forms.

**Sources by content type**:
- Science: Curated topic list in `src/lib/config/topicPresets.ts` (solar system, DNA, quantum mechanics, plate tectonics, etc. — 50+ topics grouped by domain)
- Wikipedia: Fetch trending/featured articles from Wikipedia REST API
- Poetry: Categorized by dynasty/poet/mood, drawn from preset list
- Novel: Genre-based templates (wuxia, sci-fi, romance, mystery)
- Xiaohongshu: Trending lifestyle categories

**UI**: Horizontally scrollable chip/pill list. Click to populate the topic field. "Refresh" button for Wikipedia trending.

**No user history analysis in v1** — defer to Phase 4. Keep it simple with curated presets first.

### 5.2 Pipeline Observability

**Current state**: Single progress indicator during generation.

**New design**: Expandable pipeline timeline in result page (visible during generation and after completion).

```
[Research ✓ 2.1s] → [Director ✓ 1.8s] → [Script ✓ 4.2s] → [Validate ✓ 0.1s] → [Images ◉ 3/8...] → [VLM] → [Score]
```

**Per-stage details** (expandable):
- Duration
- Token usage (for LLM stages)
- Retry count
- Error message (if failed)
- "Retry this stage" button (for failed stages — requires `taskLifecycle` to support stage-level restart)

**Data**: Add `pipelineTrace: PipelineStageTrace[]` to `GenerateTask` type.

```typescript
interface PipelineStageTrace {
  stage: string;           // "research" | "director" | "script" | "validate" | "repair" | "images" | "vlm" | "quality"
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  startedAt?: number;
  completedAt?: number;
  tokenUsage?: { prompt: number; completion: number };
  retryCount: number;
  error?: string;
}
```

**Stage-level restart**: When a user clicks "Retry this stage", the pipeline resumes from that stage using the existing task state. This requires `taskLifecycle` phase functions to be independently callable — which aligns with the Workstream 1 split into `phases/*.ts` modules.

---

## 6. Iteration Plan

### Phase 1 — Foundation (Architecture + Result Page)

- Split `taskLifecycle.ts` into phase modules
- Split `characters/page.tsx` into components
- Add tests for `llm.ts` and `series.ts`
- Implement result page progressive disclosure (tab layout + composite score)

### Phase 2 — Character System Core

- Character relation data model + SQLite migration
- Character personality model (traits, speech style, emotional state)
- Relationship graph UI with d3-force
- Multi-character prompt orchestration in pipeline
- Split `downloadUtils.ts` and `llm.ts`

### Phase 3 — Editor + Gallery + Topics

- WYSIWYG script editor (two-column, drag-and-drop)
- Gallery: favorites, tags, multi-view, enhanced search
- Topic recommendation presets ("Inspiration Square")
- Add tests for `exportImport.ts` and `imageGen/index.ts`

### Phase 4 — Depth + Observability

- Character arc tracking for series
- Relation evolution timeline (series mode)
- Pipeline observability (stage trace, per-stage retry)
- Split `QualityScorePanel.tsx`
- Add tests for remaining modules (`utils`, `shareCard`, `quizGenerator`, `relatedTopics`, `aiEditor`)

---

## 7. Out of Scope

- Video/animation export (Seedance integration exists but is export-only, not enhanced)
- Real-time collaboration / multi-user
- i18n beyond zh-CN UI + en prompts
- Mobile-native app
- User history-based topic recommendations (deferred to future)
