# Science/Wikipedia Accuracy Closed Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a bounded, provider-backed factual safety loop for `science` and `wikipedia` generation that researches hard facts before scripting, constrains prompts with a `FactPack`, reviews panel-level hard claims after scripting, repairs safe issues automatically, and blocks high-risk factual conflicts before `script_ready`.

**Architecture:** Keep the phase-1 consumer surface narrow: the new provider platform is real, but only the accuracy research agent may use it. Run provider-backed research on the server so provider secrets can stay redacted in the settings UI, persist `FactPack` / `ResearchBrief` / accuracy review metadata in existing task metadata, then extend the existing `taskLifecycle -> prompt builders -> validator/repair -> result page` pipeline with a deterministic hard-claim review gate.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, better-sqlite3 metadata persistence, Vitest

---

## What already exists and must be reused

- `src/hooks/useAPIConfig.ts`
  - Current client-side config store, localStorage sync, and `/api/config` sync path.
- `src/app/settings/page.tsx`
  - Current settings surface for LLM / image / VLM management and connection testing.
- `src/app/api/config/route.ts`
  - Current config GET/PUT endpoint backed by SQLite config storage.
- `src/lib/server/db.ts`
  - Current task metadata persistence and config storage.
- `src/lib/client/taskLifecycle.ts`
  - Current `science` topic research, director outline, script validation, script repair, and `script_ready` transition.
- `src/lib/llm.ts`
  - Current script generation, topic research, and `callLLM()` entrypoints.
- `src/lib/contentRegistry.ts`
  - Current prompt routing for `science` / `wikipedia`.
- `src/prompts/scriptGenerator.ts`
  - Current science prompt builder with hard constraints and beat-plan support.
- `src/prompts/wikipediaGenerator.ts`
  - Current wikipedia prompt builder and article-content grounding.
- `src/app/api/wikipedia/route.ts`
  - Current Wikipedia search / summary / cache behavior that should become the anchor-source layer.
- `src/lib/scriptValidator.ts`
  - Current deterministic script checks and warning model.
- `src/lib/scriptRepair.ts`
  - Current warning-driven post-script repair loop.
- `src/lib/pipelineSummary.ts`
  - Current pipeline status summary surface.
- `src/components/result/PipelineSummary.tsx`
  - Current result-page pipeline disclosure UI.
- `src/app/result/[id]/page.tsx`
  - Current result page, topic-research visibility, and failure-state rendering surface.
- `src/__tests__/taskLifecycle.test.ts`
  - Current mocked lifecycle test harness that already covers research and narrative-outline threading.
- `src/__tests__/contentRegistry.test.ts`
  - Current prompt-builder routing tests.
- `src/__tests__/serverDbReviewPersistence.test.ts`
  - Current metadata round-trip pattern for SQLite task metadata.
- `src/__tests__/pipelineSummary.test.ts`
  - Current pipeline summary detail tests.

## Scope guardrails

- Only `science` and `wikipedia` are in scope.
- Only the accuracy research agent may consume the new provider platform in phase 1.
- Do **not** expand this into VLM semantic review, export upgrades, or character workflow changes.
- Do **not** build a heavy panel-by-panel fact-review workbench.
- Do **not** add a brand-new DB table if task/config metadata can safely hold the new fields.
- Do **not** make open-web search the first retrieval layer.
- Do **not** rely on a freeform LLM judge as the primary hard-claim matcher.

## File scope

### Create
- `src/lib/accuracy/providerConfig.ts`
- `src/lib/accuracy/providerClients.ts`
- `src/lib/accuracy/providerRegistry.ts`
- `src/lib/accuracy/research.ts`
- `src/lib/accuracy/claimReview.ts`
- `src/lib/accuracy/repair.ts`
- `src/lib/server/wikipedia.ts`
- `src/lib/api/accuracyProviderTest.ts`
- `src/components/settings/AccuracyProviderSection.tsx`
- `src/components/settings/AccuracyProviderForm.tsx`
- `src/components/result/AccuracySummary.tsx`
- `src/app/api/accuracy/research/route.ts`
- `src/app/api/accuracy/providers/test/route.ts`
- `src/__tests__/accuracyProviderConfig.test.ts`
- `src/__tests__/accuracyProviderRegistry.test.ts`
- `src/__tests__/accuracyResearch.test.ts`
- `src/__tests__/accuracyClaimReview.test.ts`
- `src/__tests__/accuracyRepair.test.ts`
- `src/__tests__/configRoute.test.ts`

### Modify
- `src/lib/types.ts`
- `src/hooks/useAPIConfig.ts`
- `src/app/api/config/route.ts`
- `src/app/settings/page.tsx`
- `src/lib/server/db.ts`
- `src/app/api/wikipedia/route.ts`
- `src/lib/llm.ts`
- `src/lib/contentRegistry.ts`
- `src/prompts/scriptGenerator.ts`
- `src/prompts/wikipediaGenerator.ts`
- `src/lib/client/taskLifecycle.ts`
- `src/lib/pipelineSummary.ts`
- `src/components/result/PipelineSummary.tsx`
- `src/app/result/[id]/page.tsx`
- `src/__tests__/contentRegistry.test.ts`
- `src/__tests__/taskLifecycle.test.ts`
- `src/__tests__/serverDbReviewPersistence.test.ts`
- `src/__tests__/pipelineSummary.test.ts`

---

## Task 1: Define the accuracy/provider data model and config-secret rules

**Files:**
- Create: `src/lib/accuracy/providerConfig.ts`
- Modify: `src/lib/types.ts`
- Modify: `src/hooks/useAPIConfig.ts`
- Modify: `src/app/api/config/route.ts`
- Test: `src/__tests__/accuracyProviderConfig.test.ts`
- Test: `src/__tests__/configRoute.test.ts`

- [ ] **Step 1: Write failing tests for provider config normalization, secret redaction, and slot defaults**

Add `src/__tests__/accuracyProviderConfig.test.ts` to cover:
- empty `accuracyConfig` gets initialized with:
  - empty provider list
  - `primarySearch`, `fallbackSearch`, `primaryFetch`, `fallbackFetch` slots set to `null`
  - empty whitelist domains
- `sanitizeAccuracyConfigForClient()` removes raw provider `apiKey` values but preserves:
  - `hasApiKey`
  - masked preview like `fc_****abcd`
  - last health status/error metadata
- `mergeAccuracyProviderSecrets()` preserves the stored secret when the incoming provider payload leaves `apiKey` blank during edit
- disabled or deleted providers clear invalid slot references

Suggested test shape:

```ts
it("preserves stored provider secret when edit payload leaves apiKey blank", () => {
  const merged = mergeAccuracyProviderSecrets(existingConfig, incomingConfig);
  expect(merged.accuracyConfig.providers[0].apiKey).toBe("fc_live_secret");
});
```

- [ ] **Step 2: Write failing route tests for `/api/config` provider-secret behavior**

Add `src/__tests__/configRoute.test.ts` to cover:
- `GET /api/config` returns sanitized provider entries without raw `apiKey`
- `PUT /api/config` merges provider secrets instead of overwriting them with empty strings
- default config payload now contains an `accuracyConfig` object

Suggested assertions:

```ts
expect(body.accuracyConfig.providers[0].apiKey).toBeUndefined();
expect(body.accuracyConfig.providers[0].hasApiKey).toBe(true);
```

- [ ] **Step 3: Run the new config tests and verify they fail**

Run:

```bash
pnpm vitest run src/__tests__/accuracyProviderConfig.test.ts src/__tests__/configRoute.test.ts
```

Expected: FAIL because `accuracyConfig`, provider redaction helpers, and config-route merge logic do not exist yet.

- [ ] **Step 4: Extend `src/lib/types.ts` with the new persisted accuracy types**

Add compact, persisted types that will be reused across settings, research, task metadata, and UI:

```ts
export type AccuracyProviderKind = "search" | "fetch";
export type AccuracyProviderVendor = "firecrawl" | "tavily" | "custom";
export type AccuracySourceTier = "anchor" | "whitelist" | "open_web";
export type AccuracyReviewStatus = "passed" | "repair_required" | "blocked";
```

Add interfaces for:
- `AccuracyProviderConfig`
- `AccuracyProviderSlots`
- `AccuracySettings`
- `FactPack`
- `ResearchBrief`
- `PanelClaimSet`
- `AccuracyIssueSummary`
- `AccuracyReviewResult`

Required shape notes:
- `FactPack` must expose:
  - `topic`
  - `queryPlan`
  - `hardFacts`
  - `softFacts`
  - `sourceEntries`
  - `coverageGaps`
  - `confidenceSummary`
  - `recommendedNarrativeAngles`
- `AccuracyIssueSummary` must expose:
  - `status`
  - `blockingIssueCount`
  - `panels`
  - `generatedAt`
  - `sourceCoverage`

Extend:
- `UserAPIConfigV2` with `accuracyConfig`
- `GenerateTask` with:
  - `factPack?`
  - `researchBrief?`
  - `accuracyReview?`
  - `accuracyErrorSummary?`

Rules:
- persisted task/config types stay in `src/lib/types.ts`
- internal helper-only types may live in `src/lib/accuracy/*`
- keep `GenerateTask.status` unchanged; blocked still maps to task `failed`

- [ ] **Step 5: Implement pure provider-config helpers in `src/lib/accuracy/providerConfig.ts`**

Add focused helpers for:
- `createEmptyAccuracyConfig()`
- `normalizeAccuracyConfig(config)`
- `sanitizeAccuracyConfigForClient(config)`
- `mergeAccuracyProviderSecrets(existing, incoming)`
- `dropInvalidAccuracySlots(config)`
- `validateAccuracyConfig(config)`

Implementation rules:
- whitelist domains are trimmed, lowercased, and deduplicated
- slot references must point to providers of the correct `kind`
- sanitized client payload must never include raw provider `apiKey`
- blank incoming `apiKey` means “preserve stored secret”, not “erase secret”

- [ ] **Step 6: Update `useAPIConfig.ts` to initialize and round-trip `accuracyConfig`**

Adjust:
- `createEmptyConfig()`
- `loadConfig()`
- `saveConfig()`
- `getStoredConfigs()`

Rules:
- initialize `accuracyConfig` for old configs without resetting unrelated LLM/image/VLM state
- keep existing localStorage + async `/api/config` sync behavior
- do not make accuracy-provider readiness part of the global “LLM is valid” gate

- [ ] **Step 7: Update `/api/config` GET/PUT to sanitize provider secrets and preserve stored ones**

On `GET`:
- normalize config
- sanitize provider entries before returning JSON

On `PUT`:
- load existing stored config
- merge provider secrets server-side
- normalize slot/domain state before save

Rules:
- do not change existing LLM/image/VLM secret behavior in this slice
- only the new accuracy provider registry gets explicit secret redaction semantics

- [ ] **Step 8: Re-run the config tests until they pass**

Run:

```bash
pnpm vitest run src/__tests__/accuracyProviderConfig.test.ts src/__tests__/configRoute.test.ts
pnpm exec tsc --noEmit
```

Expected: PASS.

- [ ] **Step 9: Commit the config-model slice**

```bash
git add src/lib/types.ts src/lib/accuracy/providerConfig.ts src/hooks/useAPIConfig.ts src/app/api/config/route.ts src/__tests__/accuracyProviderConfig.test.ts src/__tests__/configRoute.test.ts
git commit -m "feat: add accuracy provider config model"
```

---

## Task 2: Build the provider platform backend and settings management UI

**Files:**
- Create: `src/lib/accuracy/providerClients.ts`
- Create: `src/lib/accuracy/providerRegistry.ts`
- Create: `src/lib/api/accuracyProviderTest.ts`
- Create: `src/components/settings/AccuracyProviderSection.tsx`
- Create: `src/components/settings/AccuracyProviderForm.tsx`
- Create: `src/app/api/accuracy/providers/test/route.ts`
- Modify: `src/app/settings/page.tsx`
- Test: `src/__tests__/accuracyProviderRegistry.test.ts`

- [ ] **Step 1: Write failing tests for slot resolution, fallback ordering, and whitelist filtering**

Add `src/__tests__/accuracyProviderRegistry.test.ts` for:
- selecting `primary_search` / `fallback_search` / `primary_fetch` / `fallback_fetch`
- ignoring disabled providers
- filtering providers by `kind`
- ordering by slot first, then provider priority
- returning configured whitelist domains exactly as saved

Suggested test shape:

```ts
it("prefers the slotted primary search provider before lower-priority extras", () => {
  const resolved = resolveAccuracyProviders(config.accuracyConfig, "search");
  expect(resolved.map((p) => p.id)).toEqual(["search-primary", "search-fallback"]);
});
```

- [ ] **Step 2: Run the provider-registry test and verify failure**

Run:

```bash
pnpm vitest run src/__tests__/accuracyProviderRegistry.test.ts
```

Expected: FAIL because slot resolution helpers and registry logic do not exist yet.

- [ ] **Step 3: Implement the provider registry and vendor client adapters**

In `src/lib/accuracy/providerRegistry.ts`, add:
- `resolveAccuracyProviders(config, kind)`
- `getAssignedProvider(config, slot)`
- `getWhitelistDomains(config)`

In `src/lib/accuracy/providerClients.ts`, add minimal vendor adapters:
- `searchWithProvider(provider, query, options)`
- `fetchWithProvider(provider, url, options)`

Phase-1 adapter rules:
- support `firecrawl`, `tavily`, and bounded `custom`
- each adapter returns a normalized result shape with `url`, `title`, `domain`, `excerpt`
- each call respects the provider timeout passed in
- errors return structured summaries for health checks and research fallback logging

- [ ] **Step 4: Add a server-side provider health-check route**

Implement `POST /api/accuracy/providers/test` using the stored config from SQLite:
- input: `{ providerId: string }`
- resolve provider from current `accuracyConfig`
- run a minimal safe smoke request:
  - search providers: narrow test query
  - fetch providers: lightweight known URL fetch or provider self-test endpoint
- return:
  - `status`
  - `message`
  - `detail`
  - updated `lastCheckedAt`
  - summarized `lastError`

Rules:
- fetch provider secrets only on the server
- never return the raw `apiKey`
- persist health metadata back into the config after each test

- [ ] **Step 5: Add a small client helper for the settings page**

In `src/lib/api/accuracyProviderTest.ts`, add a pure fetch wrapper:

```ts
export async function testAccuracyProvider(providerId: string): Promise<TestResult> {
  // POST /api/accuracy/providers/test
}
```

Reuse the existing `TestResult` pattern from `src/lib/api/connectionTest.ts` so the settings UI can render consistent badges.

- [ ] **Step 6: Add the accuracy provider management UI to settings**

Create `AccuracyProviderSection.tsx` and `AccuracyProviderForm.tsx` and wire them from `src/app/settings/page.tsx`.

The new settings section must support:
- add / edit / delete provider
- enable / disable provider
- assign the four recommended slots
- edit whitelist domains
- run health check
- show last-known health/error state

Implementation rules:
- keep this UI isolated; do not bloat the existing LLM/image/VLM forms
- when editing an existing provider, show masked-secret state like “已保存密钥” instead of echoing raw key text
- if the user enters a new key, replace the stored secret; if left blank, preserve it

- [ ] **Step 7: Run provider tests and type-check**

Run:

```bash
pnpm vitest run src/__tests__/accuracyProviderRegistry.test.ts
pnpm exec tsc --noEmit
```

Expected: PASS.

- [ ] **Step 8: Commit the provider-platform slice**

```bash
git add src/lib/accuracy/providerClients.ts src/lib/accuracy/providerRegistry.ts src/lib/api/accuracyProviderTest.ts src/components/settings/AccuracyProviderSection.tsx src/components/settings/AccuracyProviderForm.tsx src/app/api/accuracy/providers/test/route.ts src/app/settings/page.tsx src/__tests__/accuracyProviderRegistry.test.ts
git commit -m "feat: add accuracy provider management"
```

---

## Task 3: Build the layered accuracy research agent and reusable Wikipedia anchor client

**Files:**
- Create: `src/lib/server/wikipedia.ts`
- Create: `src/lib/accuracy/research.ts`
- Create: `src/app/api/accuracy/research/route.ts`
- Modify: `src/app/api/wikipedia/route.ts`
- Test: `src/__tests__/accuracyResearch.test.ts`

- [ ] **Step 1: Write failing research tests for layered retrieval and bounded outputs**

Add `src/__tests__/accuracyResearch.test.ts` to cover:
- Wikipedia anchor sources are attempted first
- whitelist providers are used only when anchor coverage is insufficient
- open-web fallback is skipped when anchor/whitelist already cover required facts
- source-entry limits are enforced:
  - max 3 anchor entries
  - max 3 whitelist entries
  - max 2 open-web entries
- excerpt truncation respects the 800-char cap
- time-budget overflow records `coverageGaps` instead of hanging
- `ResearchBrief` is derived from the produced `FactPack`

Suggested test shape:

```ts
it("records a coverage gap instead of doing unbounded open-web fallback", async () => {
  const result = await runAccuracyResearch(makeInput({ budgetMs: 1 }));
  expect(result.factPack.coverageGaps).toEqual(
    expect.arrayContaining([expect.objectContaining({ severity: "warning" })]),
  );
});
```

- [ ] **Step 2: Run the research test and verify failure**

Run:

```bash
pnpm vitest run src/__tests__/accuracyResearch.test.ts
```

Expected: FAIL because no shared Wikipedia helper or research orchestrator exists yet.

- [ ] **Step 3: Extract shared Wikipedia search/summary logic into `src/lib/server/wikipedia.ts`**

Move reusable logic out of `src/app/api/wikipedia/route.ts`:
- search
- summary lookup
- detailed extract
- section titles
- in-memory caches

Then update `src/app/api/wikipedia/route.ts` to call the shared helpers so current route behavior stays the same.

Rules:
- preserve current cache keys and timeout behavior
- keep the public `/api/wikipedia` response contract unchanged

- [ ] **Step 4: Implement the research orchestrator in `src/lib/accuracy/research.ts`**

Add one server-side entrypoint, for example:

```ts
export async function runAccuracyResearch(input: AccuracyResearchInput): Promise<{
  factPack: FactPack;
  researchBrief: ResearchBrief;
}> { /* layered retrieval + packing */ }
```

The orchestrator must:
- build a small query plan for hard facts vs soft facts
- read anchor evidence from Wikipedia first
- optionally expand through whitelist-domain search/fetch
- optionally do conservative open-web fallback last
- produce:
  - `hardFacts`
  - `softFacts`
  - `sourceEntries`
  - `coverageGaps`
  - `confidenceSummary`
  - `recommendedNarrativeAngles`

Phase-1 rules:
- open-web findings may support soft facts or candidate evidence, but should not become `mustPreserve` hard facts without stronger support
- if no whitelist domains are configured, skip that layer entirely
- if no provider is configured for a layer, record the gap and continue with bounded evidence
- use these exact defaults unless the spec is revised:
  - `MAX_ANCHOR_SOURCES = 3`
  - `MAX_WHITELIST_SOURCES = 3`
  - `MAX_OPEN_WEB_SOURCES = 2`
  - `MAX_EXCERPT_CHARS = 800`
  - `PROVIDER_TIMEOUT_MS = 8000`
  - `RESEARCH_BUDGET_MS = 20000`
- a coverage gap by itself should not hard-block the task; blocking only happens when the generated script asserts unsupported or conflicting high-risk hard facts

- [ ] **Step 5: Add `/api/accuracy/research` as the taskLifecycle-facing server endpoint**

Implement `POST /api/accuracy/research` with input like:

```json
{
  "topic": "牛顿",
  "contentType": "science",
  "wikipediaTitle": "Isaac Newton",
  "wikipediaExtract": "...optional..."
}
```

The route should:
- load the current sanitized/stored `accuracyConfig`
- run `runAccuracyResearch()`
- return only `FactPack` + `ResearchBrief`

Rules:
- provider secrets stay server-only
- route failures should return structured errors so the client can record a coverage gap or fail gracefully

- [ ] **Step 6: Re-run the research tests until they pass**

Run:

```bash
pnpm vitest run src/__tests__/accuracyResearch.test.ts
pnpm exec tsc --noEmit
```

Expected: PASS.

- [ ] **Step 7: Commit the research slice**

```bash
git add src/lib/server/wikipedia.ts src/lib/accuracy/research.ts src/app/api/accuracy/research/route.ts src/app/api/wikipedia/route.ts src/__tests__/accuracyResearch.test.ts
git commit -m "feat: add layered accuracy research agent"
```

---

## Task 4: Thread `FactPack` and `ResearchBrief` through prompts and task persistence

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/server/db.ts`
- Modify: `src/lib/llm.ts`
- Modify: `src/lib/contentRegistry.ts`
- Modify: `src/prompts/scriptGenerator.ts`
- Modify: `src/prompts/wikipediaGenerator.ts`
- Modify: `src/lib/client/taskLifecycle.ts`
- Test: `src/__tests__/contentRegistry.test.ts`
- Test: `src/__tests__/taskLifecycle.test.ts`
- Test: `src/__tests__/serverDbReviewPersistence.test.ts`

- [ ] **Step 1: Add failing prompt and lifecycle tests for fact-pack threading**

Extend `src/__tests__/contentRegistry.test.ts` to assert:
- `science` prompt includes hard fact constraints and coverage-gap “do not invent” language
- `wikipedia` prompt includes the same hard/soft distinction

Extend `src/__tests__/taskLifecycle.test.ts` to assert:
- `science` and `wikipedia` runs call `/api/accuracy/research`
- returned `factPack` / `researchBrief` are stored on the task before script generation
- the generated script receives `factPack` in both stream and fallback code paths

Extend `src/__tests__/serverDbReviewPersistence.test.ts` to assert SQLite round-trips:
- `factPack`
- `researchBrief`
- `accuracyReview`
- `accuracyErrorSummary`

- [ ] **Step 2: Run the prompt/lifecycle/db tests and verify failure**

Run:

```bash
pnpm vitest run src/__tests__/contentRegistry.test.ts src/__tests__/taskLifecycle.test.ts src/__tests__/serverDbReviewPersistence.test.ts
```

Expected: FAIL because the new research artifacts are not yet persisted or passed into prompt building.

- [ ] **Step 3: Extend the generation parameter flow to accept `FactPack`**

Modify:
- `src/lib/llm.ts`
- `src/lib/contentRegistry.ts`

Add `factPack?: FactPack` to the script-generation parameter flow so both:
- `generateScriptStream(...)`
- `generateScript(...)`

can pass the same research artifact into the prompt builders.

- [ ] **Step 4: Update `scriptGenerator.ts` and `wikipediaGenerator.ts` to consume `FactPack` explicitly**

Add a dedicated prompt section like:

```ts
## Fact Pack (must obey)
- Hard facts:
  - [date] subject=牛顿 predicate=birth_year object=1643
- Soft facts:
  - ...
- Coverage gaps:
  - If unsupported, do not invent beyond these boundaries
```

Prompt rules:
- `hardFacts` are must-preserve constraints
- `softFacts` are allowed narrative/explanation material
- `coverageGaps` are explicit “avoid unsupported detail” constraints
- if a requested flourish is not supported, prefer omission or safe phrasing

- [ ] **Step 5: Update `taskLifecycle.ts` to run accuracy research before the director/script phases**

In `processScripting()`:
- call `/api/accuracy/research` only for `science` and `wikipedia`
- persist `task.factPack` and `task.researchBrief`
- keep the existing topic research / outline steps for `science` intact
- for `wikipedia`, seed the accuracy-research request from `request.wikipediaContent` when available

Behavior rules:
- research-route failure should not instantly fail the task; instead:
  - record a conservative coverage gap summary when possible
  - continue with an empty or partial `FactPack`
- this phase must remain bounded by the research route’s time budget

- [ ] **Step 6: Persist the new accuracy artifacts in `src/lib/server/db.ts`**

Pack/unpack into task metadata:
- `factPack`
- `researchBrief`
- `accuracyReview`
- `accuracyErrorSummary`

Rules:
- preserve backward compatibility with old tasks that do not have these fields
- do not create a new table

- [ ] **Step 7: Re-run the prompt/lifecycle/db tests until they pass**

Run:

```bash
pnpm vitest run src/__tests__/contentRegistry.test.ts src/__tests__/taskLifecycle.test.ts src/__tests__/serverDbReviewPersistence.test.ts
pnpm exec tsc --noEmit
```

Expected: PASS.

- [ ] **Step 8: Commit the prompt-threading slice**

```bash
git add src/lib/types.ts src/lib/server/db.ts src/lib/llm.ts src/lib/contentRegistry.ts src/prompts/scriptGenerator.ts src/prompts/wikipediaGenerator.ts src/lib/client/taskLifecycle.ts src/__tests__/contentRegistry.test.ts src/__tests__/taskLifecycle.test.ts src/__tests__/serverDbReviewPersistence.test.ts
git commit -m "feat: thread fact packs through scripting"
```

---

## Task 5: Add deterministic panel-claim review, factual repair, and blocking semantics

**Files:**
- Create: `src/lib/accuracy/claimReview.ts`
- Create: `src/lib/accuracy/repair.ts`
- Modify: `src/lib/client/taskLifecycle.ts`
- Test: `src/__tests__/accuracyClaimReview.test.ts`
- Test: `src/__tests__/accuracyRepair.test.ts`
- Test: `src/__tests__/taskLifecycle.test.ts`

- [ ] **Step 1: Write failing claim-review tests for `matched`, `conflicting`, `missing`, and `ambiguous`**

Add `src/__tests__/accuracyClaimReview.test.ts` to cover:
- year normalization (`1643年`, `1643`, `A.D. 1643`) matches the same hard fact
- number normalization strips commas/units where appropriate
- claim-type-specific matching for:
  - `person`
  - `date`
  - `number`
  - `term`
  - `place`
  - `event`
- unsupported claims become `missing`
- soft explanatory drift becomes `repair_required`
- direct hard-fact conflicts become `blocked`

Suggested test shape:

```ts
it("blocks conflicting hard date claims", () => {
  const review = reviewPanelClaims(script, factPack);
  expect(review.status).toBe("blocked");
  expect(review.blockingIssueCount).toBe(1);
});
```

- [ ] **Step 2: Write failing repair tests for targeted factual rewrites**

Add `src/__tests__/accuracyRepair.test.ts` to cover:
- wrong hard fact gets replaced with canonical `FactPack` value
- unsupported certainty gets downgraded to safer wording
- unaffected panels remain unchanged
- repair rejects malformed LLM output or panel-count drift

- [ ] **Step 3: Run the new accuracy-review tests and verify failure**

Run:

```bash
pnpm vitest run src/__tests__/accuracyClaimReview.test.ts src/__tests__/accuracyRepair.test.ts
```

Expected: FAIL because deterministic claim extraction/matching and targeted repair do not exist yet.

- [ ] **Step 4: Implement deterministic hard-claim extraction and review in `claimReview.ts`**

Add focused functions such as:

```ts
export function extractPanelClaims(script: ComicScript): PanelClaimSet[] { /* hard claim mining */ }
export function reviewPanelClaims(script: ComicScript, factPack: FactPack): AccuracyReviewResult { /* matching + gate */ }
```

Phase-1 rules:
- deterministic normalization is primary
- `ambiguous` is distinct from `conflicting`
- only hard-fact conflicts can escalate to `blocked`
- use lightweight alias normalization only where the fact pack provides clear alternate forms

- [ ] **Step 5: Implement targeted factual repair in `src/lib/accuracy/repair.ts`**

Create a dedicated repair helper instead of overloading the generic validator-repair loop:

```ts
export async function repairAccuracyIssues(
  script: ComicScript,
  review: AccuracyReviewResult,
  factPack: FactPack,
  llmConfig?: PartialLLMConfig,
): Promise<ComicScript | null>
```

Repair rules:
- only touch affected panels
- preserve panel IDs and count
- prefer deletion or uncertainty downgrade over invented detail
- return `null` on malformed output instead of risking silent corruption

- [ ] **Step 6: Integrate the factual gate into `taskLifecycle.ts`**

After the existing validator/repair loop:
- run `reviewPanelClaims(script, task.factPack)`
- if status is `repair_required`, run `repairAccuracyIssues()` and re-review
- if status is `blocked`:
  - set `task.status = "failed"`
  - set `task.error = "高风险事实冲突，脚本未通过准确性校验"`
  - set `task.accuracyErrorSummary`
  - do **not** enter `script_ready`
- if status is `passed`, continue to `script_ready`

Implementation rules:
- cap factual auto-repair to a small bounded round count
- keep existing narrative/style validation and repair behavior
- factual repair runs after ordinary structure repair so it sees the near-final script

- [ ] **Step 7: Extend lifecycle tests for blocked vs repaired vs passed flows**

Add/extend `src/__tests__/taskLifecycle.test.ts` to cover:
- conflicting hard fact causes task `failed` and no `script_ready`
- repairable definition drift triggers one accuracy repair round and then passes
- no-fact issues case still reaches `script_ready`

- [ ] **Step 8: Re-run the accuracy-review and lifecycle tests until they pass**

Run:

```bash
pnpm vitest run src/__tests__/accuracyClaimReview.test.ts src/__tests__/accuracyRepair.test.ts src/__tests__/taskLifecycle.test.ts
pnpm exec tsc --noEmit
```

Expected: PASS.

- [ ] **Step 9: Commit the factual-gate slice**

```bash
git add src/lib/accuracy/claimReview.ts src/lib/accuracy/repair.ts src/lib/client/taskLifecycle.ts src/__tests__/accuracyClaimReview.test.ts src/__tests__/accuracyRepair.test.ts src/__tests__/taskLifecycle.test.ts
git commit -m "feat: add factual review gate for science scripts"
```

---

## Task 6: Expose lightweight accuracy visibility on the result page and pipeline summary

**Files:**
- Create: `src/components/result/AccuracySummary.tsx`
- Modify: `src/lib/pipelineSummary.ts`
- Modify: `src/components/result/PipelineSummary.tsx`
- Modify: `src/app/result/[id]/page.tsx`
- Test: `src/__tests__/pipelineSummary.test.ts`

- [ ] **Step 1: Write failing summary tests for accuracy phases and blocked detail**

Extend `src/__tests__/pipelineSummary.test.ts` to assert:
- research phase shows verified hard-fact count and source-tier usage
- fact-review phase shows `passed` / `repair_required` / `blocked`
- blocked tasks surface a failed phase detail instead of looking like a generic script failure

Suggested assertion:

```ts
expect(getPipelinePhases(task)).toEqual(
  expect.arrayContaining([
    expect.objectContaining({ name: "准确性研究", status: "done" }),
    expect.objectContaining({ name: "事实校验", status: "failed" }),
  ]),
);
```

- [ ] **Step 2: Run the pipeline summary test and verify failure**

Run:

```bash
pnpm vitest run src/__tests__/pipelineSummary.test.ts
```

Expected: FAIL because no accuracy phases exist yet.

- [ ] **Step 3: Add a dedicated lightweight `AccuracySummary` component**

Create `src/components/result/AccuracySummary.tsx` to show:
- verified hard-fact count
- source tiers used
- automatic repair count
- high-risk conflict count when blocked
- a concise expandable risk summary

Rules:
- lightweight only; no full fact graph explorer
- use `task.researchBrief`, `task.accuracyReview`, and `task.accuracyErrorSummary`

- [ ] **Step 4: Extend pipeline summary and result page wiring**

Update `src/lib/pipelineSummary.ts` so the phase list can show:
- `准确性研究`
- `事实校验`
- `事实修复` when a repair round ran

Update `src/app/result/[id]/page.tsx` to:
- render `AccuracySummary` near the existing topic-research disclosure
- show a specific blocked-state banner when `task.accuracyErrorSummary` exists
- keep current result-page behavior for non-science / non-wikipedia tasks unchanged

UX rules:
- do not add an override button in phase 1
- blocked tasks may retry generation after user edits input or provider settings, but cannot bypass the factual gate from the UI

- [ ] **Step 5: Re-run the summary test and build checks**

Run:

```bash
pnpm vitest run src/__tests__/pipelineSummary.test.ts
pnpm exec tsc --noEmit
pnpm build
```

Expected: PASS.

- [ ] **Step 6: Commit the visibility slice**

```bash
git add src/components/result/AccuracySummary.tsx src/lib/pipelineSummary.ts src/components/result/PipelineSummary.tsx src/app/result/[id]/page.tsx src/__tests__/pipelineSummary.test.ts
git commit -m "feat: surface accuracy status on result page"
```

---

## Task 7: Run end-to-end verification on golden topics and update handoff docs

**Files:**
- Modify: `docs/ai/handoff.md`

- [ ] **Step 1: Run the new targeted test suite**

Run:

```bash
pnpm vitest run \
  src/__tests__/accuracyProviderConfig.test.ts \
  src/__tests__/configRoute.test.ts \
  src/__tests__/accuracyProviderRegistry.test.ts \
  src/__tests__/accuracyResearch.test.ts \
  src/__tests__/accuracyClaimReview.test.ts \
  src/__tests__/accuracyRepair.test.ts \
  src/__tests__/contentRegistry.test.ts \
  src/__tests__/taskLifecycle.test.ts \
  src/__tests__/serverDbReviewPersistence.test.ts \
  src/__tests__/pipelineSummary.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run the repo-level safety checks**

Run:

```bash
pnpm test
pnpm exec tsc --noEmit
pnpm build
```

Expected: PASS.

- [ ] **Step 3: Manually smoke the golden topics**

Verify these flows in the app:
- `女娲`
- `DNA`
- `牛顿`
- `火药`
- `为什么会打雷`

For each:
- check research summary is visible
- confirm hard facts appear grounded
- trigger at least one provider health check from settings
- confirm a deliberately corrupted script fixture blocks before `script_ready`

- [ ] **Step 4: Update `docs/ai/handoff.md` with shipped architecture and risk notes**

Document:
- new provider platform files
- new task metadata fields
- blocked/repair semantics
- where to configure whitelist domains and provider slots
- remaining follow-ups intentionally deferred

- [ ] **Step 5: Commit verification and doc sync**

```bash
git add docs/ai/handoff.md
git commit -m "docs: update handoff for accuracy closed loop"
```

---

## Implementation notes for the executing engineer

- Keep provider execution server-side. This is the cleanest way to satisfy “do not echo raw keys back into UI after save” without breaking actual provider usage after reload.
- Keep the client-facing settings state sanitized for providers; the UI should rely on `hasApiKey` / masked previews instead of raw secret replay.
- Reuse existing `/api/wikipedia` behavior by extracting shared helpers, not by duplicating Wikipedia fetch logic.
- Preserve the existing `science` topic-research and director-outline steps; the new accuracy phase augments them, it does not replace them.
- Treat missing evidence as a first-class output. Coverage gaps are preferable to fabricated detail.
- Keep factual matching deterministic first. If an LLM is used, it should only help with bounded repair phrasing, never act as the primary truth judge.
- Block only on high-risk hard-fact conflicts. Do not turn every weakly supported explanation into a hard stop.
- `docs/superpowers/` is gitignored in this repo. Use `git add -f` when committing this plan or later edits to it.
