# Handoff

## 当前目标
- 收尾 `comic-review-loop` 变更，补齐文档状态，并完成剩余的 UI 一致性验证。
- 新增“允许引导角色”开关，避免神话/历史题材被默认注入 `explorer / guide / narrator` 这类泛化引导角色。

## 今天已完成内容
- 继续沿用 `systematic-debugging` + `test-driven-development`，先拿到有效 RED 再改生产代码。
- 补强了 `src/__tests__/taskLifecycle.test.ts`，覆盖了 automatic retry 主路径的关键分支：
  - `running` 进入态
  - panel regeneration failure
  - reevaluation failure
  - 至多 3 个 retry candidates
  - successful completion
  - prompt patch no-op skip
- 修复了 `src/lib/client/taskLifecycle.ts` 中两个真实问题：
  - panel retry 失败时会恢复原始 `imagePrompt`，不再留下“旧图 + 新 prompt”的不一致状态
  - 正负补丁都已经生效时会直接 skip automatic retry，不再做无意义重生成
- 新增 server DB round-trip 测试，确认 review metadata 可安全持久化并读回：
  - task: `visualQualityScore` / `reviewStatus` / `panelReview` / `visualRetrySummary` / `lastReviewAt`
  - character: `visualScore` / `reviewStatus` / `lastReviewAt`
- 为科普和 Wikipedia 创建入口新增“允许引导角色”开关，默认关闭：
  - `src/components/ScienceForm.tsx`
  - `src/components/WikipediaForm.tsx`
  - `src/components/GuideCharacterToggle.tsx`
- 将 `allowGuideCharacter` 贯通到 `GenerateRequest`、prompt 构建、task generation config、script regeneration 继承链路。
- 在 prompt 层增加显式约束：
  - 关闭开关时，science / wikipedia prompt 禁止额外添加讲解员、探索者、旁白型角色
  - 优先保留题材原生人物、用户指定角色或纯场景表达
- 新增轻量兜底清洗：
  - `src/lib/guideCharacterPolicy.ts`
  - 若模型仍生成明显的 `explorer / guide / narrator / 知识探索者 / 讲解员` 全局角色，会在脚本落库前剥离
  - 不会误伤 `Pangu` 这类题材原生人物
- 在 settings 页新增静态“模型分工”说明：
  - LLM / 文生图 / VLM 各自职责更清晰

## 当前进行中的内容
- 代码和测试已经完成一轮静态验证，剩下的是 UI 层的一致性确认与文档/提交收尾。

## 剩余工作
- 完成 `5.3`：验证 result / history / character 三个页面是否都基于持久化 review 数据展示一致状态。
- 手工确认“允许引导角色”开关在真实创建流程中符合预期：
  - 关闭时，类似“盘古开天辟地 / 女娲造人”不再混入 explorer 形象
  - 开启时，系统仍可生成引导角色
- 如验证无误，可归档/关闭本次 change。

## 关键决策和约束
- 当前主仓库 review 状态模型仍是：
  - `visualQualityScore`
  - `panelReview`
  - `reviewStatus`
  - `lastReviewAt`
  - `visualRetrySummary`
- 不引入另一套 `visualReviewState` / `visualReviewStale` 模型。
- automatic retry 仍保持：
  - 每任务最多 1 次 cycle
  - 最多 3 个 panel
  - retry 后最多 1 次 reevaluation
- 引导角色策略采用“两层防线”：
  - prompt 显式禁止
  - 生成后轻量清洗兜底
- 兜底清洗只针对泛化 guide character，不应移除题材原生人物或用户显式指定角色。

## 重要文件路径
- `src/lib/client/taskLifecycle.ts`
- `src/__tests__/taskLifecycle.test.ts`
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
- 没有代码层面的硬阻塞。
- `5.3` 仍缺少页面级验证证据；当前主要依赖静态代码检查和 targeted tests。
- 引导角色兜底规则当前针对高频词（`explorer / guide / narrator / 知识探索者 / 讲解员`）；如果模型换一种更隐蔽的措辞，后续可能需要扩充匹配词表。

## 下次启动后优先执行的 3 个步骤
1. 对 result / history / character 页面做一次 UI 一致性验证，并确认 `5.3` 是否可勾选完成。
2. 实测“允许引导角色”开关：用神话/历史题材各跑 1 次关闭态，再跑 1 次开启态。
3. 如果 UI 验证通过，更新 `openspec` / handoff 并归档本次 change。

## 当前验证状态
- 已运行：
  - `pnpm vitest run src/__tests__/taskLifecycle.test.ts src/__tests__/vlmRetry.test.ts src/__tests__/guideCharacterPolicy.test.ts src/__tests__/contentRegistry.test.ts src/__tests__/serverDbReviewPersistence.test.ts`
  - `pnpm exec tsc --noEmit`
- 当前结果：
  - `44/44` tests passing
  - TypeScript 类型检查通过
- 含义：
  - automatic retry 主路径关键分支已被覆盖
  - review metadata round-trip 已验证
  - guide-character policy 已验证
- 尚未验证：
  - 浏览器 / 页面层面的 `5.3`
  - guide-character toggle 的真实端到端交互效果
