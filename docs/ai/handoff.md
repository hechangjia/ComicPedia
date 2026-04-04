# Handoff

## 当前目标
- 当前活跃任务是 `VLM Diagnosis Repair Flow Phase 2` 的收尾验证，不是继续编码。
- 目标是在真实桌面浏览器完成 Phase 2 手动 QA，确认功能可交付。

## 今天已完成内容
- 重启后按顺序读取并恢复上下文：
  - `~/.claude/CLAUDE.md`
  - 项目 `CLAUDE.md`
  - `docs/ai/handoff.md`
  - 当前任务 plan / design
- 确认当前状态：
  - Phase 2 代码已完成并本地合并到 `dev`
  - 当前没有进行中的代码改动
  - 下一步应做真实浏览器 QA，不应直接继续实现

## 当前进行中的内容
- 无代码实现进行中。
- 待执行真实浏览器手动 QA。

## 剩余工作
- 在真实浏览器验证 4 条用户流：
  - 单格 `patch`
  - 单格 `rewrite`
  - 列表 batch `patch`
  - repair 后 `diagnosis stale` 和“未改善”反馈
- 若 QA 通过：
  - 记录结论
  - 评估是否补 release note / release docs
  - 决定下一阶段优先级
- 若 QA 失败：
  - 回到结果页 repair 链路定位并修复

## 关键决策和约束
- `patch`：
  - 直接覆盖当前 prompt
  - 自动重生图
  - negative prompt 自动 merge + dedupe
- `rewrite`：
  - 必须先弹确认框
  - 可编辑 `suggestedPrompt`
  - 可选是否应用 `suggestedNegativePrompt`
  - 确认后覆盖 prompt 并自动重生图
- repair 后：
  - 只自动重跑 `visual score`
  - 不自动重跑 diagnosis
  - diagnosis 必须保持 `stale`
- 若 repair 后评分未提升：
  - 保留新图
  - 显示“未改善”反馈
  - 不回滚
- Phase 2 范围固定：
  - audit card：单格 `patch` + `rewrite`
  - list：batch `patch`
  - 不做 batch `rewrite`

## 重要文件路径
- `docs/ai/handoff.md`
- `docs/superpowers/plans/2026-03-27-vlm-diagnosis-repair-flow-phase-2.md`
- `docs/superpowers/specs/2026-03-27-vlm-diagnosis-repair-flow-phase-2-design.md`
- `src/components/result/QualityScorePanel.tsx`
- `src/components/result/VisualDiagnosisAuditCard.tsx`
- `src/components/result/VisualDiagnosisWorkbench.tsx`
- `src/components/result/VisualRewriteConfirmDialog.tsx`
- `src/hooks/useTaskActions.ts`
- `src/lib/vlmDiagnosis.ts`
- `src/lib/vlmRetry.ts`
- `src/lib/types.ts`
- `src/lib/server/db.ts`
- `src/app/result/[id]/page.tsx`
- `src/__tests__/visualDiagnosisRepair.test.ts`
- `src/__tests__/VisualRewriteConfirmDialog.test.ts`
- `src/__tests__/VisualDiagnosisWorkbench.test.ts`
- `src/__tests__/useTaskActions.test.ts`
- `src/__tests__/vlmDiagnosis.test.ts`
- `src/__tests__/serverDbReviewPersistence.test.ts`
- `src/__tests__/vlmRetry.test.ts`

## 当前阻塞和风险
- 代码层没有已知阻塞。
- 当前缺口是浏览器级证据，不是构建或测试失败。
- 当前 CLI/headless Chromium 环境不可靠：
  - 本地服务可启动
  - API 注入测试任务可用
  - 但结果页客户端主体 hydration 不稳定，无法作为可信手动 QA 依据
- design 文档头部状态仍写 `awaiting written spec review`，与当前“已开发并合并”状态不完全同步。

## 下次启动后优先执行的 3 个步骤
1. 在真实桌面浏览器打开 `dev` 结果页，跑完 Phase 2 的 4 条交互流。
2. 如果 QA 通过，更新 handoff 并决定是否直接进入下一阶段。
3. 如果 QA 失败，优先检查 `QualityScorePanel`、`useTaskActions`、`VisualDiagnosisWorkbench` 这条链。

## 当前验证状态
- Phase 2 目标测试集：`8 files`, `76 passed`
- 合并后 `dev` 全量测试：`311 passed, 1 skipped`
- 类型检查：`pnpm exec tsc --noEmit` 通过
- 生产构建：`pnpm build` 通过
- 真实浏览器手动 QA：未完成
- headless 浏览器 QA：不作为可信结论
