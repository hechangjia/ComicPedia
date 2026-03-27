# ComicPedia Science/Wikipedia Narrative Beat Plan Design

- Date: 2026-03-27
- Status: Approved in conversation, awaiting written spec review
- Scope: `science` and `wikipedia` script generation only

## 1. Background

ComicPedia already has a usable end-to-end generation loop for science and Wikipedia comics:

- topic input
- script generation
- script validation and repair
- image generation
- visual review and retry

The current user pain point is not primarily model availability or image rendering quality. It is that the default script rhythm often feels too flat: multiple panels serve the same explanatory function, opening panels fail to create momentum, and the finished comic reads more like a segmented explainer than a real comic narrative.

The user wants the default baseline for `science` and `wikipedia` comics to feel more like a comic:

- stronger hook
- more obvious progression
- less repeated panel function
- more visual rhythm

The user explicitly prefers:

- dramatic momentum over purely didactic pacing when the two conflict
- a comic-narrative baseline rather than documentary or infographic baseline
- a balanced reuse of external prompt templates: absorb cut rules, shot-language vocabulary, and light hook/escalation structure, but do not absorb exaggerated web-novel tone

## 2. Product Goal

Upgrade `science` and `wikipedia` script generation from a flat explanatory baseline to a narrative-comic baseline by inserting a lightweight planning layer before script generation.

This planning layer should:

- decide the narrative rhythm before writing the final script
- vary panel function and shot intent across the comic
- reduce repeated “host explaining to camera” panels
- stay compatible with the current validation, repair, image, and review pipeline

## 3. Non-Goals

This change does not attempt to:

- redesign all content types at once
- rebuild the model configuration system for LLM, image, or VLM providers
- solve factual accuracy end-to-end
- redesign export formats or sharing flows
- replace the current `ComicScript` model with a brand-new storyboard system
- import external prompt libraries wholesale

Those can become separate follow-up specs.

## 4. Current-State Findings

### 4.1 The current system already has the right insertion point

The main script path currently runs through:

- `src/lib/client/taskLifecycle.ts`
- `src/lib/llm.ts`
- `src/lib/contentRegistry.ts`
- `src/prompts/scriptGenerator.ts`
- `src/prompts/wikipediaGenerator.ts`

That means ComicPedia already has a clean place to add one planning step before final `ComicScript` generation.

### 4.2 Existing validators do not judge narrative rhythm strongly enough

Current validation logic already checks structural and consistency issues, but it does not strongly enforce:

- opening hook quality
- repeated panel function
- repeated shot intent
- excessive information density per panel

As a result, a structurally valid script can still feel flat.

### 4.3 External prompt files are useful as ingredients, not as drop-in prompts

The user-provided prompt library under `/home/chia/Downloads/提示词/` contains three relevant classes of material:

1. storyboard segmentation rules
2. shot-language and image-prompt vocabulary
3. hook/escalation/reversal structures

These are useful as extracted rules and vocabularies, but not as direct whole-prompt imports because they are optimized for fiction and web-novel promotion rather than science/Wikipedia comics.

## 5. First-Principles Design Decisions

### 5.1 Make rhythm explicit before writing the script

Do not ask one prompt to simultaneously decide:

- what the comic is about
- what each panel must teach
- what each panel visually does
- what the rhythm arc should be

Instead, split the work:

1. infer the narrative shape
2. generate a lightweight beat plan
3. write the final `ComicScript` from that plan

### 5.2 Use semi-adaptive templates, not one rigid template

One fixed “hook -> explain -> explain -> explain -> summary” skeleton will quickly become a new form of monotony.

Instead, use a small number of internal templates that cover common science/Wikipedia rhythms.

### 5.3 Keep the user-facing control simple

The system may use multiple internal templates, but the user should not have to understand all of them.

Expose only a lightweight narrative pacing choice. Keep the template choice internal.

### 5.4 Absorb external prompt material selectively

Absorb:

- cut and segmentation rules
- shot vocabulary
- light hook/escalation/closure structure

Reject:

- sensational web-fiction tone
- exaggerated reversal language
- clickbait framing
- fiction-only preset assumptions

## 6. NarrativeBeatPlan

Introduce a lightweight intermediate artifact named `NarrativeBeatPlan`.

Its purpose is to define what each panel must do before the final script is written.

### 6.1 Responsibilities

For each panel, the plan should define:

- `beatRole`: hook, conflict, reveal, progression, closure, or similar role
- `knowledgeGoal`: the one key thing this panel must make the reader understand
- `shotIntent`: visual intent such as establish, hook-closeup, contrast, process, reveal, aftermath
- `intensity`: low / medium / high rhythmic strength
- `carryForward`: what suspense, question, or implication continues into the next panel

### 6.2 Constraints

The plan must be:

- lightweight enough to generate quickly
- deterministic enough to guide the later script prompt
- compatible with different panel counts
- expressive enough to prevent repeated panel function

### 6.3 Storage Strategy

`NarrativeBeatPlan` should first be treated as a runtime planning artifact.

It may optionally be stored in task metadata for:

- debugging
- review
- regeneration with preserved rhythm

But it should not become a required new first-class persisted domain object in phase 1.

## 7. Internal Rhythm Templates

The system should classify the topic into one of four internal templates.

### 7.1 Mechanism Explanation

For “how does this phenomenon work?” topics.

Default rhythm:

1. surprising or counterintuitive phenomenon
2. failure of naive explanation
3. key mechanism reveal
4. process or causal chain progression
5. observable consequence or memorable takeaway

### 7.2 Mythic / Origin

For mythic and world-origin material such as Pangu or Nuwa.

Default rhythm:

1. cosmic or world-level hook
2. introduction of the central force or being
3. decisive world-changing action
4. resulting order, humans, or transformed world
5. lasting meaning or memory point

### 7.3 Historical Event

For event-driven encyclopedia topics.

Default rhythm:

1. critical moment hook
2. stakes and unstable situation
3. turning point or decisive act
4. spread of consequences
5. historical significance

### 7.4 Person / Discovery

For scientist, inventor, or discovery stories.

Default rhythm:

1. anomaly, obsession, or unresolved problem
2. why old explanation fails
3. attempt / struggle / narrowing in
4. breakthrough
5. world changed by the discovery

### 7.5 Panel Count Adaptation

Use 5 panels as the default conceptual baseline.

Adaptation rule:

- 4 panels: compress middle progression
- 6-8 panels: expand progression and aftermath only
- do not keep adding opening exposition, or the rhythm will flatten again

## 8. Shot-Variation Rules

Rhythm is not enough on its own. The final comic also needs visible shot variation.

### 8.1 Allowed shot intents

Use a small stable set:

- `establish`
- `hook-closeup`
- `contrast`
- `process`
- `reveal`
- `aftermath`

### 8.2 Hard anti-monotony rules

For `science` and `wikipedia` scripts:

1. the first three panels must not repeat the same `shotIntent` consecutively
2. the whole comic must include at least one strong `hook-closeup` or `contrast` panel
3. the final panel should default to `reveal` or `aftermath`, not another generic explanation panel
4. the script must avoid back-to-back “character standing and explaining” panels unless the topic absolutely requires it

These rules are specifically designed to reduce the current flat “segmented explainer” feel.

## 9. External Prompt Material Integration

### 9.1 Storyboard segmentation files

Relevant inputs:

- `/home/chia/Downloads/提示词/分镜/默认.txt`
- `/home/chia/Downloads/提示词/分镜/5秒镜头.txt`

Use them as references for:

- where to split beats
- how to avoid overlong semantic units
- how to treat dialogue/action/scene changes as cut points

Do not import their full output format or fiction-specific framing into ComicPedia prompts.

### 9.2 Shot-language file

Relevant input:

- `/home/chia/Downloads/提示词/图片/通用镜头.txt`

Use it as a source of:

- shot vocabulary
- composition vocabulary
- visual differentiation terms

Do not import its full Midjourney-style, preset-driven, fiction-heavy prompt assumptions directly into science/Wikipedia script prompts.

### 9.3 Hook and escalation files

Relevant inputs:

- `/home/chia/Downloads/提示词/AI助手/爆点澎湃.txt`
- `/home/chia/Downloads/提示词/AI助手/剧情反转.txt`

Use them only as structural inspiration for:

- opening hook shape
- escalation pacing
- closure shape

Do not import:

- web-fiction sensationalism
- clickbait copy
- exaggerated reversal tone

These external files are optional reference inputs, not required runtime dependencies.

For implementation planning, the system should assume:

- extraction happens once during development
- the resulting cut rules, shot vocab, and hook/escalation heuristics are copied into repo-owned prompt or config assets
- generation must not depend on `/home/chia/Downloads/提示词/` being present on any deployment machine

## 10. Pipeline Integration

The recommended integration path is:

1. topic or Wikipedia content enters generation flow
2. system classifies the topic into one internal rhythm template
3. system generates `NarrativeBeatPlan`
4. `scriptGenerator` or `wikipediaGenerator` receives the plan and writes the final `ComicScript`
5. current validation, repair, image generation, and visual review continue as usual

This means the architecture evolves from:

`topic -> prompt -> ComicScript`

to:

`topic -> NarrativeBeatPlan -> prompt(with beat plan) -> ComicScript`

The key design requirement is compatibility with current downstream systems.

## 11. Validation and Repair Changes

Current validators should be extended with rhythm-enforcement checks specific to `science` and `wikipedia`.

### 11.1 New validation categories

1. **Missing Hook**
   The first one or two panels fail to create a meaningful narrative pull.

2. **Repeated Panel Function**
   Consecutive panels do the same explanatory job instead of progressing.

3. **Repeated Shot Language**
   Consecutive panels use overly similar visual intent or composition purpose.

4. **Information Overload**
   A single panel tries to carry too many concepts or conclusions at once.

### 11.2 Repair strategy

Do not rewrite the entire script for every rhythm warning.

Repair should be local:

- hook issue -> rewrite panel 1-2 only
- repeated function -> rewrite the repeated segment’s weaker panel
- repeated shot language -> rewrite scene/imagePrompt direction for the affected panel
- information overload -> split or redistribute the panel’s knowledge payload

The system should preserve already-good panels whenever possible.

## 12. User-Facing Product Surface

Final product target:

Expose one lightweight narrative pacing control for `science` and `wikipedia`:

- `稳妥讲解`
- `漫画叙事`
- `强冲突开场`

Default recommendation: `漫画叙事`

Internal rhythm-template selection remains automatic.

The result page may optionally show lightweight explainability metadata such as:

- selected pacing mode
- inferred rhythm template
- rhythm validation status

This makes the feature feel like a real product capability instead of invisible prompt magic.

Phase-1 clarification:

- phase 1 may compute and persist pacing/debug metadata internally without exposing a new user control
- the visible pacing control is a phase-2 surface unless implementation planning explicitly decides the UI is cheap enough to include in the same release
- planning should treat the director layer itself as the required scope, and the visible pacing selector as optional for the first implementation slice

## 13. Error Handling and Fallbacks

If `NarrativeBeatPlan` generation fails:

- fall back to the current direct script-generation path
- mark the run as using legacy rhythm generation
- avoid blocking the user entirely

If template classification is uncertain:

- default to the closest conservative template
- do not attempt “fully dynamic custom rhythm generation” in phase 1

If validation detects rhythm warnings after beat-plan generation:

- run targeted repair before continuing downstream
- do not silently accept obviously flat scripts as “good enough”

## 14. Rollout Strategy

Phase 1:

- enable for `science` and `wikipedia` only
- keep the feature internally observable
- retain rollback path

Phase 2:

- expose the lightweight pacing control to users
- keep internal template choice automatic

Phase 3:

- evaluate whether similar planning should extend to other content types

## 15. Verification Plan

This feature should be verified at three levels.

### 15.1 Golden-sample comparison

Use representative topics such as:

- mythic: Pangu, Nuwa
- mechanism: thunder, rainbow, seasons
- historical event: gunpowder, printing, moon landing
- discovery/person: Newton, Darwin, Zhang Heng

Compare old and new generated scripts for:

- opening pull
- panel differentiation
- progression clarity

### 15.2 Rule-level automated tests

Add tests for:

- missing hook detection
- repeated `beatRole` detection
- repeated `shotIntent` detection
- information overload detection
- template selection and panel-count adaptation

### 15.3 Human evaluation

Use focused questions rather than generic taste questions:

- does panel 1 make me want to keep reading?
- do panels progress rather than restate?
- does the comic feel like a narrative rather than a segmented explainer?
- is the knowledge still understandable?

## 16. Success Criteria

This change is successful if, for `science` and `wikipedia` comics:

- openings are more compelling
- repeated panel roles decrease
- visible shot monotony decreases
- user post-generation manual correction burden decreases
- knowledge comprehension does not degrade materially

## 17. Risks

### 17.1 Over-dramatization

The comic may become more exciting but less trustworthy.

Mitigation:

- keep the “balanced absorption” rule
- forbid sensational fiction tone in science/Wikipedia prompts

### 17.2 Wrong template classification

A topic may be routed to the wrong internal rhythm template.

Mitigation:

- keep template set small
- add fallback behavior
- test with representative topics

### 17.3 Hidden complexity

An extra planning layer can make the system harder to debug.

Mitigation:

- keep `NarrativeBeatPlan` inspectable
- expose lightweight debug metadata where useful

## 18. Open Follow-Ups

These are intentionally deferred to future specs:

- science/Wikipedia factual-accuracy enforcement
- LLM/image/VLM provider strategy redesign
- stronger user-facing storyboard controls
- export upgrades tied to beat structure
- VLM rhythm-aware review after image generation
