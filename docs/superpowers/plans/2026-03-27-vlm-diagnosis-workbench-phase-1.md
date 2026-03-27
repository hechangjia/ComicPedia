# VLM Diagnosis Workbench Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the first usable VLM diagnosis workbench on the result page so users can see which panels to fix, why the system thinks they are problematic, how trustworthy each diagnosis is, and what prompt change is recommended, without enabling automatic prompt application yet.

**Architecture:** Reuse the current `visualQualityScore` score pass as the fast triage layer and add a second persisted diagnosis artifact for suspicious panels only. Keep the new diagnosis pass manual and result-page driven in phase 1, persist its state alongside existing review metadata, and render it through dedicated diagnosis UI components embedded under the existing `QualityScorePanel`.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, better-sqlite3 metadata persistence, Vitest

---

## What already exists and must be reused

- `src/lib/vlmScorer.ts`
  - Current VLM score pass for panel scoring, cross-panel scoring, and character scoring.
- `src/lib/vlmRetry.ts`
  - Current rule-based prompt-patch fallback and panel review projection logic.
- `src/components/result/QualityScorePanel.tsx`
  - Current result-page VLM score entry point and retry UI.
- `src/app/result/[id]/page.tsx`
  - Current result page wiring and task action plumbing.
- `src/hooks/useTaskActions.ts`
  - Current persistence callbacks for score-saving and result-page mutations.
- `src/lib/types.ts`
  - Current persisted task and VLM data model.
- `src/lib/server/db.ts`
  - Current `tasks.metadata` persistence extension point.
- `src/__tests__/vlmRetry.test.ts`
  - Current regression coverage for panel review projection and retry heuristics.
- `src/__tests__/serverDbReviewPersistence.test.ts`
  - Current metadata round-trip coverage for visual review state.

## Scope guardrails

- This plan covers **Phase 1 only** from the approved spec:
  - problem-panel triage
  - audit cards
  - trust labels
  - prompt diff view
  - diagnosis persistence and stale handling
- Do **not** enable `apply patch` / `apply rewrite` execution in this plan.
- Do **not** replace the existing rule-based retry path yet.
- Do **not** add automatic diagnosis triggering inside `taskLifecycle` in this phase.
- Do **not** redesign character review in this slice.
- Do **not** expand into provider/model routing in this slice.

## File scope

### Create
- `src/lib/vlmDiagnosis.ts`
  - Diagnosis-pass prompt builder, VLM call wrapper, response parsing, trust/actionability mapping, summary derivation.
- `src/lib/vlmDiagnosisState.ts`
  - Pure helpers for diagnosis lifecycle state, freshness, and invalidation.
- `src/components/result/VisualDiagnosisWorkbench.tsx`
  - Workbench shell for summary strip, prioritized panel list, and expanded audit-card area.
- `src/components/result/VisualDiagnosisAuditCard.tsx`
  - Per-panel audit card UI for issue evidence, trust labels, and repair recommendation display.
- `src/components/result/VisualDiagnosisPromptDiff.tsx`
  - Compact prompt diff / suggestion renderer.
- `src/__tests__/vlmDiagnosis.test.ts`
- `src/__tests__/vlmDiagnosisState.test.ts`
- `src/__tests__/VisualDiagnosisWorkbench.test.tsx`
- `src/__tests__/useTaskActions.test.ts`

### Modify
- `src/lib/types.ts`
- `src/lib/server/db.ts`
- `src/lib/vlmScorer.ts`
- `src/hooks/useTaskActions.ts`
- `src/components/result/QualityScorePanel.tsx`
- `src/app/result/[id]/page.tsx`
- `src/__tests__/serverDbReviewPersistence.test.ts`

---

## Task 1: Add diagnosis types and metadata persistence

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/server/db.ts`
- Modify: `src/__tests__/serverDbReviewPersistence.test.ts`

- [ ] **Step 1: Extend persistence tests with diagnosis metadata round-trip**

Add a new case to `src/__tests__/serverDbReviewPersistence.test.ts` that writes and reads back:
- `visualDiagnosisReport`
- `visualDiagnosisState`
- `visualDiagnosisStale`
- `lastDiagnosisAt`

Suggested shape:

```ts
expect(roundTripped?.visualDiagnosisState).toBe("succeeded");
expect(roundTripped?.visualDiagnosisStale).toBe(false);
expect(roundTripped?.visualDiagnosisReport?.panels[0].repair.recommendedMode).toBe("rewrite");
```

- [ ] **Step 2: Run the persistence test to confirm the new fields are unsupported**

Run:

```bash
pnpm vitest run src/__tests__/serverDbReviewPersistence.test.ts
```

Expected: FAIL because the new diagnosis fields are not yet defined in `GenerateTask` or persisted through SQLite metadata.

- [ ] **Step 3: Extend `src/lib/types.ts` with the phase-1 diagnosis model**

Add the persisted types:

```ts
export type VisualDiagnosisState = "idle" | "running" | "succeeded" | "failed" | "skipped";
export type VisualDiagnosisConfidence = "low" | "medium" | "high";
export type VisualDiagnosisSeverity = "low" | "medium" | "high";
export type VisualDiagnosisActionability = "apply_directly" | "confirm_first" | "manual_only";
export type VisualRepairMode = "patch" | "rewrite" | "manual";
```

Add interfaces for:
- `VisualDiagnosisReport`
- `VisualDiagnosisSummary`
- `VisualDiagnosisPanel`
- `VisualDiagnosisIssue`
- `VisualRepairSuggestion`

Extend `GenerateTask` with:

```ts
visualDiagnosisReport?: VisualDiagnosisReport;
visualDiagnosisState?: VisualDiagnosisState;
visualDiagnosisStale?: boolean;
lastDiagnosisAt?: string;
```

Rules:
- keep `visualQualityScore`, `panelReview`, `reviewStatus`, and `visualRetrySummary` unchanged
- keep diagnosis payload separate from `VisualQualityScore`
- include `schemaVersion` on `VisualDiagnosisReport`

- [ ] **Step 4: Persist and parse diagnosis fields in `src/lib/server/db.ts`**

Update `taskToRow()` metadata packing to include the new diagnosis fields.

Add parsing/validation helpers similar to the existing visual review helpers, for example:

```ts
function parseVisualDiagnosisState(value: unknown): GenerateTask["visualDiagnosisState"] { ... }
function parseVisualDiagnosisReport(value: unknown): GenerateTask["visualDiagnosisReport"] { ... }
```

Rules:
- invalid diagnosis metadata should fail closed to `undefined`, not crash task loading
- keep diagnosis parsing narrow and defensive
- do not add a new DB table

- [ ] **Step 5: Add one malformed-metadata regression to `src/__tests__/serverDbReviewPersistence.test.ts`**

Add a focused negative case that seeds malformed diagnosis metadata and confirms task loading fails closed to `undefined` diagnosis fields instead of throwing.

Suggested assertion:

```ts
expect(roundTripped?.visualDiagnosisReport).toBeUndefined();
expect(roundTripped?.visualDiagnosisState).toBeUndefined();
```

- [ ] **Step 6: Re-run the diagnosis persistence tests**

Run:

```bash
pnpm vitest run src/__tests__/serverDbReviewPersistence.test.ts
```

Expected: PASS

- [ ] **Step 7: Commit the data-model slice**

```bash
git add src/lib/types.ts src/lib/server/db.ts src/__tests__/serverDbReviewPersistence.test.ts
git commit -m "feat: persist visual diagnosis metadata"
```

---

## Task 2: Implement pure diagnosis parsing, trust mapping, and freshness helpers

**Files:**
- Create: `src/lib/vlmDiagnosis.ts`
- Create: `src/lib/vlmDiagnosisState.ts`
- Create: `src/__tests__/vlmDiagnosis.test.ts`
- Create: `src/__tests__/vlmDiagnosisState.test.ts`

- [ ] **Step 1: Write failing tests for diagnosis parsing and trust derivation**

In `src/__tests__/vlmDiagnosis.test.ts`, add cases for:
- extracting diagnosis JSON from a model response
- mapping evidence specificity to `evidenceStrength`
- mapping trust inputs to:
  - `confidence`
  - `falsePositiveRisk`
  - `actionability`
- deriving `recommendedMode` from issue type
- building a task-level summary from multiple diagnosed panels

Suggested fixture:

```ts
const parsed = parseDiagnosisResponse(0, JSON.stringify({
  issues: [{
    issueType: "composition_mismatch",
    severity: "high",
    evidence: "Main subject is cropped out of frame",
    modelConfidence: "high"
  }],
  repair: {
    recommendedMode: "rewrite",
    suggestedPrompt: "..."
  }
}));
expect(parsed.repair.recommendedMode).toBe("rewrite");
```

- [ ] **Step 2: Add failing tests for freshness/invalidation helpers**

In `src/__tests__/vlmDiagnosisState.test.ts`, add cases for:
- `markDiagnosisRunning()`
- `markDiagnosisSucceeded()`
- `markDiagnosisFailed()`
- `markDiagnosisSkipped()`
- `invalidateDiagnosis()`
- `isDiagnosisPanelStale(panel, diagnosisPanel)`

Required regression case:

```ts
currentPanel.imagePrompt !== diagnosisPanel.promptSnapshot
=> visualDiagnosisStale === true
```

- [ ] **Step 3: Run the new pure-helper tests and confirm they fail**

Run:

```bash
pnpm vitest run src/__tests__/vlmDiagnosis.test.ts src/__tests__/vlmDiagnosisState.test.ts
```

Expected: FAIL because the helper modules do not exist yet.

- [ ] **Step 4: Implement `src/lib/vlmDiagnosisState.ts`**

Add focused helpers:
- `markDiagnosisRunning(task)`
- `markDiagnosisSucceeded(task, report)`
- `markDiagnosisFailed(task, error?)`
- `markDiagnosisSkipped(task)`
- `invalidateDiagnosis(task)`
- `isDiagnosisPanelStale(currentPanel, diagnosisPanel)`
- `deriveDiagnosisStaleness(task)`

Rules:
- `markDiagnosisSucceeded()` sets `visualDiagnosisState = "succeeded"`, `visualDiagnosisStale = false`, and `lastDiagnosisAt = report.generatedAt`
- `invalidateDiagnosis()` preserves the last report but flips `visualDiagnosisStale = true`
- freshness checks must compare both image snapshot and prompt snapshot

- [ ] **Step 5: Implement the pure diagnosis helpers in `src/lib/vlmDiagnosis.ts`**

Add:
- `pickDiagnosisCandidates(visualScore)`
- `buildDiagnosisPrompt(...)`
- `parseDiagnosisResponse(panelIndex, content, context)`
- `deriveIssueTrust(...)`
- `deriveRepairMode(issueType, falsePositiveRisk)`
- `summarizeDiagnosisReport(panels)`

Rules:
- diagnosis issues must emit normalized enums, not arbitrary strings
- issue evidence should be trimmed and capped
- `actionability` must be derived, not trusted blindly from the model
- phase 1 should allow a panel to be marked `uncertain` if parsing is partial

- [ ] **Step 6: Re-run the helper tests**

Run:

```bash
pnpm vitest run src/__tests__/vlmDiagnosis.test.ts src/__tests__/vlmDiagnosisState.test.ts
```

Expected: PASS

- [ ] **Step 7: Commit the helper slice**

```bash
git add src/lib/vlmDiagnosis.ts src/lib/vlmDiagnosisState.ts src/__tests__/vlmDiagnosis.test.ts src/__tests__/vlmDiagnosisState.test.ts
git commit -m "feat: add visual diagnosis helpers"
```

---

## Task 3: Add the manual diagnosis pass on top of current VLM scoring infrastructure

**Files:**
- Modify: `src/lib/vlmScorer.ts`
- Modify: `src/lib/vlmDiagnosis.ts`
- Modify: `src/__tests__/vlmDiagnosis.test.ts`

- [ ] **Step 1: Add failing tests for candidate selection and VLM diagnosis execution**

Extend `src/__tests__/vlmDiagnosis.test.ts` to cover:
- only low-score or cross-panel-flagged panels are chosen automatically
- diagnosis skips panels with missing images
- diagnosis returns `VisualDiagnosisReport` with:
  - `schemaVersion`
  - `generatedAt`
  - `sourceEvaluatedAt`
  - per-panel repair suggestion

Mock `fetch` so the test does not require a live model.

Suggested assertion:

```ts
expect(report.panels.map((panel) => panel.panelIndex)).toEqual([1, 3]);
expect(report.summary.problemPanelCount).toBe(2);
```

- [ ] **Step 2: Run the diagnosis tests to verify the networked helpers are still missing**

Run:

```bash
pnpm vitest run src/__tests__/vlmDiagnosis.test.ts
```

Expected: FAIL because there is no executable `evaluateVisualDiagnosis()` yet.

- [ ] **Step 3: Extract or export the shared image/VLM transport pieces from `src/lib/vlmScorer.ts`**

Do the minimum refactor needed so diagnosis can reuse:
- `resolveImageToBase64()`
- OpenAI/Anthropic multimodal request building
- `/api/llm` forwarding path

Acceptable implementation choices:
- export the current shared helpers from `vlmScorer.ts`, or
- extract them into a small shared helper inside the same file

Do **not** rewrite the score pass logic wholesale.

- [ ] **Step 4: Implement `evaluateVisualDiagnosis()` in `src/lib/vlmDiagnosis.ts`**

Signature target:

```ts
export async function evaluateVisualDiagnosis(
  script: ComicScript,
  visualScore: VisualQualityScore,
  vlmConfig: PartialLLMConfig,
  targetPanels?: number[],
): Promise<VisualDiagnosisReport>
```

Rules:
- use the current score pass as the source of diagnosis candidates
- allow explicit `targetPanels` override for later panel-local use
- include cross-panel issue context when building each diagnosis prompt
- keep diagnosis manual-only in phase 1; do not trigger this from `taskLifecycle`

- [ ] **Step 5: Re-run the diagnosis tests**

Run:

```bash
pnpm vitest run src/__tests__/vlmDiagnosis.test.ts
```

Expected: PASS

- [ ] **Step 6: Commit the diagnosis-pass slice**

```bash
git add src/lib/vlmScorer.ts src/lib/vlmDiagnosis.ts src/__tests__/vlmDiagnosis.test.ts
git commit -m "feat: add manual visual diagnosis pass"
```

---

## Task 4: Wire diagnosis persistence and stale invalidation through result-page actions

**Files:**
- Create: `src/__tests__/useTaskActions.test.ts`
- Modify: `src/hooks/useTaskActions.ts`
- Modify: `src/app/result/[id]/page.tsx`
- Modify: `src/lib/vlmDiagnosisState.ts`

- [ ] **Step 1: Write failing action tests for diagnosis save and invalidation**

Create `src/__tests__/useTaskActions.test.ts` covering:
- saving a diagnosis report persists it and marks diagnosis state succeeded
- editing a panel marks diagnosis stale
- triggering regenerate marks diagnosis stale
- reordering panels marks diagnosis stale
- changing style marks diagnosis stale
- VLM retry marks diagnosis stale

Required regression case:

```ts
save diagnosis
-> handlePanelUpdate(...)
-> latest task has visualDiagnosisStale === true
```

- [ ] **Step 2: Run the action tests and verify they fail**

Run:

```bash
pnpm vitest run src/__tests__/useTaskActions.test.ts
```

Expected: FAIL because `useTaskActions` has no diagnosis save callback or invalidation behavior.

- [ ] **Step 3: Add a diagnosis save callback in `useTaskActions.ts`**

Add:

```ts
const handleSaveVisualDiagnosisReport = useCallback(async (report: VisualDiagnosisReport) => {
  await persistTaskUpdate((task) => {
    markDiagnosisSucceeded(task, report);
  });
}, []);
```

Wire the callback into the returned hook API and into `src/app/result/[id]/page.tsx`.

- [ ] **Step 4: Invalidate diagnosis on content-changing result-page actions**

Use `invalidateDiagnosis(task)` inside the mutation paths for:
- `handlePanelUpdate`
- `handleRegenerate`
- `handleReorder`
- `handleChangeStyle`
- `handleRegenerateScript`
- `handleVlmRetry`

Rules:
- preserve the last report for comparison
- only flip the diagnosis to stale; do not clear it immediately
- keep existing visual-score persistence behavior intact

- [ ] **Step 5: Add a render-time stale guard**

Before rendering diagnosis as “fresh,” combine the persisted stale flag with `deriveDiagnosisStaleness(task)` so missed mutation paths do not silently show stale data as current.

This guard may live in `useTaskActions`, `QualityScorePanel`, or a small helper, but it must be unit-tested.

- [ ] **Step 6: Re-run the action tests**

Run:

```bash
pnpm vitest run src/__tests__/useTaskActions.test.ts
```

Expected: PASS

- [ ] **Step 7: Commit the persistence/invalidation slice**

```bash
git add src/hooks/useTaskActions.ts src/app/result/[id]/page.tsx src/lib/vlmDiagnosisState.ts src/__tests__/useTaskActions.test.ts
git commit -m "feat: persist and invalidate visual diagnosis state"
```

---

## Task 5: Build the read-only diagnosis workbench UI

**Files:**
- Create: `src/components/result/VisualDiagnosisWorkbench.tsx`
- Create: `src/components/result/VisualDiagnosisAuditCard.tsx`
- Create: `src/components/result/VisualDiagnosisPromptDiff.tsx`
- Create: `src/__tests__/VisualDiagnosisWorkbench.test.tsx`
- Modify: `src/components/result/QualityScorePanel.tsx`

- [ ] **Step 1: Write failing component tests for the diagnosis workbench**

Create `src/__tests__/VisualDiagnosisWorkbench.test.tsx` covering:
- summary strip shows:
  - VLM score
  - problem panel count
  - high-severity count
  - cross-panel issue presence
- prioritized problem-panel list sorts by severity first
- audit card shows:
  - issue label
  - trust label
  - false-positive warning
  - recommended mode
  - prompt diff
- stale diagnosis renders a clear stale badge

Suggested expectations:

```tsx
expect(screen.getByText("查看待修复面板")).toBeInTheDocument();
expect(screen.getByText("建议确认后执行")).toBeInTheDocument();
expect(screen.getByText("高误判风险")).toBeInTheDocument();
```

- [ ] **Step 2: Run the component test and confirm the workbench does not exist yet**

Run:

```bash
pnpm vitest run src/__tests__/VisualDiagnosisWorkbench.test.tsx
```

Expected: FAIL because the diagnosis components are missing.

- [ ] **Step 3: Implement the dedicated diagnosis UI components**

`VisualDiagnosisWorkbench.tsx` should render:
- task summary strip
- problem-panel list
- selected panel detail area

`VisualDiagnosisAuditCard.tsx` should render:
- issue evidence
- trust / actionability badges
- repair-mode summary
- expected improvement bullets

`VisualDiagnosisPromptDiff.tsx` should render:
- original prompt snapshot
- suggested prompt
- readable additions/removals

Rules:
- phase 1 is read-only; show recommendation buttons as disabled or informational only
- keep the components presentational and driven by typed props

- [ ] **Step 4: Integrate the workbench into `QualityScorePanel.tsx`**

Update the current VLM section to:
- keep the score-pass summary
- add a `运行深入诊断` action when `visualScore` exists
- show diagnosis state (`idle / running / failed / stale / succeeded`)
- render the new workbench below the current score bars when a report exists

Rules:
- do not remove the existing visual score display
- do not remove the existing retry UI yet
- diagnosis UI should augment, not replace, the current panel score surface

- [ ] **Step 5: Re-run the component tests**

Run:

```bash
pnpm vitest run src/__tests__/VisualDiagnosisWorkbench.test.tsx
```

Expected: PASS

- [ ] **Step 6: Commit the UI slice**

```bash
git add src/components/result/VisualDiagnosisWorkbench.tsx src/components/result/VisualDiagnosisAuditCard.tsx src/components/result/VisualDiagnosisPromptDiff.tsx src/components/result/QualityScorePanel.tsx src/__tests__/VisualDiagnosisWorkbench.test.tsx
git commit -m "feat: add visual diagnosis workbench ui"
```

---

## Task 6: Connect the manual diagnosis trigger and finish phase-1 verification

**Files:**
- Modify: `src/components/result/QualityScorePanel.tsx`
- Modify: `src/app/result/[id]/page.tsx`
- Modify: `src/hooks/useTaskActions.ts`
- Modify: `src/__tests__/vlmDiagnosis.test.ts`
- Modify: `src/__tests__/VisualDiagnosisWorkbench.test.tsx`

- [ ] **Step 1: Write one failing integration-style test for the manual diagnosis trigger**

Extend an existing UI test or add a focused integration test covering:
- cached `visualScore` exists
- user clicks `运行深入诊断`
- diagnosis state becomes running
- a mocked diagnosis report is saved
- workbench renders the diagnosed panel

Keep the network mocked; do not depend on a live VLM.

- [ ] **Step 2: Run the targeted integration test and confirm the trigger flow is incomplete**

Run:

```bash
pnpm vitest run src/__tests__/vlmDiagnosis.test.ts src/__tests__/VisualDiagnosisWorkbench.test.tsx
```

Expected: FAIL because `QualityScorePanel` does not yet execute the diagnosis pass end-to-end.

- [ ] **Step 3: Implement the manual diagnosis trigger flow**

Inside `QualityScorePanel.tsx`:
- select the active VLM config
- call `evaluateVisualDiagnosis(script, visualScore, vlmConfig)`
- persist via `onSaveVisualDiagnosisReport`
- surface loading/error states next to the VLM section

Inside `src/app/result/[id]/page.tsx`:
- pass `cachedVisualDiagnosisReport`
- pass `cachedVisualDiagnosisState`
- pass `cachedVisualDiagnosisStale`
- pass `onSaveVisualDiagnosisReport`

Rules:
- diagnosis should not run if there is no current `visualScore`
- diagnosis failure must persist `visualDiagnosisState = "failed"` and show a retryable message
- diagnosis success must not mutate `visualQualityScore`

- [ ] **Step 4: Run the focused phase-1 test suite**

Run:

```bash
pnpm vitest run \
  src/__tests__/serverDbReviewPersistence.test.ts \
  src/__tests__/vlmDiagnosisState.test.ts \
  src/__tests__/vlmDiagnosis.test.ts \
  src/__tests__/useTaskActions.test.ts \
  src/__tests__/VisualDiagnosisWorkbench.test.tsx \
  src/__tests__/vlmRetry.test.ts
```

Expected: PASS

- [ ] **Step 5: Run static verification**

Run:

```bash
pnpm exec tsc --noEmit
```

Expected: PASS

If `.next/types` errors appear, run:

```bash
pnpm build
pnpm exec tsc --noEmit
```

- [ ] **Step 6: Manual QA the exact phase-1 user flow**

Check in the browser:
- open a completed comic task with existing VLM score
- run manual diagnosis
- confirm the workbench lists problem panels before healthy ones
- confirm trust labels and false-positive warnings render
- edit a prompt or regenerate a panel
- confirm the diagnosis becomes stale instead of looking current

- [ ] **Step 7: Commit the trigger/integration slice**

```bash
git add src/components/result/QualityScorePanel.tsx src/app/result/[id]/page.tsx src/hooks/useTaskActions.ts src/__tests__/vlmDiagnosis.test.ts src/__tests__/VisualDiagnosisWorkbench.test.tsx
git commit -m "feat: wire manual visual diagnosis flow"
```

---

## Validation commands

Run these before calling phase 1 complete:

```bash
pnpm vitest run \
  src/__tests__/serverDbReviewPersistence.test.ts \
  src/__tests__/vlmDiagnosisState.test.ts \
  src/__tests__/vlmDiagnosis.test.ts \
  src/__tests__/useTaskActions.test.ts \
  src/__tests__/VisualDiagnosisWorkbench.test.tsx \
  src/__tests__/vlmRetry.test.ts
pnpm exec tsc --noEmit
```

If TypeScript requires generated Next.js types:

```bash
pnpm build
pnpm exec tsc --noEmit
```

## Out of scope after this plan

Handle these in follow-up plans after phase 1 ships:

- diagnosis-backed `apply patch` / `apply rewrite`
- repair before/after compare view
- diagnosis feedback loop into scoring correctness
- provider/model routing for score vs diagnosis
- character diagnosis parity
