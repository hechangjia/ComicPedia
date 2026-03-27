# Handoff

## 最新进展（2026-03-27 Accuracy Closed Loop）

### 当前目标
- `science` / `wikipedia` 现在不只是有 narrative beat plan，而是已经接入第一版“科普准确性闭环”。
- 本轮实现覆盖：
  - accuracy provider 配置与 health check
  - layered research（Wikipedia anchor -> whitelist -> open web fallback）
  - `FactPack` / `ResearchBrief`
  - prompt 事实约束注入
  - panel-level deterministic claim review
  - factual repair + blocked gate
  - 结果页轻量准确性可见性

### 本次已完成内容
- settings 页新增 Accuracy Research Providers 区块：
  - provider registry
  - `primary/fallback search`
  - `primary/fallback fetch`
  - whitelist domains
  - provider health test
- provider secret 处理已经落地：
  - raw `apiKey` 不会从 `/api/config` 回显到前端
  - 编辑 provider 时，空 `apiKey` 表示保留原密钥
  - UI 用 `hasApiKey` / `maskedApiKey` 表示“已有密钥”
- 新增 provider 平台后端：
  - `src/lib/accuracy/providerRegistry.ts`
  - `src/lib/accuracy/providerClients.ts`
  - `src/app/api/accuracy/providers/test/route.ts`
  - 当前支持 `firecrawl` / `tavily` / `custom`
- 抽出共享 Wikipedia server helper：
  - `src/lib/server/wikipedia.ts`
  - `src/app/api/wikipedia/route.ts` 已改为复用它
- 新增 accuracy research agent：
  - `src/lib/accuracy/research.ts`
  - `src/app/api/accuracy/research/route.ts`
  - research 输出：
    - `FactPack`
    - `ResearchBrief`
- `science` / `wikipedia` prompt 已接入 `FactPack`：
  - `hardFacts` 作为强约束
  - `softFacts` 作为解释素材
  - `coverageGaps` 明确为“不要编造 unsupported hard detail”
- `taskLifecycle` 已改为：
  1. 原 topic research / beat plan 继续保留
  2. 在 scripting 阶段加入 accuracy research
  3. 将 `factPack` / `researchBrief` 存入 task
  4. 脚本生成后做 deterministic claim review
  5. `repair_required` 时自动调用 factual repair
  6. `blocked` 时直接终止，不进入 `script_ready`
- 新增 factual safety gate：
  - `src/lib/accuracy/claimReview.ts`
  - `src/lib/accuracy/repair.ts`
  - 当前确定性抽取/匹配已覆盖最小 MVP：
    - 年份 / 日期
    - 数字类（当前测试夹具主要覆盖年龄/数值）
- 结果页新增轻量准确性展示：
  - `src/components/result/AccuracySummary.tsx`
  - `src/lib/pipelineSummary.ts` 新增：
    - `准确性研究`
    - `事实校验`
  - blocked 任务会在 result 页显示明确的高风险事实冲突提示
- SQLite metadata 已 round-trip：
  - `factPack`
  - `researchBrief`
  - `accuracyReview`
  - `accuracyErrorSummary`

### 关键文件
- `src/lib/types.ts`
- `src/lib/accuracy/providerConfig.ts`
- `src/lib/accuracy/providerRegistry.ts`
- `src/lib/accuracy/providerClients.ts`
- `src/lib/accuracy/research.ts`
- `src/lib/accuracy/claimReview.ts`
- `src/lib/accuracy/repair.ts`
- `src/lib/server/wikipedia.ts`
- `src/lib/server/db.ts`
- `src/lib/contentRegistry.ts`
- `src/lib/llm.ts`
- `src/lib/client/taskLifecycle.ts`
- `src/lib/pipelineSummary.ts`
- `src/app/api/config/route.ts`
- `src/app/api/wikipedia/route.ts`
- `src/app/api/accuracy/providers/test/route.ts`
- `src/app/api/accuracy/research/route.ts`
- `src/app/settings/page.tsx`
- `src/components/settings/AccuracyProviderSection.tsx`
- `src/components/settings/AccuracyProviderForm.tsx`
- `src/app/result/[id]/page.tsx`
- `src/components/result/AccuracySummary.tsx`
- `src/prompts/scriptGenerator.ts`
- `src/prompts/wikipediaGenerator.ts`

### 新增测试
- `src/__tests__/accuracyProviderConfig.test.ts`
- `src/__tests__/configRoute.test.ts`
- `src/__tests__/accuracyProviderRegistry.test.ts`
- `src/__tests__/accuracyResearch.test.ts`
- `src/__tests__/accuracyClaimReview.test.ts`
- `src/__tests__/accuracyRepair.test.ts`

### 已完成验证
- accuracy 目标测试矩阵：
  - `pnpm vitest run src/__tests__/accuracyProviderConfig.test.ts src/__tests__/configRoute.test.ts src/__tests__/accuracyProviderRegistry.test.ts src/__tests__/accuracyResearch.test.ts src/__tests__/accuracyClaimReview.test.ts src/__tests__/accuracyRepair.test.ts src/__tests__/contentRegistry.test.ts src/__tests__/taskLifecycle.test.ts src/__tests__/serverDbReviewPersistence.test.ts src/__tests__/pipelineSummary.test.ts`
- 全量测试：
  - `pnpm test`
- 构建：
  - `pnpm build`
- 类型检查：
  - `pnpm exec tsc --noEmit`
  - 注意：这个仓库的 `tsconfig` 依赖 `.next/types`，所以 `tsc` 最稳妥的跑法是放在 `pnpm build` 之后串行执行；并发时可能因为 `.next/types` 尚未生成而报 `TS6053`

### 关键行为与约束
- phase 1 仅 `science` / `wikipedia` 使用 accuracy provider 平台。
- whitelist domains 完全由用户配置决定；未配置时直接跳过 whitelist 层。
- provider health test 和 actual provider usage 都在服务端执行。
- `blocked` 语义已落地：
  - task 不进入 `script_ready`
  - task 进入 `failed`
  - 写入 `accuracyErrorSummary`
  - result 页展示明确错误提示
  - phase 1 没有 override 按钮
- 当前 MVP 的 claim extraction / matching 仍是“确定性最小集”，还不是完整事实语义理解器。

### 当前风险
- 当前 deterministic claim review 还偏保守，主要覆盖日期/数字类强事实；人名、地点、事件归因、术语定义还需要更完整的 extraction / normalization 规则。
- `FactPack` 的事实抽取仍是启发式，不是高置信结构化知识抽取器；对长文本或复杂历史主题的 coverage 还不够稳。
- provider client 现阶段是最小 smoke / MVP 接法，Firecrawl / Tavily 已按官方文档路径接入，但还没做更细的 provider-specific error taxonomy。
- 没有做浏览器级手工 golden topic 冒烟；目前结论主要来自单测、构建、类型检查。

### 明确延后 / 还没做
- VLM 从“看清楚”升级到“看对路”
- 导出质量升级（把 fact metadata 带入导出）
- 角色创作工作流增强
- 重型 panel-by-panel fact review workbench
- 更强的人名/地点/术语定义抽取与 alias normalization

### 最近提交
- `b442c23 feat: add accuracy provider config model`
- `d4b9deb feat: add accuracy provider management`
- `232a619 feat: add layered accuracy research agent`
- `bf6b067 feat: thread fact packs through scripting`
- `d7d3794 feat: add factual review gate for science scripts`
- `b4f33c6 feat: surface accuracy status on result page`

### 下次启动后优先动作
1. 用真实 golden topics 做手工冒烟：
   - `女娲`
   - `DNA`
   - `牛顿`
   - `火药`
   - `为什么会打雷`
2. 补强 claim extraction / normalization：
   - 人名
   - 地点
   - 事件归因
   - 术语定义
3. 如果 golden topics 表现稳定，再继续下一优先级：
   - VLM “看对路”
   - 导出质量升级
   - 角色工作流增强
