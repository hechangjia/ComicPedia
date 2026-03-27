# Handoff

## 当前目标
- 稳定并评估 `science` / `wikipedia` 的第一版“科普准确性闭环”。
- 下一次会话优先做真实 golden topics 冒烟，不再先扩新功能。

## 今天已完成内容
- 落地 accuracy provider 配置与服务端 health check：
  - settings 页新增 provider registry、search/fetch slots、whitelist domains
  - `/api/config` 已支持 provider secret redaction / preserve-on-edit
- 落地 layered research：
  - Wikipedia anchor
  - whitelist expansion
  - open-web fallback
  - 输出 `FactPack` / `ResearchBrief`
- 落地 scripting 事实约束：
  - `science` / `wikipedia` prompt 接入 `FactPack`
  - `taskLifecycle` 在 scripting 阶段调用 accuracy research
  - `factPack` / `researchBrief` 持久化到 task metadata
- 落地 factual safety gate：
  - deterministic claim review
  - factual repair
  - `blocked` 时直接 `failed`，不进入 `script_ready`
- 落地结果页轻量可见性：
  - `AccuracySummary`
  - `PipelineSummary` 新增 `准确性研究` / `事实校验`
- 补强 deterministic factual guard：
  - `claimReview` 新增括注别名清洗
  - 支持 `起源于` / `源于` 地点识别
  - 事件归因支持人名全称/简称别名匹配
- 补强 anchor hard fact 抽取：
  - `research` 现在可从 anchor 摘要提取基础 `person` / `place` / `event`
- 新增 golden-topic 自动回归种子：
  - `女娲`
  - `DNA`
  - `牛顿`
  - `火药`
  - `为什么会打雷`
- 更新 handoff 文档到当前状态。

## 当前进行中的内容
- 无进行中的代码改动。
- 当前停在“deterministic 闭环进一步补强、待真实主题冒烟”的状态。

## 剩余工作
- 真实 golden topics 冒烟：
  - `女娲`
  - `DNA`
  - `牛顿`
  - `火药`
  - `为什么会打雷`
- 根据真实冒烟结果继续补强 deterministic extraction / normalization：
  - 英文术语的更复杂同位语/括注
  - 地点层级与别名归一
  - 非 `由…提出` 句式的事件归因
  - 更长科学机制句的术语对齐
- 根据 golden topics 结果决定下一优先级：
  - VLM “看对路”
  - 导出质量升级
  - 角色工作流增强

## 关键决策和约束
- phase 1 仅 `science` / `wikipedia` 使用 accuracy provider 平台。
- provider 调用和 health check 都在服务端执行；前端不回显 raw `apiKey`。
- whitelist domains 完全由用户配置决定；未配置时直接跳过 whitelist 层。
- `blocked` 语义已经固定：
  - task `failed`
  - 不进入 `script_ready`
  - 写入 `accuracyErrorSummary`
  - phase 1 没有 override 按钮
- 当前 claim review 是“确定性最小集”，不是完整事实语义理解器。
- `pnpm exec tsc --noEmit` 需在 `pnpm build` 之后串行运行；并发时可能因为 `.next/types` 尚未生成而报 `TS6053`。

## 重要文件路径
- `src/lib/types.ts`
- `src/lib/accuracy/providerConfig.ts`
- `src/lib/accuracy/providerRegistry.ts`
- `src/lib/accuracy/providerClients.ts`
- `src/lib/accuracy/research.ts`
- `src/lib/accuracy/claimReview.ts`
- `src/lib/accuracy/repair.ts`
- `src/lib/server/wikipedia.ts`
- `src/lib/server/db.ts`
- `src/lib/client/taskLifecycle.ts`
- `src/lib/contentRegistry.ts`
- `src/lib/llm.ts`
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
- `docs/superpowers/specs/2026-03-27-science-wikipedia-accuracy-closed-loop-design.md`
- `docs/superpowers/plans/2026-03-27-science-wikipedia-accuracy-closed-loop.md`

## 当前阻塞和风险
- 无硬阻塞。
- 当前 deterministic matcher 已覆盖日期/数字/基础术语/基础地点/基础归因，但仍不是完整语义匹配器。
- `FactPack` 事实抽取仍是启发式；复杂长文本、跨句推理、别名层级仍可能 coverage 不足。
- provider clients 目前是 MVP 接法，还没做细粒度 provider-specific error taxonomy。
- 尚未做浏览器级或真实 provider-backed golden-topic 冒烟，现阶段结论仍主要来自自动化验证。

## 下次启动后优先执行的 3 个步骤
1. 跑 5 个 golden topics 的真实生成回归，重点看 `blocked / repair_required / passed` 是否符合预期。
2. 针对真实冒烟暴露的问题补强 extraction / normalization，优先地点别名、英文术语括注、复杂归因句式。
3. 如果 golden topics 表现稳定，再决定是否进入下一优先级模块，而不是继续打磨当前闭环细节。

## 当前验证状态
- accuracy 目标测试矩阵：
  - `10 files / 64 tests passed`
- `pnpm build`：
  - passed
- `pnpm exec tsc --noEmit`：
  - passed（在 `build` 之后串行执行）
