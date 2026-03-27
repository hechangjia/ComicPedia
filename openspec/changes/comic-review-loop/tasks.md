## 1. Task review persistence

- [x] 1.1 Extend task review-related types in `src/lib/types.ts` for `reviewStatus`, `panelReview`, and `visualRetrySummary`
- [x] 1.2 Add helper builders in `src/lib/vlmRetry.ts` for deriving `panelReview` and task-level `reviewStatus`
- [x] 1.3 Persist task review metadata in `src/lib/server/db.ts` round-trip logic

## 2. Comic result review loop

- [x] 2.1 Add score save actions in `src/hooks/useTaskActions.ts` for text and visual review persistence
- [x] 2.2 Update `src/components/result/QualityScorePanel.tsx` to sync cached props, persist scores, and surface retry summary state
- [x] 2.3 Update `src/components/result/PanelGrid.tsx` to display per-panel review badges and score summary
- [x] 2.4 Wire review metadata through `src/app/result/[id]/page.tsx`
- [x] 2.5 Refactor `src/lib/client/taskLifecycle.ts` to run a single bounded automatic retry cycle followed by one re-evaluation

## 3. Character review persistence

- [x] 3.1 Extend character persistence in `src/lib/types.ts` and `src/lib/server/db.ts` for visual review metadata
- [x] 3.2 Update `src/app/characters/page.tsx` to persist character visual scores and re-evaluate after repair
- [x] 3.3 Update `src/components/CharacterCard.tsx` to display character review state

## 4. Visibility surfaces

- [x] 4.1 Update `src/app/history/page.tsx` to show lightweight review summary badges from persisted task review data
- [x] 4.2 Update `src/app/settings/page.tsx` to show static model responsibility guidance for LLM, image generation, and VLM

## 5. Verification

- [x] 5.1 Verify persisted review metadata survives task and character reload round-trips
- [x] 5.2 Verify automatic retry remains bounded to one cycle and at most three panels
- [ ] 5.3 Verify result, history, and character surfaces render consistent review state from persisted data
