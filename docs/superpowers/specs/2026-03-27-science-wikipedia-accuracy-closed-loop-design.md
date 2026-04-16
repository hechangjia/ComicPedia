# ComicPedia Science/Wikipedia Accuracy Closed Loop Design

- Date: 2026-03-27
- Status: Approved in conversation, awaiting written spec review
- Scope: `science` and `wikipedia` accuracy pipeline only

## 1. Background

ComicPedia now has a stronger narrative baseline for `science` and `wikipedia` comics. The next product risk is no longer only “does this read like a comic?” but also “does this stay factually safe once the storytelling becomes stronger?”

The user’s highest-priority error class is hard factual mistakes:

- person names
- dates / years / time references
- numbers
- terms and definitions
- places
- event attribution

The user wants the first accuracy version to use a dual-protection model:

1. stronger pre-generation research
2. post-generation panel-level verification

The user also wants the research side to be backed by a configurable provider platform that can use services such as Firecrawl or Tavily, but only for the accuracy research agent in phase 1.

## 2. Product Goal

Build a closed-loop accuracy system for `science` and `wikipedia` generation that:

- produces a structured research fact base before scripting
- constrains script generation with that fact base
- extracts panel-level hard claims after script generation
- compares those claims against the fact base
- blocks or repairs hard factual mistakes before `script_ready`
- exposes lightweight user-facing confidence information without turning the UI into a heavy fact-checking workbench

## 3. Non-Goals

This change does not attempt to:

- build a full cross-product agent orchestration platform
- make the provider platform available to every agent immediately
- redesign image-generation or VLM configuration
- solve image-level semantic correctness in VLM yet
- redesign exports or sharing
- create a heavy user-facing fact review studio

Those are separate follow-up specs.

## 4. Current-State Findings

### 4.1 There is already a pre-script research hook

`src/lib/client/taskLifecycle.ts` already runs `generateTopicResearch()` for `science` before script generation and also attempts non-blocking Wikipedia enrichment. That means the product already has a usable insertion point for an explicit accuracy research phase.

### 4.2 Wikipedia retrieval already exists, but it is not yet a closed-loop authority layer

`src/app/api/wikipedia/route.ts` already supports:

- search
- article summary retrieval
- section extraction
- cache

Wikipedia therefore already exists as an anchor source, but the current system does not yet convert retrieved material into a structured fact base with enforcement semantics.

### 4.3 Prompting already encourages accuracy, but does not enforce it

`src/prompts/scriptGenerator.ts` and `src/prompts/wikipediaGenerator.ts` already contain language about scientific accuracy and source-faithful writing. That is useful but insufficient because prompt instructions alone cannot guarantee that hard facts survive downstream rewriting.

### 4.4 Post-generation checks currently focus on rhythm and craft, not factuality

Current validation and repair already cover:

- rhythm
- composition
- style alignment
- language purity
- local repair

But they do not yet:

- extract panel-level hard claims
- compare those claims against a canonical fact base
- classify conflicts by severity
- block hard factual errors before `script_ready`

## 5. First-Principles Design Decisions

### 5.1 Separate “research platform” from “accuracy workflow,” but keep phase-1 scope tight

The provider system should be platform-shaped, but phase-1 usage must be restricted to the accuracy research agent. This avoids building a generic agent platform before the accuracy use case is proven.

### 5.2 Facts must be structured, not just summarized

A natural-language research summary is not enough. The scripting and verification phases need machine-consumable facts with explicit source linkage and uncertainty tracking.

### 5.3 Hard facts and soft explanations must be separated

The system cannot treat “Newton published in X year” the same way it treats “this discovery changed how people understood nature.” Hard facts need stricter enforcement semantics.

### 5.4 Research and review are both necessary

Pre-generation fact packs alone are insufficient because scripts can still drift during generation or repair. Post-generation panel claim review is required to catch hard drift.

### 5.5 Missing evidence must be explicit

If the system cannot confidently support a hard claim, it should record a coverage gap rather than silently let the model invent detail.

## 6. Provider Platform

The provider platform should use a hybrid model:

- registry-backed internally
- slot-based in the first user-facing UI

### 6.1 Provider Registry

The canonical data model should store all configured providers.

Phase-1 ownership model:

- provider registry is user-scoped, not global across every user of the system
- settings are edited through the existing settings surface and stored alongside other user-configurable generation settings
- phase 1 does not introduce multi-tenant admin/provider sharing semantics
- only the current local user can create, edit, enable, disable, or test providers in this first version

Each provider should include at least:

- `id`
- `name`
- `kind`: `search` or `fetch`
- `vendor`: `firecrawl`, `tavily`, or `custom`
- `baseUrl`
- `apiKey`
- `capabilities`
- `enabled`
- `priority`
- `healthStatus`
- `lastCheckedAt`
- `lastError`

Security expectation for phase 1:

- `apiKey` must be treated like other existing model credentials in ComicPedia settings storage
- do not echo raw keys back into UI after save
- health checks may report status and error summaries, but must not leak secrets

### 6.2 Recommended Slots

The first settings UI should expose a small set of slots:

- `primary_search`
- `fallback_search`
- `primary_fetch`
- `fallback_fetch`

These slots point to providers in the registry.

### 6.3 Scope restriction

Phase 1 rule:

- only the accuracy research agent may consume this platform
- other systems must not yet depend on it

That keeps the implementation platform-shaped without turning it into a repo-wide migration.

### 6.4 Required provider management features

Phase 1 should support:

- add/edit/delete provider
- enable/disable provider
- assign provider to a slot
- health check / test button
- last-known error visibility

## 7. Layered Retrieval Strategy

The accuracy research agent should not search the open web first.

It should use three layers:

### 7.1 Anchor sources

Used first for hard facts.

Examples:

- Wikipedia
- future high-trust domain allowlists

### 7.2 Whitelist expansion

Used when anchor sources are insufficient.

This layer is appropriate for:

- supplemental explanation
- missing context
- thin Wikipedia pages

Phase-1 operational definition:

- whitelist domains live in user settings, attached to the accuracy research configuration
- a domain is “high trust” only because the user explicitly listed it; there is no automatic trust inference in phase 1
- whitelist expansion means search/fetch is allowed only against those configured domains, not arbitrary web results
- if no whitelist domains are configured, this retrieval layer is skipped rather than guessed

### 7.3 Open-web fallback

Used only if earlier layers fail to cover needed facts.

Open-web findings should be treated more conservatively:

- they may contribute candidate evidence
- they should not automatically become `hardFacts`

## 8. Accuracy Research Agent Output

The agent should produce two linked outputs:

1. `FactPack`
2. `ResearchBrief`

`ResearchBrief` must be derived from `FactPack`, not generated as an unrelated second artifact.

## 9. FactPack

`FactPack` is the system-facing canonical research artifact.

### 9.1 Required top-level fields

- `topic`
- `queryPlan`
- `hardFacts`
- `softFacts`
- `sourceEntries`
- `coverageGaps`
- `confidenceSummary`
- `recommendedNarrativeAngles`

Phase-1 minimum schema guidance:

- `queryPlan`: optional but, if present, must at least include `hardFactQueries`, `softFactQueries`, and `fallbackUsed`
- `confidenceSummary`: optional but, if present, must at least include `hardFactCoverage`, `softFactCoverage`, `overallRisk`
- `recommendedNarrativeAngles`: optional in phase 1 and may remain empty if research focuses purely on factual coverage
- `accuracyErrorSummary`: absent unless the run reaches `blocked`

### 9.2 hardFacts

Each hard fact should include:

- `id`
- `claimType`: `person`, `date`, `number`, `term`, `place`, `event`
- `subject`
- `predicate`
- `object`
- `normalizedValue`
- `sourceIds`
- `confidence`
- `mustPreserve`

Phase-1 policy:

- people, dates, numbers, terms, places, and event attribution should default to `mustPreserve = true`

### 9.3 softFacts

Each soft fact should include:

- `id`
- `summary`
- `evidenceLevel`
- `sourceIds`
- `rewriteFlexibility`

These facts may be used for explanation, analogy, and context, but they must not conflict with `hardFacts`.

### 9.4 sourceEntries

Each source entry should include:

- `id`
- `url`
- `domain`
- `title`
- `sourceTier`: `anchor`, `whitelist`, `open_web`
- `retrievalMethod`: `wikipedia`, `search`, `fetch`
- `providerId`
- `excerpt`
- `retrievedAt`
- `trustScore`

### 9.5 coverageGaps

Each coverage gap should include:

- `question`
- `missingType`
- `severity`
- `reason`

This field exists so the system can record “unknown” rather than hallucinate unsupported detail.

## 10. ResearchBrief

`ResearchBrief` is the user-facing lightweight summary.

It should expose:

- how many hard facts were verified
- which source tiers were used
- what major confidence risks remain
- whether the script is safe to generate

It should not expose the full raw fact-checking graph or force the user into a manual fact-review workflow in phase 1.

## 11. Script Generation Constraints

`science` and `wikipedia` prompts should stop treating research as freeform helper text.

Instead they should consume `FactPack` explicitly:

- `hardFacts` become strong constraints
- `softFacts` become explanation material
- `coverageGaps` become explicit “do not invent beyond this boundary” signals

Phase-1 prompt rule:

- unsupported hard information must not be invented just to make the comic feel richer

## 12. Panel-Level Claim Review

After the script is generated, the system should produce a `PanelClaimSet` for each panel.

### 12.1 Scope of extraction

Phase 1 extracts hard claims only:

- person names
- dates / years / time references
- numbers
- term definitions
- places
- event attribution

### 12.2 PanelClaimSet fields

Each panel claim set should include:

- `panelIndex`
- `hardClaims`
- `unsupportedClaims`
- `riskLevel`

Each hard claim should include:

- `claimType`
- `rawText`
- `normalizedValue`
- `matchedFactId`
- `matchStatus`: `matched`, `conflicting`, `missing`, `ambiguous`

Phase-1 claim matching approach:

- use normalization-first matching for hard facts (case normalization, year/number normalization, simple alias normalization where available)
- do not rely on a freeform LLM judge as the primary matcher in phase 1
- LLM assistance may be used only as a fallback explanation or repair helper after deterministic matching classifies a claim as unresolved

## 13. Decision Gate

After panel claim review, the task should fall into one of three states:

- `passed`
- `repair_required`
- `blocked`

State-machine mapping for phase 1:

- `passed` -> task may enter `script_ready`
- `repair_required` -> task remains in scripting / validation flow while automatic factual repair runs
- `blocked` -> task must not enter `script_ready`; instead it becomes `failed` with a structured accuracy error summary until the user retries generation or explicitly regenerates after adjusting settings/input

### 13.1 blocked

Used for high-risk hard fact failures:

- conflicting person name
- conflicting date / year
- conflicting number
- conflicting term definition
- conflicting place
- conflicting event attribution

These must not quietly pass into `script_ready`.

Phase-1 UX semantics for blocked:

- show a concise “高风险事实冲突，脚本未通过准确性校验” message
- show a lightweight count of blocking issues
- allow the user to retry after editing input or provider settings
- do not add an override button in phase 1; high-risk hard fact conflicts are a real stop condition

Phase-1 structured accuracy error summary:

- `status`: `blocked`
- `blockingIssueCount`
- `panels`: array of `{ panelIndex, claimType, rawText, reason, matchedFactId? }`
- `generatedAt`
- `sourceCoverage`: summary of whether anchor / whitelist / open_web were used

This summary should be stored with task metadata and returned with the task payload so both UI and later repair/retry flows can read the same canonical failure information.

### 13.2 repair_required

Used for repairable but not automatically fatal issues:

- unsupported but restatable hard assertions
- overconfident explanatory statements
- fixable definition wording drift

### 13.3 passed

No blocking hard-fact issues remain.

## 14. Automatic Repair

Phase-1 repair should focus on factual safety, not stylistic rewriting.

Allowed repair operations:

- replace wrong hard facts with canonical fact-pack values
- downgrade unsupported certainty into safer wording
- remove unsupported hard detail when necessary

After repair, the panel-claim review must run again.

## 15. User-Facing Visibility

The first release should remain lightly visible.

Recommended surfaces:

- verified hard fact count
- automatic repair count
- presence of high-risk conflicts
- brief expandable evidence summary

Avoid a heavy panel-by-panel fact audit UI in phase 1.

## 16. Pipeline Integration

The target pipeline becomes:

1. user requests `science` / `wikipedia` generation
2. accuracy research agent runs
3. provider platform resolves search/fetch tools
4. `FactPack` and `ResearchBrief` are produced
5. script generation consumes `FactPack`
6. panel-level hard claims are extracted
7. claims are compared to `FactPack`
8. task becomes `passed`, `repair_required`, or `blocked`
9. if repair is needed, repair runs and review repeats
10. only then does the task enter `script_ready`

Performance and caching constraints for phase 1:

- cap research to a small bounded source set per run
- reuse existing Wikipedia cache behavior where applicable
- provider fetch/search calls should respect strict timeouts and fail closed rather than hanging generation indefinitely
- if layered retrieval exceeds the configured time budget, record a coverage gap instead of continuing unbounded search

Recommended phase-1 defaults:

- max 3 anchor-source records carried into `sourceEntries`
- max 3 whitelist-source records
- max 2 open-web fallback records
- max excerpt length 800 characters per source entry
- per-provider timeout 8 seconds
- end-to-end research budget 20 seconds before forcing a bounded result with `coverageGaps`

## 17. Verification Plan

The first implementation should be verified at three levels.

### 17.1 Retrieval/platform verification

- provider slot selection works
- provider health checks report correctly
- fallback routing works when primary provider fails

### 17.2 Fact-pack verification

Golden topics should include:

- `女娲`
- `DNA`
- `牛顿`
- `火药`
- `为什么会打雷`

Checks:

- correct hard facts present
- unsupported facts become `coverageGaps`
- source tiering behaves correctly

### 17.3 Post-script verification

Checks:

- conflicting hard claims are caught
- repairable claims are repaired locally
- high-risk claims do not silently pass into `script_ready`

## 18. Success Criteria

The first version is successful if:

- hard factual mistakes in `science` / `wikipedia` scripts decrease materially
- unsupported hard facts are no longer silently invented
- users can see lightweight evidence/confidence status
- the provider platform is real enough to support configurable search/fetch routing for accuracy research
- the system remains usable and does not turn into a heavy fact-checking workflow

## 19. Risks

### 19.1 Platform overreach

The provider layer may try to become a full generic agent platform too early.

Mitigation:

- explicitly restrict first consumers to the accuracy research agent

### 19.2 Research latency

Layered retrieval plus structured packing may slow generation noticeably.

Mitigation:

- keep retrieval tiered
- cap results
- reuse cache aggressively

### 19.3 False blocking

Overly strict hard-claim comparison may block valid scripts.

Mitigation:

- use `ambiguous` as a distinct class
- reserve hard blocking for the most critical hard facts

## 20. Open Follow-Ups

These are intentionally deferred:

- VLM “看对路” semantic image review
- export quality upgrades using Fact Pack / Brief metadata
- role/character workflow upgrades that use external research
- broader agent platform reuse beyond accuracy research
