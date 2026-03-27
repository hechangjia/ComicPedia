# Handoff

## 当前目标
- 稳定并评估 `science` / `wikipedia` 的第一版“科普准确性闭环”。
- 继续扩大 live golden-topic smoke 覆盖面，并根据真实结果补强 extraction / normalization。

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
- 新增 live smoke harness：
  - `scripts/accuracy-smoke.sh`
  - `src/lib/accuracy/goldenTopicSmoke.ts`
  - `src/__tests__/accuracyGoldenTopicSmoke.live.test.ts`
  - `src/__tests__/accuracyGoldenTopicSmoke.test.ts`
- 已完成 3 个真实 smoke：
  - `DNA`：`finalStatus=script_ready`，不再 `blocked`
  - `牛顿`：`finalStatus=script_ready`
  - `为什么会打雷`：`finalStatus=script_ready`
- 已完成 5/5 全量 live smoke 汇总：
  - `女娲`：`finalStatus=script_ready`
  - `DNA`：`finalStatus=script_ready`
  - `牛顿`：`finalStatus=script_ready`
  - `火药`：`finalStatus=script_ready`
  - `为什么会打雷`：`finalStatus=script_ready`
- 根据真实 smoke 已补强：
  - DNA 长定义句拆分为多条 term hard facts
  - `term` 单 canonical fact 未命中时降级为 `missing`，避免误 `blocked`
  - science 问句主题会先做 Wikipedia 搜索归一，再选更合理的 anchor 词条
  - 中文句首句切分与 `可...` 假事实抽取已修正
  - invention 主题支持 `发明于...中国` 与 `7世纪` 这类 origin-place / century date 抽取
  - myth 主题支持 `成为…人类始祖` / `人首蛇身` 这类 identity term 抽取
  - 问句 topic 的 term facts 已改为使用 canonical subject（例如 `雷`，不再保留 `为什么会打雷`）
  - `女娲` 的弱 myth term 去噪：已过滤 `职业神` / `后世民间信仰中的神祇`
  - `雷` 的 mechanism term 去噪：已过滤 `雷形成的声波` 这类不自然短语
- 更新 handoff 文档到当前状态。

## 当前进行中的内容
- 无进行中的代码改动。
- 当前停在“5 题 live smoke 已跑通，待继续清理噪声 facts”的状态。

## 剩余工作
- 根据真实冒烟结果继续补强 deterministic extraction / normalization：
  - 长词条里的噪声日期 / 噪声地点过滤（`牛顿` / `女娲` 仍有脏 `date/place`）
  - 地点层级与别名归一
  - 非 `由…提出` 句式的事件归因
  - biography / myth 主题的更强 canonical place 收敛
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
- `src/lib/accuracy/goldenTopicSmoke.ts`
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
- `src/__tests__/accuracyGoldenTopicSmoke.test.ts`
- `src/__tests__/accuracyGoldenTopicSmoke.live.test.ts`
- `scripts/accuracy-smoke.sh`
- `docs/superpowers/specs/2026-03-27-science-wikipedia-accuracy-closed-loop-design.md`
- `docs/superpowers/plans/2026-03-27-science-wikipedia-accuracy-closed-loop.md`

## 当前阻塞和风险
- 无硬阻塞。
- 当前 deterministic matcher 已覆盖日期/数字/基础术语/基础地点/基础归因，但仍不是完整语义匹配器。
- `FactPack` 事实抽取仍是启发式；复杂长文本、跨句推理、别名层级仍可能 coverage 不足。
- live smoke 依赖外部 LLM 与 Wikipedia；Wikipedia 在当前环境偶发慢响应，因此 harness 对 wiki 主题做了“先 live fetch，失败再 snapshot fallback”的降级。
- `牛顿` / `女娲` smoke 仍暴露长词条中的噪声 `date/place`；`牛顿` 的 place 仍偏长，`女娲` 的 myth term 仍以首句别名为主。
- provider clients 目前是 MVP 接法，还没做细粒度 provider-specific error taxonomy。
- 尚未做浏览器级端到端生成冒烟；当前真实回归是“服务端脚本阶段 live smoke”，不含图片生成。
- 5 题虽已全部 `script_ready`，但目前都落在 `reviewStatus=repair_required`，还没有达到“高置信 passed”。

## 下次启动后优先执行的 3 个步骤
1. 针对 `牛顿` / `女娲` 的真实结果继续清理噪声 facts，优先长词条脏 `date/place` 过滤。
2. 针对 `牛顿` 的真实结果继续做 canonical place/date 收敛，减少 biography 词条歧义。
3. 如果 golden topics 表现稳定，再决定是否进入下一优先级模块，而不是继续打磨当前闭环细节。

## 当前验证状态
- accuracy 目标测试矩阵：
  - `11 files / 75 tests passed`
- live smoke：
  - `女娲` -> `finalStatus=script_ready`, `reviewStatus=repair_required`
  - `DNA` -> `finalStatus=script_ready`, `reviewStatus=repair_required`
  - `牛顿` -> `finalStatus=script_ready`, `reviewStatus=repair_required`
  - `火药` -> `finalStatus=script_ready`, `reviewStatus=repair_required`
  - `为什么会打雷` -> `finalStatus=script_ready`, `reviewStatus=repair_required`
- `pnpm build`：
  - passed
- `pnpm exec tsc --noEmit`：
  - passed（在 `build` 之后串行执行）
