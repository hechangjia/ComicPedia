# Science/Wikipedia Narrative Beat Plan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a lightweight director-layer beat plan for `science` and `wikipedia` generation so scripts gain stronger hooks, clearer progression, and less repeated panel function without replacing the existing generation pipeline.

**Architecture:** Reuse the existing `src/lib/director.ts` insertion point instead of inventing a second planning subsystem. Evolve the current `NarrativeOutline` into a beat-plan-capable structure, thread it through `taskLifecycle -> llm/contentRegistry -> science/wikipedia prompts`, then extend `scriptValidator` and `scriptRepair` so the new rhythm rules are enforced locally and can be repaired without rewriting the whole pipeline.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, better-sqlite3 metadata persistence, Vitest

---

## What already exists and must be reused

- `src/lib/director.ts`
  - Existing director-outline generation, parsing, and prompt-guidance helper.
- `src/lib/client/taskLifecycle.ts`
  - Existing scripting flow that already calls `generateNarrativeOutline()` in `standard`/`fine` quality.
- `src/lib/llm.ts`
  - Existing script generation entrypoints that route prompt building through `contentRegistry`.
- `src/lib/contentRegistry.ts`
  - Existing `science` / `wikipedia` prompt builder routing.
- `src/prompts/scriptGenerator.ts`
  - Existing science prompt template.
- `src/prompts/wikipediaGenerator.ts`
  - Existing wikipedia prompt template.
- `src/lib/scriptValidator.ts`
  - Existing structural/script quality checks.
- `src/lib/scriptRepair.ts`
  - Existing warning-driven local repair loop.
- `src/lib/server/db.ts`
  - Existing metadata persistence for `narrativeOutline`.
- `src/app/result/[id]/page.tsx`
  - Existing debug/inspection surface for `narrativeOutline`.
- `src/components/result/PipelineSummary.tsx`
  - Existing summary surface that already references `narrativeOutline`.

## Scope guardrails

- Only `science` and `wikipedia` are in scope.
- Do **not** redesign all content types.
- Do **not** ship a visible pacing selector in this slice.
- Do **not** redesign provider/model configuration.
- Do **not** redesign export or sharing.
- Do **not** create a brand-new DB table for beat plans.

## File scope

### Create
- `src/__tests__/PipelineSummary.test.tsx`

### Modify
- `src/lib/types.ts`
- `src/lib/director.ts`
- `src/lib/llm.ts`
- `src/lib/contentRegistry.ts`
- `src/lib/client/taskLifecycle.ts`
- `src/lib/scriptValidator.ts`
- `src/lib/scriptRepair.ts`
- `src/lib/server/db.ts`
- `src/prompts/scriptGenerator.ts`
- `src/prompts/wikipediaGenerator.ts`
- `src/components/result/PipelineSummary.tsx`
- `src/app/result/[id]/page.tsx`
- `src/__tests__/director.test.ts`
- `src/__tests__/scriptValidator.test.ts`
- `src/__tests__/scriptRepair.test.ts`
- `src/__tests__/taskLifecycle.test.ts`
- `src/__tests__/contentRegistry.test.ts`

---

## Task 1: Evolve the director data model into a beat-plan-capable structure

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/director.ts`
- Modify: `src/__tests__/director.test.ts`

- [ ] **Step 1: Write failing unit tests for beat-plan parsing and guidance**

Add tests in `src/__tests__/director.test.ts` for:
- parsing a `science`/`wikipedia` plan that contains `templateType`, `beatRole`, `knowledgeGoal`, `shotIntent`, `intensity`, `carryForward`
- preserving the legacy fields already used by the result page (`narrativeArc`, `infoDistribution`, `suggestedComposition`)
- generating prompt guidance that includes the new beat/shot constraints

Suggested test shape:

```ts
it("builds guidance with beat roles and shot intents", () => {
  const guidance = buildOutlineGuidance(makeOutline({
    templateType: "mechanism",
    panels: [{
      narrativeFunction: "opening",
      beatRole: "hook",
      suggestedComposition: "close-up",
      shotIntent: "hook-closeup",
      keyInfo: "用反常识现象引出问题",
      knowledgeGoal: "读者先感到疑惑",
      infoDensity: "low",
      intensity: "high",
      carryForward: "为什么会这样",
      characters: [],
    }],
  }));

  expect(guidance).toContain("hook");
  expect(guidance).toContain("hook-closeup");
});
```

- [ ] **Step 2: Run the director tests and verify they fail for missing fields**

Run:

```bash
pnpm vitest run src/__tests__/director.test.ts
```

Expected: FAIL because the new beat-plan fields/types are not implemented yet.

- [ ] **Step 3: Extend `src/lib/types.ts` with beat-plan fields**

Add small, explicit types near `NarrativeOutline`:

```ts
export type NarrativeTemplateType = "mechanism" | "mythic" | "historical" | "discovery";
export type NarrativeBeatRole = "hook" | "conflict" | "reveal" | "progression" | "closure";
export type NarrativeShotIntent = "establish" | "hook-closeup" | "contrast" | "process" | "reveal" | "aftermath";
export type NarrativeIntensity = "low" | "medium" | "high";
```

Extend `NarrativeOutline.panels[*]` to carry:
- `beatRole`
- `knowledgeGoal`
- `shotIntent`
- `intensity`
- `carryForward`

Extend `NarrativeOutline` itself to carry:
- `templateType`
- `source?: "legacy" | "beat-plan"`

Rules:
- Keep `narrativeFunction`, `suggestedComposition`, `keyInfo`, and `infoDensity` for compatibility with existing UI and image-enhancement code.
- Do not introduce a second parallel persisted type if `NarrativeOutline` can safely evolve.

- [ ] **Step 4: Upgrade `src/lib/director.ts` to generate and parse beat-plan-aware outlines**

Change the director prompt so `science` and `wikipedia` specifically ask for:
- one of the four internal templates
- panel-level beat roles
- panel-level shot intents
- knowledge goals
- carry-forward suspense/questions

Keep current behavior for other content types conservative; this slice only needs strong behavior for `science`/`wikipedia`.

Implementation rules:
- introduce a small internal helper such as `inferNarrativeTemplate(contentType, topic, researchContext)`
- make panel-count adaptation explicit in the prompt (5-panel conceptual baseline, compress/expand middle beats only)
- keep `buildOutlineGuidance()` backward-compatible with current `taskLifecycle` injection

- [ ] **Step 5: Run director tests until they pass**

Run:

```bash
pnpm vitest run src/__tests__/director.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit the director model slice**

```bash
git add src/lib/types.ts src/lib/director.ts src/__tests__/director.test.ts
git commit -m "feat: extend director outline with beat plan fields"
```

---

## Task 2: Persist and thread beat-plan metadata through the scripting lifecycle

**Files:**
- Modify: `src/lib/server/db.ts`
- Modify: `src/lib/client/taskLifecycle.ts`
- Modify: `src/__tests__/taskLifecycle.test.ts`

- [ ] **Step 1: Add failing lifecycle tests for science/wikipedia beat-plan persistence**

Extend `src/__tests__/taskLifecycle.test.ts` to cover:
- `science` generation stores a beat-plan-capable `task.narrativeOutline`
- fallback still succeeds when director generation fails
- non-`science`/`wikipedia` requests do not accidentally require the new beat-plan shape

Suggested test shape:

```ts
it("stores director beat plan on science scripting tasks", async () => {
  generateNarrativeOutlineMock.mockResolvedValue(makeOutlineWithBeatPlan());
  generateScriptStreamMock.mockResolvedValue(makeScript());

  const taskId = await startGeneration(makeScienceRequest());
  await flushAllAsyncWork();

  const task = await getTask(taskId);
  expect(task?.narrativeOutline?.templateType).toBe("mechanism");
  expect(task?.narrativeOutline?.panels[0].shotIntent).toBe("hook-closeup");
});
```

- [ ] **Step 2: Run the lifecycle tests and verify failure**

Run:

```bash
pnpm vitest run src/__tests__/taskLifecycle.test.ts
```

Expected: FAIL because the new outline fields are not threaded/persisted yet.

- [ ] **Step 3: Persist the evolved outline in `src/lib/server/db.ts`**

Ensure the new `NarrativeOutline` shape round-trips through `tasks.metadata`.

Rules:
- keep using metadata; do not create a new table
- treat outline persistence as a compact task-level debug surface
- preserve compatibility with old tasks that may have a smaller outline payload

- [ ] **Step 4: Update `taskLifecycle.ts` to use the enhanced director layer without widening scope**

In `processScripting()`:
- keep the existing director call site
- only treat the enhanced beat plan as required for `science` / `wikipedia`
- preserve non-fatal fallback to legacy scripting when the director call fails
- keep storing `task.narrativeOutline` so current result/debug surfaces still work

In regeneration paths:
- make sure regenerated `science`/`wikipedia` scripts refresh the outline rather than reusing stale beat metadata blindly

- [ ] **Step 5: Re-run lifecycle tests until they pass**

Run:

```bash
pnpm vitest run src/__tests__/taskLifecycle.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit the lifecycle threading slice**

```bash
git add src/lib/server/db.ts src/lib/client/taskLifecycle.ts src/__tests__/taskLifecycle.test.ts
git commit -m "feat: persist narrative beat plan in task lifecycle"
```

---

## Task 3: Thread the beat plan into science and wikipedia prompt building

**Files:**
- Modify: `src/lib/llm.ts`
- Modify: `src/lib/contentRegistry.ts`
- Modify: `src/prompts/scriptGenerator.ts`
- Modify: `src/prompts/wikipediaGenerator.ts`
- Modify: `src/__tests__/contentRegistry.test.ts`

- [ ] **Step 1: Add failing prompt-routing tests**

Extend `src/__tests__/contentRegistry.test.ts` to cover:
- `science` handler includes beat-plan guidance when provided
- `wikipedia` handler includes beat-plan guidance when provided
- `wikipedia` still falls back safely when no article content is present

Suggested test shape:

```ts
it("science handler includes narrative beat plan guidance", () => {
  const handler = getContentHandler("science");
  const prompt = handler.buildPrompt({
    topic: "为什么会打雷",
    style: "flat",
    narrativeOutline: makeOutlineWithBeatPlan(),
  });

  expect(prompt).toContain("hook-closeup");
  expect(prompt).toContain("knowledgeGoal");
});
```

- [ ] **Step 2: Run the content-registry tests and verify failure**

Run:

```bash
pnpm vitest run src/__tests__/contentRegistry.test.ts
```

Expected: FAIL because `ScriptGenerationParams` and prompt builders do not accept the beat plan yet.

- [ ] **Step 3: Add beat-plan plumbing to `contentRegistry` and `llm`**

Update `ScriptGenerationParams` in `src/lib/contentRegistry.ts` to include:

```ts
narrativeOutline?: NarrativeOutline;
```

Update both `generateScript()` and `generateScriptStream()` in `src/lib/llm.ts` to pass the optional outline through the content handler.

Rules:
- do not widen unrelated content types unless they already accept the shared params object
- keep signatures stable enough that existing callers stay understandable

- [ ] **Step 4: Upgrade the science prompt to consume beat-plan guidance**

In `src/prompts/scriptGenerator.ts`:
- add an optional `narrativeOutline?: NarrativeOutline`
- insert a dedicated “Narrative Beat Plan” section when provided
- explicitly tell the model to obey per-panel `beatRole`, `knowledgeGoal`, `shotIntent`, and anti-monotony constraints
- reinforce that `science` cannot devolve into repeated lecturer panels

Rules:
- preserve the current guide-character logic
- preserve the existing science-specific knowledge-density constraints
- keep imagePrompt language constraints untouched

- [ ] **Step 5: Upgrade the wikipedia prompt to consume beat-plan guidance**

In `src/prompts/wikipediaGenerator.ts`:
- add the same optional `narrativeOutline?: NarrativeOutline`
- inject the template type and panel beat guidance into the prompt
- preserve the current accuracy and information-source constraints
- keep “no generic guide character when disabled” logic intact

- [ ] **Step 6: Re-run the routing tests until they pass**

Run:

```bash
pnpm vitest run src/__tests__/contentRegistry.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit the prompt-routing slice**

```bash
git add src/lib/llm.ts src/lib/contentRegistry.ts src/prompts/scriptGenerator.ts src/prompts/wikipediaGenerator.ts src/__tests__/contentRegistry.test.ts
git commit -m "feat: inject narrative beat plans into science and wikipedia prompts"
```

---

## Task 4: Add rhythm-aware validation rules for science and wikipedia scripts

**Files:**
- Modify: `src/__tests__/scriptValidator.test.ts`
- Modify: `src/lib/scriptValidator.ts`
- Modify: `src/lib/client/taskLifecycle.ts`

- [ ] **Step 1: Write failing validator tests for the new rhythm warnings**

Create `src/__tests__/scriptValidator.test.ts` covering:
- missing hook on panel 1-2
- repeated beat/panel function
- repeated shot language
- information overload in a single panel
- missing required strong shot variation anywhere in the comic (no `hook-closeup` and no `contrast`)
- invalid ending rhythm when the final panel is not `reveal` or `aftermath`
- no false positives for non-`science`/`wikipedia` scripts without beat metadata

Suggested test shape:

```ts
it("warns when science script opens with flat explanation panels", () => {
  const validation = validateScript(makeScienceScript({
    panels: [
      makePanel({ dialogue: "雷电是一种自然现象", imagePrompt: "teacher explaining at blackboard" }),
      makePanel({ dialogue: "它由云层放电形成", imagePrompt: "teacher explaining at podium" }),
    ],
  }), {
    contentType: "science",
    narrativeOutline: makeOutlineWithBeatPlan(),
  });

  expect(validation.warnings.some((w) => w.dimension === "rhythm-hook")).toBe(true);
});
```

- [ ] **Step 2: Run the validator tests and verify failure**

Run:

```bash
pnpm vitest run src/__tests__/scriptValidator.test.ts
```

Expected: FAIL because `validateScript()` does not yet understand rhythm-specific inputs.

- [ ] **Step 3: Extend `validateScript()` with optional generation context**

Change `validateScript()` to accept an optional context object such as:

```ts
validateScript(script, { contentType, narrativeOutline })
```

Use this context only for `science` and `wikipedia`.

Add focused checks:
- `rhythm-hook`: panels 1-2 fail to create a meaningful opening pull
- `rhythm-role-repetition`: adjacent panels serve the same narrative function
- `rhythm-shot-repetition`: adjacent panels repeat the same shot intent or equivalent composition purpose
- `rhythm-info-overload`: one panel carries too many major knowledge payloads at once
- `rhythm-missing-strong-shot`: the comic never uses a required `hook-closeup` or `contrast` beat anywhere
- `rhythm-ending-flat`: the final panel is not a `reveal` or `aftermath` style ending when beat metadata is available

Rules:
- keep existing checks intact
- encode the spec’s “hard anti-monotony” rules directly in validation for `science` / `wikipedia`
- only enforce `rhythm-ending-flat` when `narrativeOutline` / beat metadata is present; legacy no-outline runs should not fail this rule
- do not turn every rhythm issue into `critical`; most should start as `warning`

- [ ] **Step 4: Thread the validator context into `taskLifecycle.ts`**

Update both validation calls in `processScripting()` so they pass:
- `request.contentType`
- `task.narrativeOutline`

This keeps the new rhythm checks scoped to the intended content types.

- [ ] **Step 5: Re-run validator tests until they pass**

Run:

```bash
pnpm vitest run src/__tests__/scriptValidator.test.ts src/__tests__/taskLifecycle.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit the validation slice**

```bash
git add src/lib/scriptValidator.ts src/lib/client/taskLifecycle.ts src/__tests__/scriptValidator.test.ts src/__tests__/taskLifecycle.test.ts
git commit -m "feat: add rhythm-aware script validation"
```

---

## Task 5: Make script repair honor the new rhythm warnings locally

**Files:**
- Modify: `src/__tests__/scriptRepair.test.ts`
- Modify: `src/lib/scriptRepair.ts`
- Modify: `src/lib/client/taskLifecycle.ts`

- [ ] **Step 1: Write failing repair tests for local rhythm fixes**

Create `src/__tests__/scriptRepair.test.ts` covering:
- hook-related warning rewrites only the affected opening panels
- repeated-role warning preserves panel count and unaffected panels
- missing-strong-shot warning can be repaired without replacing unaffected middle panels
- flat-ending warning rewrites the final panel instead of forcing a whole-script rewrite
- beat-plan context can be included in repair instructions without forcing a whole-script rewrite

Suggested test shape:

```ts
it("preserves unaffected panels during rhythm repair", async () => {
  callLLMMock.mockResolvedValue(JSON.stringify({
    title: "雷电",
    topic: "雷电",
    style: "flat",
    panels: [
      { id: 1, scene: "新开场", dialogue: "新钩子", imagePrompt: "new hook" },
      { id: 2, scene: "保留", dialogue: "保留", imagePrompt: "keep" },
    ],
  }));

  const repaired = await repairScript(script, warnings, llmConfig, {
    contentType: "science",
    narrativeOutline: makeOutlineWithBeatPlan(),
  });

  expect(repaired?.panels[1].dialogue).toBe(script.panels[1].dialogue);
});
```

- [ ] **Step 2: Run the repair tests and verify failure**

Run:

```bash
pnpm vitest run src/__tests__/scriptRepair.test.ts
```

Expected: FAIL because `repairScript()` does not yet carry rhythm context or precedence rules.

- [ ] **Step 3: Extend `repairScript()` with optional rhythm context**

Update `repairScript()` so its prompt can include:
- the relevant beat-plan excerpt
- explicit precedence: fix validator findings first, but preserve the higher-level template intent where possible
- instruction to rewrite only the affected panels when warnings are localized

Do not create a separate repair subsystem. Reuse the existing warning-based loop.

- [ ] **Step 4: Keep `taskLifecycle.ts` repair loop local and bounded**

When calling `repairScript()` from `processScripting()`:
- pass `request.contentType`
- pass `task.narrativeOutline`
- keep the existing max-two-round bounded repair loop
- preserve current non-fatal behavior if repair fails

- [ ] **Step 5: Re-run repair tests until they pass**

Run:

```bash
pnpm vitest run src/__tests__/scriptRepair.test.ts src/__tests__/taskLifecycle.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit the repair slice**

```bash
git add src/lib/scriptRepair.ts src/lib/client/taskLifecycle.ts src/__tests__/scriptRepair.test.ts src/__tests__/taskLifecycle.test.ts
git commit -m "feat: repair rhythm issues using beat plan context"
```

---

## Task 6: Keep the existing result/debug surfaces useful with the richer outline

**Files:**
- Create: `src/__tests__/PipelineSummary.test.tsx`
- Modify: `src/components/result/PipelineSummary.tsx`
- Modify: `src/app/result/[id]/page.tsx`

- [ ] **Step 1: Add a failing UI assertion for richer outline summaries**

If these surfaces already have tests, extend them. If not, add a focused assertion where the repo already tests result-page summary behavior.

At minimum, verify:
- the richer outline does not break rendering
- template type / beat summary can be shown when available
- old tasks without beat fields still render safely

If no dedicated component tests exist yet, write a minimal unit test colocated with the closest existing surface test file.
Prefer `src/__tests__/PipelineSummary.test.tsx` for the summary surface instead of inventing a new broad result-page test harness in this slice.

- [ ] **Step 2: Run the relevant UI tests and verify failure (or confirm no test exists yet)**

Run whichever file you create or extend. Example:

```bash
pnpm vitest run src/__tests__/PipelineSummary.test.tsx
```

Expected: FAIL if a new assertion was added; otherwise document that the slice is covered by smoke validation only.

- [ ] **Step 3: Update the summary/debug surfaces conservatively**

In `src/components/result/PipelineSummary.tsx` and `src/app/result/[id]/page.tsx`:
- keep the current outline display
- add safe rendering for `templateType`, `beatRole`, or `shotIntent` if present
- do not redesign the page
- avoid making the richer outline mandatory for rendering

Rules:
- this is an observability/debug surface, not a new product workflow
- keep the UI read-only in this slice

- [ ] **Step 4: Re-run the relevant UI tests**

Run:

```bash
pnpm vitest run src/__tests__/PipelineSummary.test.tsx
```

Expected: PASS, or note in the implementation PR that this slice was covered by manual smoke validation instead if no test file was introduced.

- [ ] **Step 5: Commit the observability slice**

```bash
git add src/components/result/PipelineSummary.tsx src/app/result/[id]/page.tsx
git commit -m "feat: surface richer narrative beat metadata"
```

---

## Task 7: Final verification and docs touch-up

**Files:**
- Modify: `docs/ai/handoff.md`
- Modify: any touched docs only if behavior/config changed materially during implementation

- [ ] **Step 1: Run the focused test suite for all touched areas**

Run:

```bash
pnpm vitest run \
  src/__tests__/director.test.ts \
  src/__tests__/contentRegistry.test.ts \
  src/__tests__/taskLifecycle.test.ts \
  src/__tests__/scriptValidator.test.ts \
  src/__tests__/scriptRepair.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run type-check / production safety verification**

Run:

```bash
pnpm exec tsc --noEmit
pnpm build
```

Expected: PASS.

- [ ] **Step 3: Perform manual smoke checks on representative topics**

Run the app and verify at least:
- a `science` topic such as “为什么会打雷”
- a `wikipedia` topic such as “女娲” or “DNA”

Check:
- `task.narrativeOutline` is present for `science`/`wikipedia`
- panel opening is less flat than before
- repeated “lecturer panel” sequences are reduced
- generation still reaches `script_ready`
- existing result/debug surfaces still render

- [ ] **Step 4: Update handoff notes**

Append or refresh `docs/ai/handoff.md` with:
- what was implemented
- what files changed
- what tests passed
- what follow-ups remain deferred (accuracy loop, provider redesign, visible pacing selector)

- [ ] **Step 5: Commit final verification/docs**

```bash
git add docs/ai/handoff.md
git commit -m "docs: record narrative beat plan verification"
```

---

## Suggested execution order

1. Task 1 — director model
2. Task 2 — lifecycle persistence and threading
3. Task 3 — prompt routing and prompt templates
4. Task 4 — validator rules
5. Task 5 — repair rules
6. Task 6 — observability surfaces
7. Task 7 — verification and handoff

## Notes for the implementing agent

- Prefer reusing `NarrativeOutline` rather than introducing a second overlapping persisted type, unless the code proves that evolution is too messy.
- Keep the slice tightly scoped to `science` and `wikipedia`.
- Treat visible pacing selection as deferred unless it is genuinely almost free.
- The external prompt files under `/home/chia/Downloads/提示词/` are development-time references only. Extract reusable rules into repo-owned code/prompt assets before shipping.
