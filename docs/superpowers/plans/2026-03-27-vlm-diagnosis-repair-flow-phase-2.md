# VLM Diagnosis Repair Flow Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the shipped Phase 1 diagnosis workbench into an executable repair loop with single-panel `patch`, confirm-first single-panel `rewrite`, and list-level batch `patch`, while keeping diagnosis reruns manual.

**Architecture:** Reuse the persisted diagnosis report as the source of repair intent. Add pure helpers that convert diagnosis repair payloads into executable prompt/negative-prompt updates, drive those helpers through `useTaskActions` and `QualityScorePanel`, rerun score pass after repair, and keep diagnosis marked stale until the user manually reruns it.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, better-sqlite3 metadata persistence, Vitest

---

## What already exists and must be reused

- `src/lib/vlmDiagnosis.ts`
  - Current diagnosis parsing, candidate selection, and manual diagnosis flow.
- `src/lib/vlmDiagnosisState.ts`
  - Current diagnosis stale / lifecycle helpers.
- `src/lib/vlmRetry.ts`
  - Current prompt patch helper and negative prompt merge precedent.
- `src/hooks/useTaskActions.ts`
  - Current persistence updates, diagnosis save/failure hooks, and mutation invalidation.
- `src/components/result/QualityScorePanel.tsx`
  - Current diagnosis trigger wiring and workbench host.
- `src/components/result/VisualDiagnosisWorkbench.tsx`
  - Current problem-panel list and audit-card embedding.
- `src/components/result/VisualDiagnosisAuditCard.tsx`
  - Current read-only diagnosis card.
- `src/lib/client/generator.ts`
  - Current panel regenerate and batch generation entrypoints.

## Scope guardrails

- This plan covers Phase 2 only:
  - audit-card single-panel `patch`
  - audit-card single-panel `rewrite`
  - list-level batch `patch`
  - rewrite confirm dialog
  - post-repair score refresh
- Do **not** add before/after comparison UI yet.
- Do **not** auto-rerun diagnosis after repair.
- Do **not** add draft prompt mode.
- Do **not** add batch `rewrite`.
- Do **not** add character-side repair execution.

## File scope

### Create
- `src/components/result/VisualRewriteConfirmDialog.tsx`
- `src/__tests__/visualDiagnosisRepair.test.ts`
- `src/__tests__/VisualRewriteConfirmDialog.test.ts`

### Modify
- `src/lib/types.ts`
- `src/lib/vlmDiagnosis.ts`
- `src/hooks/useTaskActions.ts`
- `src/components/result/VisualDiagnosisAuditCard.tsx`
- `src/components/result/VisualDiagnosisWorkbench.tsx`
- `src/components/result/QualityScorePanel.tsx`
- `src/app/result/[id]/page.tsx`
- `src/__tests__/useTaskActions.test.ts`
- `src/__tests__/vlmDiagnosis.test.ts`
- `src/__tests__/VisualDiagnosisWorkbench.test.ts`

---

## Task 1: Add pure repair-application helpers

**Files:**
- Create: `src/__tests__/visualDiagnosisRepair.test.ts`
- Modify: `src/lib/vlmDiagnosis.ts`

- [ ] **Step 1: Write failing tests for patch/rewrite execution payloads**

Add `src/__tests__/visualDiagnosisRepair.test.ts` to cover:
- patch merges positive prompt additions without duplicating existing text
- patch merges negative prompt additions by deduplication
- rewrite fully replaces prompt text
- rewrite only applies suggested negative prompt when explicitly enabled
- repair outcome classification returns:
  - `improved`
  - `unchanged`
  - `regressed`

Suggested assertions:

```ts
expect(result.prompt).toContain("wide shot");
expect(result.negativePrompt).toContain("cropped subject");
expect(classifyRepairOutcome(6.2, 6.2)).toBe("unchanged");
```

- [ ] **Step 2: Run the new repair-helper tests and verify they fail**

Run:

```bash
pnpm vitest run src/__tests__/visualDiagnosisRepair.test.ts
```

Expected: FAIL because the execution helpers do not exist yet.

- [ ] **Step 3: Implement repair application helpers in `src/lib/vlmDiagnosis.ts`**

Add focused helpers:
- `applyDiagnosisPatch(...)`
- `applyDiagnosisRewrite(...)`
- `mergeNegativePrompt(...)`
- `classifyRepairOutcome(before, after)`

Rules:
- patch is additive and deduplicated
- rewrite replaces prompt entirely
- rewrite negative prompt is opt-in
- helpers remain pure; no DB writes, no network calls

- [ ] **Step 4: Re-run the repair-helper tests**

Run:

```bash
pnpm vitest run src/__tests__/visualDiagnosisRepair.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit the pure helper slice**

```bash
git add src/lib/vlmDiagnosis.ts src/__tests__/visualDiagnosisRepair.test.ts
git commit -m "feat: add diagnosis repair application helpers"
```

---

## Task 2: Add executable repair state to task actions

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/hooks/useTaskActions.ts`
- Modify: `src/__tests__/useTaskActions.test.ts`

- [ ] **Step 1: Write failing tests for diagnosis-backed repair execution state**

Extend `src/__tests__/useTaskActions.test.ts` to cover:
- starting a repair marks execution status as running
- repair success stores score before/after and outcome classification
- repair failure stores failed state
- diagnosis remains stale after repair

Suggested shape:

```ts
expect(task.visualRepairExecution?.status).toBe("completed");
expect(task.visualRepairExecution?.outcome).toBe("unchanged");
```

- [ ] **Step 2: Run the task-action tests and verify they fail**

Run:

```bash
pnpm vitest run src/__tests__/useTaskActions.test.ts
```

Expected: FAIL because repair execution metadata does not exist yet.

- [ ] **Step 3: Extend `GenerateTask` with lightweight repair execution metadata**

Add a compact field such as:

```ts
visualRepairExecution?: {
  status: "running" | "completed" | "failed";
  panelIndices: number[];
  mode: "patch" | "rewrite" | "batch_patch";
  scoreBefore?: number;
  scoreAfter?: number;
  outcome?: "improved" | "unchanged" | "regressed";
  startedAt: string;
  finishedAt?: string;
}
```

Persist it through `src/lib/server/db.ts` if needed for result-page refresh safety.

- [ ] **Step 4: Add task-action helpers for repair lifecycle updates**

Inside `useTaskActions.ts`, add pure update helpers:
- `beginVisualRepairExecution`
- `completeVisualRepairExecution`
- `failVisualRepairExecution`

Rules:
- diagnosis must remain stale after repair
- score refresh should update `visualQualityScore`
- repair metadata must not overwrite diagnosis report itself

- [ ] **Step 5: Re-run the task-action tests**

Run:

```bash
pnpm vitest run src/__tests__/useTaskActions.test.ts
```

Expected: PASS

- [ ] **Step 6: Commit the repair-state slice**

```bash
git add src/lib/types.ts src/hooks/useTaskActions.ts src/__tests__/useTaskActions.test.ts
git commit -m "feat: track visual diagnosis repair execution state"
```

---

## Task 3: Build the rewrite confirmation dialog

**Files:**
- Create: `src/components/result/VisualRewriteConfirmDialog.tsx`
- Create: `src/__tests__/VisualRewriteConfirmDialog.test.ts`

- [ ] **Step 1: Write failing tests for the rewrite confirm dialog**

Cover:
- dialog renders issue summary
- dialog renders editable suggested prompt
- dialog renders optional negative prompt toggle
- confirm action returns:
  - edited prompt text
  - whether negative prompt is enabled

Suggested expectations:

```ts
expect(html).toContain("确认并重生图");
expect(html).toContain("同时应用建议 negative prompt");
```

- [ ] **Step 2: Run the dialog test and verify it fails**

Run:

```bash
pnpm vitest run src/__tests__/VisualRewriteConfirmDialog.test.ts
```

Expected: FAIL because the dialog component does not exist.

- [ ] **Step 3: Implement `VisualRewriteConfirmDialog.tsx`**

Requirements:
- compact issue summary
- editable suggested prompt textarea
- checkbox for suggested negative prompt
- confirm and cancel actions

Rules:
- this is not a full advanced editor
- no prompt draft persistence

- [ ] **Step 4: Re-run the dialog test**

Run:

```bash
pnpm vitest run src/__tests__/VisualRewriteConfirmDialog.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit the dialog slice**

```bash
git add src/components/result/VisualRewriteConfirmDialog.tsx src/__tests__/VisualRewriteConfirmDialog.test.ts
git commit -m "feat: add rewrite confirmation dialog"
```

---

## Task 4: Make audit-card single-panel repair executable

**Files:**
- Modify: `src/components/result/VisualDiagnosisAuditCard.tsx`
- Modify: `src/components/result/QualityScorePanel.tsx`
- Modify: `src/hooks/useTaskActions.ts`
- Modify: `src/__tests__/vlmDiagnosis.test.ts`

- [ ] **Step 1: Write failing tests for single-panel patch and rewrite flow**

Extend `src/__tests__/vlmDiagnosis.test.ts` or add focused integration-style tests to cover:
- patch action creates an executable patch payload
- rewrite action opens the confirm flow and returns the confirmed payload
- repair success reruns score pass
- repair leaves diagnosis stale

- [ ] **Step 2: Run the focused repair-flow tests and verify they fail**

Run:

```bash
pnpm vitest run src/__tests__/vlmDiagnosis.test.ts src/__tests__/useTaskActions.test.ts
```

Expected: FAIL because audit-card actions are still read-only.

- [ ] **Step 3: Add audit-card action callbacks**

In `VisualDiagnosisAuditCard.tsx`, add props for:
- `onApplyPatch(panel)`
- `onApplyRewrite(panel)`
- `repairStatus`

Rules:
- hide or disable direct actions for `manual_only`
- patch button only for `recommendedMode = patch`
- rewrite button only for `recommendedMode = rewrite`

- [ ] **Step 4: Implement single-panel patch execution in `QualityScorePanel.tsx`**

Flow:
- compute patched prompt via diagnosis helper
- persist prompt overwrite
- merge negative prompt
- regenerate panel
- rerun `evaluateVisualQuality`
- persist new score
- persist repair execution outcome

- [ ] **Step 5: Implement single-panel rewrite execution in `QualityScorePanel.tsx`**

Flow:
- open `VisualRewriteConfirmDialog`
- use edited prompt from dialog
- optional negative prompt merge
- regenerate panel
- rerun score pass
- persist repair execution outcome

- [ ] **Step 6: Re-run the focused repair-flow tests**

Run:

```bash
pnpm vitest run src/__tests__/vlmDiagnosis.test.ts src/__tests__/useTaskActions.test.ts
```

Expected: PASS

- [ ] **Step 7: Commit the single-panel execution slice**

```bash
git add src/components/result/VisualDiagnosisAuditCard.tsx src/components/result/QualityScorePanel.tsx src/hooks/useTaskActions.ts src/__tests__/vlmDiagnosis.test.ts src/__tests__/useTaskActions.test.ts
git commit -m "feat: add single-panel diagnosis repair actions"
```

---

## Task 5: Add batch patch from the problem-panel list

**Files:**
- Modify: `src/components/result/VisualDiagnosisWorkbench.tsx`
- Modify: `src/components/result/QualityScorePanel.tsx`
- Modify: `src/__tests__/VisualDiagnosisWorkbench.test.ts`

- [ ] **Step 1: Write failing tests for batch patch availability**

Extend `src/__tests__/VisualDiagnosisWorkbench.test.ts` to cover:
- list view renders `批量应用 patch`
- only patch-eligible panels are counted
- high-risk/manual-only panels are excluded

- [ ] **Step 2: Run the workbench tests and verify they fail**

Run:

```bash
pnpm vitest run src/__tests__/VisualDiagnosisWorkbench.test.ts
```

Expected: FAIL because batch patch entry does not exist.

- [ ] **Step 3: Implement batch patch UI and execution wiring**

In `VisualDiagnosisWorkbench.tsx`:
- render batch patch CTA
- show count of patch-eligible panels

In `QualityScorePanel.tsx`:
- collect patch-eligible diagnosis panels
- apply diagnosis patches panel by panel
- regenerate those panels
- rerun score pass once after the batch
- persist repair execution outcome

- [ ] **Step 4: Re-run the workbench tests**

Run:

```bash
pnpm vitest run src/__tests__/VisualDiagnosisWorkbench.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit the batch-patch slice**

```bash
git add src/components/result/VisualDiagnosisWorkbench.tsx src/components/result/QualityScorePanel.tsx src/__tests__/VisualDiagnosisWorkbench.test.ts
git commit -m "feat: add batch patch from diagnosis workbench"
```

---

## Task 6: Finish verification and manual QA for Phase 2

**Files:**
- Modify as needed from previous tasks only

- [ ] **Step 1: Run the full Phase 2 targeted suite**

Run:

```bash
pnpm vitest run \
  src/__tests__/serverDbReviewPersistence.test.ts \
  src/__tests__/vlmDiagnosisState.test.ts \
  src/__tests__/vlmDiagnosis.test.ts \
  src/__tests__/visualDiagnosisRepair.test.ts \
  src/__tests__/VisualRewriteConfirmDialog.test.ts \
  src/__tests__/useTaskActions.test.ts \
  src/__tests__/VisualDiagnosisWorkbench.test.ts \
  src/__tests__/vlmRetry.test.ts
```

Expected: PASS

- [ ] **Step 2: Run static verification**

Run:

```bash
pnpm exec tsc --noEmit
```

If needed:

```bash
pnpm build
pnpm exec tsc --noEmit
```

- [ ] **Step 3: Run full project verification**

Run:

```bash
pnpm test
pnpm build
```

Expected: PASS

- [ ] **Step 4: Manual QA exact Phase 2 flows**

Verify:
- single-panel patch auto-runs and refreshes score
- single-panel rewrite opens confirm dialog
- rewrite can edit prompt and toggle negative prompt
- batch patch skips rewrite/manual-only panels
- non-improving repair shows “未改善” style feedback
- diagnosis stays stale after repair until manually rerun

- [ ] **Step 5: Commit final polish if needed**

```bash
git add <changed-files>
git commit -m "feat: finalize diagnosis repair flow phase 2"
```

---

## Validation commands

```bash
pnpm vitest run \
  src/__tests__/serverDbReviewPersistence.test.ts \
  src/__tests__/vlmDiagnosisState.test.ts \
  src/__tests__/vlmDiagnosis.test.ts \
  src/__tests__/visualDiagnosisRepair.test.ts \
  src/__tests__/VisualRewriteConfirmDialog.test.ts \
  src/__tests__/useTaskActions.test.ts \
  src/__tests__/VisualDiagnosisWorkbench.test.ts \
  src/__tests__/vlmRetry.test.ts
pnpm exec tsc --noEmit
pnpm test
pnpm build
```

## Out of scope after this plan

- auto-rerun diagnosis after repair
- before/after comparison view
- prompt rollback UI
- batch rewrite
- character-side repair execution
- provider/model routing for diagnosis execution
