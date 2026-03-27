# Handoff

## 最新进展（2026-03-27 Narrative Beat Plan）

### 当前目标
- `science` / `wikipedia` 的脚本生成已升级为带有 director beat plan 的叙事基线。
- 当前这轮实现已经覆盖：director 数据结构、prompt 注入、validator、repair、以及最小调试观测面。
- 这轮**没有**扩到 provider 配置体系、事实准确性闭环、导出升级或用户可见的节奏选择器。

### 本次已完成内容
- 扩展 `NarrativeOutline` / `PanelBlueprint`，加入：
  - `templateType`
  - `source`
  - `beatRole`
  - `shotIntent`
  - `knowledgeGoal`
  - `intensity`
  - `carryForward`
- 升级 `src/lib/director.ts`：
  - 生成更丰富的 beat-plan 结构
  - 解析并容错新字段
  - `buildOutlineGuidance()` 输出 beat-plan 级指导文本
- `science` / `wikipedia` prompt 现在直接接收 `narrativeOutline`，不再只依赖把 outline 文本拼进 topic。
- `validateScript()` 新增 `science` / `wikipedia` 专属 rhythm 校验：
  - 开场缺少钩子
  - 叙事职责重复
  - 镜头意图重复
  - 缺少强镜头变化（无 `hook-closeup` / `contrast`）
  - 结尾缺少 `reveal` / `aftermath`
  - 单格信息堆积
- `repairScript()` 现在接收 rhythm context，并在 prompt 中明确：
  - validator 结论优先
  - 局部修复优先
  - 尽量保留未受影响面板
- 结果页和 `PipelineSummary` 已能展示 richer outline metadata：
  - `templateType`
  - `beatRole`
  - `shotIntent`
  - `knowledgeGoal`

### 关键文件
- `src/lib/types.ts`
- `src/lib/director.ts`
- `src/lib/llm.ts`
- `src/lib/contentRegistry.ts`
- `src/lib/client/taskLifecycle.ts`
- `src/lib/scriptValidator.ts`
- `src/lib/scriptRepair.ts`
- `src/lib/pipelineSummary.ts`
- `src/prompts/scriptGenerator.ts`
- `src/prompts/wikipediaGenerator.ts`
- `src/components/result/PipelineSummary.tsx`
- `src/app/result/[id]/page.tsx`
- `src/__tests__/director.test.ts`
- `src/__tests__/contentRegistry.test.ts`
- `src/__tests__/taskLifecycle.test.ts`
- `src/__tests__/scriptValidator.test.ts`
- `src/__tests__/scriptRepair.test.ts`
- `src/__tests__/pipelineSummary.test.ts`

### 已完成验证
- `pnpm vitest run src/__tests__/director.test.ts src/__tests__/contentRegistry.test.ts src/__tests__/taskLifecycle.test.ts src/__tests__/scriptValidator.test.ts src/__tests__/scriptRepair.test.ts src/__tests__/pipelineSummary.test.ts`
- `pnpm exec tsc --noEmit`
- `pnpm build`

### 尚未完成 / 明确延后
- `science` / `wikipedia` 的事实准确性闭环还没做
- 用户可见的“叙事节奏”选择器还没做
- VLM 按节奏评审图片还没做
- provider / model 配置体系没有重构
- 导出、分享、角色工作流没有跟着升级

### 当前风险
- rhythm 规则目前主要依赖 outline + 轻规则判断，仍有可能出现“结构合格但观感一般”的情况
- 开场钩子 / 平结尾判断还是启发式规则，后续可能需要更多 golden samples 调校
- 本轮没有跑浏览器级手工 smoke；当前验证主要是单测、类型检查、构建

### 下次启动后优先动作
1. 决定是否把当前实现从 worktree 分支合并回 `dev`
2. 用 2-4 个代表性主题做真实脚本生成比对（如：打雷、彩虹、女娲、DNA）
3. 如果观感明显提升，再决定是否继续做用户可见的 pacing selector
4. 下一独立子课题优先建议做“科普准确性闭环”，而不是继续扩展更多模板

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
