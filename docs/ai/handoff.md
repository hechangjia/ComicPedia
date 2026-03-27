# Handoff

## 当前目标
- `comic-review-loop` 变更的代码、验证和文档已经收尾，当前仅剩是否归档 change 的流程性动作。
- “允许引导角色”开关已落地，神话/历史题材默认不会再被额外塞进 `explorer / guide / narrator` 这类泛化引导角色。

## 今天已完成内容
- 补强了 automatic visual retry 主路径测试，并按 TDD 修复两个真实问题：
  - retry 失败时恢复原始 `imagePrompt`
  - 正负补丁都已生效时跳过无意义 automatic retry
- 新增 review metadata round-trip 测试，确认 task / character 的持久化字段可安全写回和读回。
- 为科普和 Wikipedia 创建入口新增“允许引导角色”开关，默认关闭：
  - `src/components/ScienceForm.tsx`
  - `src/components/WikipediaForm.tsx`
  - `src/components/GuideCharacterToggle.tsx`
- 将 `allowGuideCharacter` 贯通到：
  - `GenerateRequest`
  - prompt 构建
  - `generationConfig`
  - script regeneration 继承链路
- 在 prompt 层增加显式限制：关闭开关时，science / wikipedia prompt 禁止额外添加讲解员、探索者、旁白型角色。
- 增加轻量兜底清洗：
  - `src/lib/guideCharacterPolicy.ts`
  - 仅清理泛化 guide character，不误伤题材原生人物（如盘古、女娲）
- settings 页新增静态“模型分工”说明。
- 页面级 UI 验证中发现并修复一个真实问题：
  - `/api/tasks` 列表接口原先为了轻量化裁掉了 review 字段，导致 history 卡片虽然定义了 `ReviewBadge`，但实际拿不到 `reviewStatus` / `visualQualityScore`
  - 已修复为保留 history 真正需要的轻量 review 字段：
    - `reviewStatus`
    - `lastReviewAt`
    - `visualQualityScore.overall`
    - `visualQualityScore.retryRecommendations`
    - `visualRetrySummary.status`
    - `visualRetrySummary.finalOverallScore`

## 当前进行中的内容
- 没有进行中的代码工作；当前处于“已验证，可归档/继续人工体验”的状态。

## 剩余工作
- 如果采用 OpenSpec 流程，下一步可归档 `comic-review-loop` change。
- 如果想进一步收紧引导角色策略，可继续扩大兜底词表，覆盖更隐蔽的模型措辞（如 `story host`、`curious presenter`）。

## 关键决策和约束
- 当前主仓库 review 状态模型仍是：
  - `visualQualityScore`
  - `panelReview`
  - `reviewStatus`
  - `lastReviewAt`
  - `visualRetrySummary`
- 不引入另一套 `visualReviewState` / `visualReviewStale` 模型。
- automatic retry 继续保持：
  - 每任务最多 1 次 cycle
  - 最多 3 个 panel
  - retry 后最多 1 次 reevaluation
- 引导角色策略采用“两层防线”：
  - prompt 显式禁止
  - 生成后轻量清洗兜底
- history 列表接口继续保持“轻量返回”，但现在已包含 render review badge 所需的最小字段。

## 重要文件路径
- `src/lib/client/taskLifecycle.ts`
- `src/app/api/tasks/route.ts`
- `src/__tests__/taskLifecycle.test.ts`
- `src/__tests__/tasksRoute.test.ts`
- `src/__tests__/serverDbReviewPersistence.test.ts`
- `src/__tests__/guideCharacterPolicy.test.ts`
- `src/lib/guideCharacterPolicy.ts`
- `src/components/GuideCharacterToggle.tsx`
- `src/components/ScienceForm.tsx`
- `src/components/WikipediaForm.tsx`
- `src/hooks/useContentForm.ts`
- `src/prompts/scriptGenerator.ts`
- `src/prompts/wikipediaGenerator.ts`
- `src/app/settings/page.tsx`
- `openspec/changes/comic-review-loop/tasks.md`

## 当前阻塞和风险
- 没有硬阻塞。
- guide-character 兜底规则当前针对高频词（`explorer / guide / narrator / 知识探索者 / 讲解员`）；如果模型改用更隐蔽的别称，后续可能仍需扩充匹配词表。
- 页面级验证依赖本地已有数据样本；如果要做更高置信度回归，建议后续再加一个端到端测试夹具。

## 下次启动后优先执行的 3 个步骤
1. 决定是否归档 `comic-review-loop` change。
2. 如果继续打磨，引入更多引导角色同义词和反例测试。
3. 如需更强回归保障，补一条真正的端到端 UI 自动化测试。

## 当前验证状态
- 已运行：
  - `pnpm vitest run src/__tests__/taskLifecycle.test.ts src/__tests__/vlmRetry.test.ts src/__tests__/guideCharacterPolicy.test.ts src/__tests__/contentRegistry.test.ts src/__tests__/serverDbReviewPersistence.test.ts`
  - `pnpm vitest run src/__tests__/tasksRoute.test.ts`
  - `pnpm exec tsc --noEmit`
- 已完成页面级验证：
  - `history` 页显示 `待修复 (5)`
  - `result` 页能定位到 `needs_repair` 任务
  - `characters` 页显示 `女娲` 的 `7.7/10` review 状态
  - `/create` 科普创建页能看到“允许引导角色”开关，且默认值为 `false`
- 当前结论：
  - `5.1 / 5.2 / 5.3` 均已完成
  - `comic-review-loop` 代码和文档状态已闭环
