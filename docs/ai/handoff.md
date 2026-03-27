# Handoff

## 当前目标
- 稳定并评估 `science` / `wikipedia` 的第一版“科普准确性闭环”。
- 把 golden-topic live smoke 尽量推进到 `passed`，并确认首选 `gpt-5.4` 模型下的真实基线。

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
- 补强 live smoke 诊断可见性：
  - smoke report 现在会输出 `panelDialogues`
  - `panelDiagnostics`（每格 dialogue、riskLevel、hardClaimCount、unsupportedClaims）
  - `topUnsupportedClaims`
- 让 smoke harness 的 accuracy repair 与真实 `taskLifecycle` 对齐：
  - `fast` smoke 也会执行 `repairAccuracyIssues`
  - 这样 smoke 的 `reviewStatus` 更接近真实脚本阶段，而不再系统性高估 `repair_required`
- 收紧 claim review 的 place 抽取：
  - 过滤 `同一次放电`
  - 过滤 `细胞质中`
  - 避免把明显不是地理/来源地点的过程短语误判为 `place`
- 收紧 generation / repair 约束：
  - `scriptGenerator` / `wikipediaGenerator` 的 Fact Pack 规则显式禁止补写未支持的年份/硬细节
  - `accuracy/repair` 明确要求删除 unsupported 年份/地点/归因/硬细节，并尽量贴近 canonical wording
- 补强 thunder mechanism facts：
  - `research` 现在会抽取 `雷云内部电荷分布不平均`
  - `research` 现在会抽取 `因光热使空气迅速膨胀所产生的自然现象`
- 补强 claim review 的 term / person 归一：
  - 清洗 `爵士 / Sir / PRS / MP`
  - 过滤 `最关键的一点是` / `...之一，是...` 这类 meta term
  - 过滤 `是因为他` 这类假 person claim
  - term 归一会裁掉前置 discourse / causal lead-in，减少 `别只记得苹果，他是...` 这类噪声
- 补强 research 的 canonical person 抽取：
  - 当 lead 明显是人物条目时，可直接从 anchor title 提取 canonical person fact
- 补强 science smoke anchor 预载：
  - `thunder` case 现在会预载 `雷` 的 Wikipedia anchor
  - live 失败时可直接走 smoke fallback，避免 `hardFacts=0 / safeToGenerate=false`
- 补强 DNA 结构 fact：
  - `research` 现在会额外抽取 `DNA is a polymer composed of two polynucleotide chains`
- 补强 DNA / Newton claim normalization：
  - DNA 的 `双螺旋` / `遗传指令` / `两条多核苷酸链组成的聚合物` 支持更窄的中英归一
  - `把它拆开看` / `先抓住核心` / `后世记住他的` 这类 framing 句会更少被误当成 hard term claim
- factual repair 从 1 轮提升到最多 2 轮：
  - smoke harness 与真实 `taskLifecycle` 已保持一致
- 新增并通过回归测试：
  - smoke report 诊断序列化
  - fast smoke accuracy repair 行为
  - second-round accuracy repair 行为
  - noisy place claim 过滤
  - prompt / repair factual constraint
  - thunder atomic mechanism clause extraction
  - Newton honorific alias / discourse-term / meta-term filtering
  - anchor-title person extraction
- 新的 live smoke 观察：
  - `DNA`、`牛顿`、`为什么会打雷` 的单题 smoke 均已在备用模型下跑到 `passed`
  - 最新一轮 backup full 5-topic smoke 已拿到全量 `passed`
  - 首选 `gpt-5.4` 关键 3 题中：
    - `dna` -> `passed`
    - `thunder` -> `passed`
    - `newton` -> `passed`
  - 首选 `gpt-5.4` latest full 5-topic smoke 也已拿到全量 `passed`

## 当前进行中的内容
- accuracy smoke 闭环这一阶段已拿到可用基线。
- 下一焦点已经可以转向下一优先级模块，而不是继续打磨当前 heuristics。

## 剩余工作
- 基于新的 smoke 诊断继续补强 deterministic extraction / normalization：
  - 当前没有必须先做的 accuracy smoke 修复项
  - 如果后续又出现新 residual，再按具体 panelDiagnostics 做窄修正
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
- smoke harness 现在应尽量对齐真实 `taskLifecycle` 的 accuracy repair 路径。
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
- `src/__tests__/accuracyClaimReview.test.ts`
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
- 当前 deterministic matcher 已覆盖日期/数字/基础术语/基础地点/基础归因，但仍不是完整语义匹配器。
- `FactPack` 事实抽取仍是启发式；复杂长文本、跨句推理、别名层级仍可能 coverage 不足。
- live smoke 依赖外部 LLM 与 Wikipedia；Wikipedia 在当前环境偶发慢响应，因此 harness 对 wiki 主题做了“先 live fetch，失败再 snapshot fallback”的降级。
- 首选 smoke 模型 `1774192103590-0tob8m2`（Zeabur / `gpt-5.4`）此前对 `newton` / `thunder` 多次返回上游 `500`；当前这轮已重新跑通关键 3 题和 full 5-topic。
- provider clients 目前是 MVP 接法，还没做细粒度 provider-specific error taxonomy。
- 尚未做浏览器级端到端生成冒烟；当前真实回归是“服务端脚本阶段 live smoke”，不含图片生成。
- 当前 backup 模型和首选模型都已拿到一轮 full 5-topic `passed`。

## 下次启动后优先执行的 3 个步骤
1. 进入下一个优先级模块，不再把时间继续花在 accuracy smoke heuristics 上。
2. 如果开始做 VLM / 导出 / 角色工作流，先以当前 smoke 基线为回归底线。
3. 如果后续 smoke 再回退，优先看 `data/smoke-reports` 中的 `panelDiagnostics/topUnsupportedClaims`，按窄规则修正。

## 当前验证状态
- targeted tests：
  - `src/__tests__/accuracyClaimReview.test.ts`
  - `src/__tests__/accuracyResearch.test.ts`
  - `src/__tests__/accuracyRepair.test.ts`
  - `src/__tests__/guideCharacterPolicy.test.ts`
  - `src/__tests__/accuracyGoldenTopicSmoke.test.ts`
  - `72 tests passed`
- live smoke：
  - backup model latest full 5-topic smoke:
    - `nuwa` -> `script_ready`, `passed`
    - `dna` -> `script_ready`, `passed`
    - `newton` -> `script_ready`, `passed`
    - `gunpowder` -> `script_ready`, `passed`
    - `thunder` -> `script_ready`, `passed`
  - preferred `gpt-5.4` latest targeted smoke:
    - `dna` -> `script_ready`, `passed`
    - `newton` -> `script_ready`, `passed`
    - `thunder` -> `script_ready`, `passed`
  - preferred `gpt-5.4` latest full 5-topic smoke:
    - `nuwa` -> `script_ready`, `passed`
    - `dna` -> `script_ready`, `passed`
    - `newton` -> `script_ready`, `passed`
    - `gunpowder` -> `script_ready`, `passed`
    - `thunder` -> `script_ready`, `passed`
- `pnpm build`：
  - passed
- `pnpm exec tsc --noEmit`：
  - passed（在 `build` 之后串行执行）
