# ComicPedia VLM Diagnosis Workbench Design

- Date: 2026-03-27
- Status: Approved in conversation, awaiting written spec review
- Scope: comic result-page VLM diagnosis, trust signaling, and targeted repair workflow

## 1. Background

ComicPedia already has real VLM-based visual scoring in the generation pipeline:

- `src/lib/vlmScorer.ts` scores completed panels and cross-panel consistency
- `src/components/result/QualityScorePanel.tsx` renders aggregate VLM results
- `src/lib/vlmRetry.ts` converts low-score issues into rule-based prompt patches
- `src/lib/client/taskLifecycle.ts` can auto-run VLM scoring and a bounded retry loop in `fine` quality mode

This design is a focused extension of the earlier VLM review/result-page direction in `docs/superpowers/specs/2026-03-23-comicpedia-vlm-review-and-ux-design.md`. It sharpens that work around diagnosis quality, trust signaling, and targeted repair instead of redefining the whole review system.

The product gap is no longer “can we score images at all?” but “can the user reliably decide what to fix next?”

The user explicitly prioritized the next VLM upgrade in this order:

1. `C` results must tell the user which panels to fix
2. `A` results must indicate whether the diagnosis is trustworthy
3. `B` repairs should become more targeted and effective
4. `D` model/provider routing can follow later

That means the next change should not start by making scoring more complex in isolation. It should turn VLM from a score widget into a diagnosis workbench.

## 2. Product Goal

Build a two-pass VLM diagnosis workflow that:

- keeps the current lightweight score pass as the fast screen
- adds a structured diagnosis pass for suspicious panels
- shows actionable audit cards in the result page
- recommends `patch` vs `rewrite` vs `manual` repair modes per issue
- gives the user visible trust signals before they apply a repair
- supports targeted regenerate with before/after comparison

## 3. Non-Goals

This change does not aim to:

- redesign the entire result page outside the VLM review area
- replace the current VLM score pass with a brand-new architecture
- make VLM score a hard completion blocker
- redesign character reference scoring in the same change
- solve provider/model routing in this phase
- fully remove the existing rule-based retry path on day one

Those remain follow-up work.

## 4. Current-State Findings

### 4.1 Score pass is real, but still lightweight

`evaluateVisualQuality()` in `src/lib/vlmScorer.ts` already:

- scores each completed panel on four dimensions
- computes task-level overall score
- adds `retryRecommendations` for low-score panels
- optionally runs `evaluateCrossPanelConsistency()` and folds cross-panel issues back into retry recommendations

Current output is `VisualQualityScore`, which is intentionally compact:

- `overall`
- `panels`
- `crossPanelConsistency`
- `crossPanelDetail`
- `retryRecommendations`
- `evaluatedAt`

This is enough to find suspicious panels, but not enough to explain or safely drive richer repairs.

### 4.2 Current retry loop is still rule-based

`src/lib/vlmRetry.ts` maps freeform issue strings to prompt patches using keyword rules.

This works for a bounded MVP loop, but it has three limits:

- it cannot decide cleanly between `patch` and `rewrite`
- it cannot tell the user why a suggestion should be trusted
- it cannot express issue-level evidence, ambiguity, or false-positive risk

### 4.3 Current UI emphasizes score display more than diagnosis

`QualityScorePanel` already renders:

- aggregate VLM score
- average per-dimension score bars
- per-panel expandable issue lists
- model selector
- low-score retry action

But the current experience still behaves like “look at the score, then maybe retry” rather than “inspect the problem panel, understand why it failed, choose how to repair it.”

### 4.4 Task state already has useful anchors

`GenerateTask` already persists:

- `visualQualityScore`
- `reviewStatus`
- `panelReview`
- `visualRetrySummary`
- `lastReviewAt`

That means this design should extend the current task model, not replace it.

## 5. First-Principles Design Decisions

### 5.1 Split VLM into score pass and diagnosis pass

The score pass should remain fast and broad.

Its responsibility is:

- identify low-score panels
- identify cross-panel consistency risks
- produce a stable aggregate summary

It should not also try to produce the final repair artifact.

The diagnosis pass should run only for:

- panels below threshold
- panels implicated by cross-panel issues
- panels the user explicitly asks to inspect

This keeps the heavy explainability work focused where it matters.

### 5.2 Keep explanation and action in the same surface

The user’s first job is deciding what to fix. Therefore each problem panel needs a single audit card that contains:

- the diagnosis
- why the system believes it
- the recommended repair mode
- the suggested prompt change
- the action buttons

The user should not have to read one card and execute the fix somewhere else.

### 5.3 Trust must gate actionability

The UI should not treat every VLM suggestion as equally safe to apply.

Each issue needs:

- confidence
- evidence strength
- false-positive risk
- actionability label

That actionability label is what decides whether the system allows:

- one-click apply
- confirm-first apply
- manual-only handling

### 5.4 Support both patch and rewrite, chosen by issue type

The user explicitly chose a mixed strategy:

- some issues should only append a patch
- some issues should rewrite the whole prompt

Therefore the diagnosis layer must classify each repair into:

- `patch`
- `rewrite`
- `manual`

The system should not force every issue through one repair path.

### 5.5 Migrate gradually and keep the current rule path as fallback

The existing rule-based retry loop should stay alive during rollout.

Reason:

- it already works for some low-level artifact issues
- it provides a fallback if diagnosis output is incomplete
- it reduces migration risk while the new diagnosis schema stabilizes

## 6. Target Architecture

## 6.1 Score Pass

The score pass remains the current `evaluateVisualQuality()` family.

Responsibilities:

- evaluate completed panel images
- compute task-level overall score
- compute `retryRecommendations`
- compute `crossPanelDetail`
- persist the latest lightweight visual review snapshot

Output stays `VisualQualityScore`.

This pass remains the source of truth for:

- the task-level score summary
- initial panel triage
- panel review projection

## 6.2 Diagnosis Pass

The diagnosis pass is a new second-stage VLM call that runs only on suspicious panels.

It should consume:

- the panel image
- the panel prompt
- the current style target
- score-pass results for the panel
- optional cross-panel issue context

It should produce a new persisted artifact: `VisualDiagnosisReport`.

Each problem panel in this report should include:

- issue list
- severity
- affected dimensions
- evidence
- confidence
- false-positive risk
- recommended repair mode
- suggested prompt / suggested negative prompt
- expected improvement
- model metadata

The diagnosis pass is the source of truth for audit-card rendering and repair recommendations.

## 6.3 Repair Pass

Repair should consume diagnosis output, not only lightweight score output.

Flow:

1. user opens a diagnosed panel
2. user reviews the audit card
3. user chooses `apply patch`, `apply rewrite`, or `manual edit`
4. targeted regenerate runs for that panel
5. the panel is re-scored
6. the result page shows before/after comparison

Current rule-based repair can remain available as a fallback path until diagnosis-backed repair is proven.

## 7. Data Model

## 7.1 Keep `VisualQualityScore` lightweight

Do not overload `VisualQualityScore` with all diagnosis details.

It should remain the compact result of the score pass.

This preserves:

- a stable aggregate snapshot
- backward compatibility for existing score display
- a clean separation between triage and diagnosis

## 7.2 Add `VisualDiagnosisReport`

Introduce a new task-level artifact:

- `visualDiagnosisReport?: VisualDiagnosisReport`

Recommended shape:

```ts
interface VisualDiagnosisReport {
  schemaVersion: number;
  generatedAt: string;
  sourceEvaluatedAt: string;
  model: {
    provider?: string;
    model?: string;
  };
  summary: {
    problemPanelCount: number;
    highSeverityCount: number;
    actionableCount: number;
    crossPanelIssueCount: number;
  };
  panels: VisualDiagnosisPanel[];
}

interface VisualDiagnosisPanel {
  panelIndex: number;
  imageUrl: string;
  promptSnapshot: string;
  status: "clean" | "issues_found" | "uncertain";
  topIssueType: string;
  severity: "low" | "medium" | "high";
  issues: VisualDiagnosisIssue[];
  repair: VisualRepairSuggestion;
}

interface VisualDiagnosisIssue {
  issueType: string;
  severity: "low" | "medium" | "high";
  affectedDimensions: Array<"textImageAlignment" | "styleAdherence" | "artifactScore" | "compositionQuality" | "crossPanelConsistency">;
  evidence: string;
  confidence: "low" | "medium" | "high";
  evidenceStrength: "weak" | "medium" | "strong";
  falsePositiveRisk: "low" | "medium" | "high";
  actionability: "apply_directly" | "confirm_first" | "manual_only";
}

interface VisualRepairSuggestion {
  recommendedMode: "patch" | "rewrite" | "manual";
  rationale: string;
  suggestedPrompt?: string;
  suggestedNegativePrompt?: string;
  patchPositive?: string[];
  patchNegative?: string[];
  expectedImprovement: string[];
}
```

Exact naming may change during implementation, but the separation of concerns should stay.

## 7.3 Add explicit diagnosis freshness

Diagnosis must be treated as a cached interpretation of a specific panel snapshot.

At minimum, the task model should track:

- `visualDiagnosisReport`
- `lastDiagnosisAt`
- `visualDiagnosisState`: `idle | running | succeeded | failed | skipped`
- `visualDiagnosisStale`

Freshness rule:

- if a panel’s `imageUrl`, `imagePrompt`, `styleOverride`, or reference-image inputs change, that panel diagnosis is stale
- if any diagnosed panel becomes stale, the task-level diagnosis summary is stale

The UI must never present stale diagnosis as if it were current.

## 7.4 Keep existing review fields

Do not remove:

- `reviewStatus`
- `panelReview`
- `visualRetrySummary`

These remain useful during migration and continue to serve the score-pass / retry loop.

## 8. Result-Page UX

## 8.1 Promote VLM into a diagnosis workbench

The current `QualityScorePanel` should evolve from a score widget into a diagnosis workbench.

The workbench has four layers.

## 8.2 Layer 1: task summary strip

At the top of the VLM section, show:

- overall VLM score
- number of problem panels
- count of high-priority issues
- whether cross-panel consistency issues exist
- a primary CTA: `查看待修复面板`

This answers “is there work to do?” before the user dives into details.

## 8.3 Layer 2: prioritized problem-panel list

Problem panels should be listed by priority, not only by panel index.

Each card should show:

- panel number
- thumbnail
- top issue tag
- severity badge
- recommended repair mode
- short conclusion such as `建议先修这格`

This layer answers “which panel should I fix first?”

## 8.4 Layer 3: audit card detail

Opening a panel shows the full diagnosis card.

Default sections:

- `为什么判这格有问题`
- `为什么这条建议可信或不可信`
- `建议怎么改`
- `原 prompt vs 建议 prompt`
- `立即执行`

Default actions:

- `应用 patch`
- `应用重写版`
- `手动编辑后重试`
- `暂时忽略`

This is the core UI for “inspect first, then confirm.”

## 8.5 Layer 4: repair-before/after comparison

After targeted regenerate, the result page should preserve:

- previous image
- new image
- score delta
- issue delta
- whether the repair actually improved the panel

If repair did not help, the UI should suggest trying the alternate mode:

- patch failed -> offer rewrite
- rewrite failed -> suggest manual edit

## 9. Trust and Actionability

## 9.1 Confidence is issue-level, not only panel-level

Each diagnosis issue should carry its own trust signals.

This matters because one panel can contain:

- a high-confidence anatomical defect
- a low-confidence style complaint

The system should not flatten those into one generic trust score.

## 9.2 Trust should be model-plus-rules, not model-only

Issue trust should combine four signals:

1. model self-reported confidence
2. evidence specificity
3. consistency with score-pass dimension weakness
4. ambiguity penalty

Ambiguity penalty should be applied to cases such as:

- tiny faces
- occluded hands
- fast motion blur
- distant crowd scenes
- highly stylized art that may confuse realism-oriented judgments

## 9.3 Trust must map to user-facing action labels

The result UI should translate internal trust into user-facing actionability:

- `可直接执行`
- `建议确认后执行`
- `高误判风险`

That mapping should drive the default repair affordance:

- `可直接执行` -> allow one-click apply
- `建议确认后执行` -> show confirmation-first flow
- `高误判风险` -> manual-only by default

## 9.4 Trust copy must include reasons

Do not show trust as only a number.

Each issue should also expose a brief rationale, for example:

- `人物区域过小，手部判断可能不稳定`
- `该问题与跨面板一致性检测结果一致，可信度较高`

This is necessary for the user to evaluate the evaluator.

## 10. Repair-Mode Policy

The user chose a mixed repair strategy.

Therefore the first implementation should classify issues roughly as follows:

- `patch`-leaning:
  - anatomy defects
  - blur / artifact cleanup
  - text / watermark removal
  - minor style-strengthening
- `rewrite`-leaning:
  - composition mismatch
  - scene misunderstanding
  - wrong subject emphasis
  - major style drift
  - character identity mismatch
- `manual`-leaning:
  - diagnosis with high false-positive risk
  - conflicting evidence
  - suggestions that substantially change narrative intent

Exact routing logic can evolve, but the UI contract should stay stable.

## 11. Compatibility With Existing Workflow

The new diagnosis layer should integrate with current code surfaces instead of replacing them wholesale.

Primary touchpoints:

- `src/lib/vlmScorer.ts`
  - score pass remains here
  - diagnosis pass can live beside it or in a dedicated `vlmDiagnosis.ts`
- `src/lib/vlmRetry.ts`
  - keep rule-based patch generation as fallback
  - gradually migrate repair execution to diagnosis-backed suggestions
- `src/components/result/QualityScorePanel.tsx`
  - becomes the diagnosis workbench shell
- `src/lib/client/taskLifecycle.ts`
  - keeps automatic score pass
  - diagnosis should first be manual or user-triggered before automatic expansion
- `src/app/result/[id]/page.tsx`
  - continues to host task-level save / retry plumbing

## 12. Testing and Verification

## 12.1 Unit tests

Add unit tests for:

- diagnosis JSON parsing
- trust/actionability mapping
- `patch | rewrite | manual` mode selection
- prompt diff generation
- diagnosis invalidation rules

## 12.2 Integration tests

Add integration coverage for:

- score pass -> diagnosis pass handoff
- diagnosis report -> workbench rendering inputs
- apply patch / apply rewrite / manual edit state transitions
- repair-triggered re-score flow

## 12.3 Smoke verification

Prepare at least three representative visual cases:

- artifact/anatomy problem
- composition or prompt-mismatch problem
- cross-panel consistency problem

Success criteria:

- the user can identify which panel to fix first without reading every panel
- the user can understand why the system suggests `patch` or `rewrite`
- repair before/after comparison is visible and credible

## 13. Rollout Plan

## 13.1 Phase 1: read-only diagnosis workbench

Ship:

- problem-panel list
- audit cards
- trust labels
- prompt diff view

Do not yet require diagnosis-backed execution for every repair.

Goal:

- make “which panels should I fix?” obvious

## 13.2 Phase 2: confirmed repair execution

Ship:

- `apply patch`
- `apply rewrite`
- `manual edit then regenerate`

Goal:

- replace part of the rule-only loop with diagnosis-backed actions

## 13.3 Phase 3: repair outcome loop

Ship:

- before/after comparison
- score delta
- issue delta
- repair-success feedback

Goal:

- support later work on scoring correctness by recording whether recommended actions actually helped

## 13.4 Phase 4: model/provider routing

Only after the diagnosis workbench is useful should the system expand into:

- provider-specific diagnosis routing
- model comparison
- fallback scoring/diagnosis strategies

This phase depends on a working UX first.

## 14. Key Constraints

- do not block current generation completion on diagnosis
- do not break the existing lightweight `visualQualityScore` contract during migration
- do not remove rule-based retry before diagnosis-backed repair is proven
- do not present stale diagnosis as if it were current
- do not collapse trust into a single opaque number

## 15. Implementation Outcome This Spec Is Driving

When this spec is implemented, the result page should answer four concrete user questions with minimal friction:

1. Which panels should I fix first?
2. Why does the system think those panels are wrong?
3. Should I trust this diagnosis enough to apply it directly?
4. Did the repair actually improve the panel?

That is the bar for this VLM upgrade.
