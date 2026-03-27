# ComicPedia VLM Diagnosis Repair Flow Phase 2 Design

- Date: 2026-03-27
- Status: Approved in conversation, awaiting written spec review
- Scope: executable repair actions on top of the shipped Phase 1 diagnosis workbench

## 1. Background

Phase 1 already turned VLM review into a diagnosis workbench:

- score pass stays lightweight
- suspicious panels can be diagnosed manually
- the result page now shows prioritized problem panels
- each panel exposes trust labels, false-positive risk, and prompt suggestions

What is still missing is the actual repair loop.

Right now the diagnosis workbench can tell the user what to change, but not execute those changes from the diagnosis surface. That keeps the product one step short of a useful closed loop.

This phase is therefore about converting diagnosis output into bounded repair actions without making the UI overly heavy.

## 2. Product Goal

Build the first executable diagnosis repair loop so that:

- audit cards support single-panel `patch` and `rewrite`
- the problem-panel list supports batch `patch` only
- `patch` stays fast and automatic
- `rewrite` stays confirm-first and user-editable
- repair only auto-runs score pass, not diagnosis pass
- unsuccessful repairs are visible but not silently rolled back

## 3. Non-Goals

This phase does not attempt to:

- redesign the diagnosis workbench itself
- add before/after comparison view yet
- auto-rerun diagnosis after every repair
- add prompt draft mode or prompt rollback UI
- add provider/model routing
- add character-side diagnosis execution
- support batch `rewrite`

Those remain follow-up work.

## 4. Approved Interaction Decisions

The user explicitly chose these interaction rules:

- `patch`:
  - directly overwrite the current prompt
  - automatically regenerate the panel
- `rewrite`:
  - open a confirmation dialog first
  - allow editing `suggestedPrompt`
  - allow toggling whether `suggestedNegativePrompt` is applied
  - after confirmation, overwrite the current prompt and regenerate
- original prompt:
  - no separate draft mode
  - rely on existing image/version history only
- post-repair review:
  - auto-run `visual score` only
  - diagnosis remains manual
- `negative prompt`:
  - `patch` auto-merges and deduplicates
  - `rewrite` lets the user choose whether to include the suggested negative prompt
- if repair does not improve score:
  - keep the new image
  - show an explicit “未改善” style message
  - do not auto-rollback
- supported repair scope:
  - audit card: single-panel `patch` + `rewrite`
  - list view: batch `patch` only

## 5. First-Principles Design Decisions

### 5.1 Patch must stay fast

`patch` is the low-friction repair path. If it starts behaving like a mini editor flow, it loses its product value.

So `patch` should:

- require no extra confirmation
- apply immediately from the audit card
- reuse the current `negative prompt` merge pattern

### 5.2 Rewrite must stay explicit

`rewrite` is higher risk because it can change scene intent, not just fix local defects.

So `rewrite` must:

- stop on a confirmation dialog
- expose editable suggested prompt text
- expose the optional negative prompt separately
- require an explicit user confirmation before regenerate

### 5.3 Score refresh is enough for phase 2

After a repair, the system needs to answer “did this help?” but does not yet need to regenerate a full new diagnosis card automatically.

Therefore:

- auto-run score pass
- mark diagnosis stale
- let the user manually rerun diagnosis if they want fresh structured reasoning

This keeps cost and latency under control.

### 5.4 Failed or non-improving repairs must stay visible

If the system silently rolls back, the user loses trust and cannot inspect what changed.

So phase 2 keeps the repaired image even if score does not improve, and instead surfaces:

- `修复完成，评分已更新`
- `修复完成，但当前评分未改善`
- `修复失败，请重试`

## 6. Target User Flows

## 6.1 Single-panel patch

Flow:

1. user opens a diagnosed panel
2. user clicks `应用 patch`
3. system derives final patch payload from diagnosis suggestion
4. system overwrites current prompt
5. system merges and deduplicates negative prompt
6. system regenerates the panel automatically
7. system reruns score pass
8. diagnosis is marked stale

Output:

- updated panel image
- updated `visualQualityScore`
- stale diagnosis badge
- outcome toast / inline message

## 6.2 Single-panel rewrite

Flow:

1. user opens a diagnosed panel
2. user clicks `应用重写版`
3. confirmation dialog opens
4. user edits `suggestedPrompt` if needed
5. user optionally enables `suggestedNegativePrompt`
6. user confirms
7. system overwrites current prompt
8. system applies optional negative prompt merge
9. system regenerates the panel automatically
10. system reruns score pass
11. diagnosis is marked stale

## 6.3 Batch patch

Flow:

1. user stays in the problem-panel list
2. user clicks `批量应用 patch`
3. system selects only diagnosis panels where:
   - `recommendedMode = patch`
   - risk is not `manual_only`
4. system applies prompt patches panel by panel
5. system regenerates those panels
6. system reruns score pass once after the batch
7. diagnosis is marked stale

No batch rewrite exists in this phase.

## 7. Result-Page UX Changes

## 7.1 Audit-card actions become real

Each diagnosis audit card should expose:

- `应用 patch`
- `应用重写版`
- `暂时忽略`

Action enablement rules:

- `patch` button appears only when `recommendedMode = patch`
- `rewrite` button appears only when `recommendedMode = rewrite`
- `manual_only` risk suppresses direct-execute buttons and instead shows a high-risk note

## 7.2 Rewrite confirm dialog

The dialog should remain lightweight and focused.

Sections:

- panel issue summary
- editable `suggestedPrompt`
- optional `suggestedNegativePrompt` with a checkbox
- `确认并重生图`
- `取消`

It is not a full advanced prompt editor.

## 7.3 Problem-panel list batch action

The list surface should add:

- one batch CTA for `批量应用 patch`

It should not:

- batch-confirm rewrites
- mix patch and rewrite in the same action
- expose complex per-panel selection UI in this phase

## 7.4 Feedback and status copy

Required user-facing states:

- patch running: `正在修复该面板...`
- rewrite running: `正在应用重写并重生图...`
- batch patch running: `正在修复 N 个面板...`
- success: `修复完成，视觉评分已更新`
- not improved: `修复完成，但当前评分未改善`
- partial batch failure: `部分面板修复失败，请逐个检查`
- failure: `修复失败，请重试`

## 8. Data and State Changes

Phase 2 should not introduce a second repair subsystem.

Instead it should extend the current task metadata with a lightweight execution trace, for example:

- last repair action type
- affected panel indices
- score before repair
- score after repair
- whether improvement occurred

This data may live inside:

- a new lightweight `visualRepairExecution` field, or
- an extension of existing retry summary metadata

The exact shape may follow current code constraints, but the UI must be able to know:

- repair is running
- repair completed
- repair failed
- repair improved score or not

## 9. Integration Strategy

Primary touchpoints:

- `src/components/result/VisualDiagnosisAuditCard.tsx`
  - action buttons and inline status feedback
- `src/components/result/VisualDiagnosisWorkbench.tsx`
  - batch patch entry
- `src/components/result/QualityScorePanel.tsx`
  - rewrite dialog state and repair-trigger wiring
- `src/hooks/useTaskActions.ts`
  - diagnosis-backed repair persistence helpers
- `src/lib/vlmDiagnosis.ts`
  - convert diagnosis repair payload into executable prompt changes
- `src/lib/vlmRetry.ts`
  - keep rule-based retry available as fallback, but do not let it own the diagnosis execution flow

## 10. Execution Rules

### 10.1 Patch application

Patch execution should:

- append diagnosis patch text to the current prompt
- avoid duplicating phrases already present
- merge negative prompt additions by deduplication

### 10.2 Rewrite application

Rewrite execution should:

- replace current prompt with the confirmed prompt text
- only include suggested negative prompt if the user enables it
- keep the rest of the image-generation config untouched

### 10.3 Post-repair score rerun

After any repair:

- rerun `evaluateVisualQuality`
- persist the fresh score
- leave diagnosis stale
- do not auto-rerun `evaluateVisualDiagnosis`

## 11. Testing Strategy

## 11.1 Unit tests

Add coverage for:

- diagnosis repair payload -> executable prompt update
- negative prompt merge/deduplication
- rewrite confirmation payload mapping
- score-improvement / no-improvement classification

## 11.2 Integration tests

Add coverage for:

- single-panel patch execution
- single-panel rewrite confirmation flow
- batch patch selection and execution
- stale diagnosis after repair
- post-repair score refresh

## 11.3 Manual QA

Verify at least:

- patch on an artifact/anatomy issue
- rewrite on a composition mismatch
- batch patch on 2+ patch-eligible panels
- non-improving repair copy appears and keeps the new image

## 12. Key Constraints

- keep diagnosis manual-refresh only
- do not silently rollback a non-improving repair
- do not add draft prompt mode
- do not support batch rewrite in this phase
- do not break current score-pass persistence

## 13. Outcome This Phase Is Driving

When this phase ships, the diagnosis workbench should no longer be only advisory.

It should let the user:

1. fix a low-risk panel immediately with `patch`
2. confirm and edit a high-impact `rewrite`
3. batch-apply safe patches
4. see whether the repair improved the score

That is the bar for Phase 2.
