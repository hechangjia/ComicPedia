[根目录](../../CLAUDE.md) > [src](../) > [lib](./) > **VLM Visual Quality Subsystem**

# VLM 视觉质量子系统

## 变更记录 (Changelog)

| 时间 | 操作 | 说明 |
|------|------|------|
| 2026-04-02 | 初始化 | 首次生成模块文档（含 Phase 2 修复流程） |

---

## 模块职责

基于视觉语言模型 (VLM) 对生成的漫画图片进行多维度质量评估、深度诊断和自动/半自动修复。与 `qualityScore.ts`（纯文本评分）互补 -- 本子系统基于像素级视觉分析。

核心文件均位于 `src/lib/` 根目录：
- `vlmScorer.ts` -- 视觉评分
- `vlmDiagnosis.ts` -- 深度诊断
- `vlmDiagnosisState.ts` -- 诊断状态管理
- `vlmRetry.ts` -- Prompt 补丁与修复

---

## 入口与启动

### 自动触发（管线内）
- `taskLifecycle.ts` 在图片生成完成后自动调用 `evaluateVisualQuality()` (vlmScorer)
- 低分面板自动触发 `shouldAutoRetry()` -> `generatePromptPatch()` -> 重新生成

### 用户触发（结果页）
- `useTaskActions.ts` 提供 `runDiagnosis()` 和 `executeVisualRepair()` 入口
- 前端组件：`VisualDiagnosisWorkbench.tsx`、`VisualDiagnosisAuditCard.tsx`

---

## 对外接口

### vlmScorer.ts
- `evaluateVisualQuality(script, llmConfig?)` -- 评估所有面板 + 跨面板一致性
- `resolveImageToBase64(imageUrl)` -- 统一图片 URL 解析
- `callVisionModel(prompt, imageBase64, llmConfig?)` -- 通用 VLM 调用

### vlmDiagnosis.ts
- `runVisualDiagnosis(script, visualScore, llmConfig?)` -- 生成 VisualDiagnosisReport
- 仅对低分或有问题的面板执行深度分析（非全量）

### vlmRetry.ts
- `shouldAutoRetry(panelScore)` -- 判断面板是否需要自动重试
- `generatePromptPatch(panelScore)` -- 从评分 issues 生成 PromptPatch
- `applyPromptPatch(prompt, patch)` -- 将补丁应用到 prompt
- `buildPanelReview(visualScore)` -- 构建面板级 review 投影
- `buildTaskReviewStatus(panelReview)` -- 派生任务级 review 状态

### vlmDiagnosisState.ts
- `markDiagnosisRunning/Succeeded/Failed/Skipped(task)` -- 状态转换
- `invalidateDiagnosis(task)` -- 标记诊断过期
- `deriveDiagnosisStaleness(task)` -- 检测面板变更导致的过期

---

## 关键依赖与配置

- 通过 `/api/llm` 代理调用 VLM（GPT-4o Vision / Claude Vision / Qwen-VL）
- 图片通过 `resolveImageToBase64()` 统一解析为 data URI 后发送
- 不需要额外的 API 路由或配置 -- 复用 LLM 配置

---

## 数据模型

### VisualQualityScore（评分）
```
overall: number
panels[]: PanelVisualScore {
  panelIndex, textImageAlignment, styleAdherence,
  artifactScore, compositionQuality, overall, issues[]
}
crossPanelConsistency?: number
retryRecommendations[]: { panelIndex, reason, suggestedFix }
```

### VisualDiagnosisReport（诊断）
```
panels[]: VisualDiagnosisPanel {
  panelIndex, imageUrl, promptSnapshot,
  status: "clean" | "issues_found" | "uncertain",
  issues[]: { issueType, severity, affectedDimensions[], evidence, confidence, actionability }
  repair: { recommendedMode: patch|rewrite|manual, suggestedPrompt?, patchPositive?, patchNegative? }
}
summary: { problemPanelCount, highSeverityCount, actionableCount }
```

### PromptPatch（修复补丁）
```
positive: string[]  // 追加到 prompt 末尾
negative: string[]  // 追加到 negative prompt
```

---

## 修复流程

### 自动修复（Phase 2.6）
1. `evaluateVisualQuality()` 返回评分
2. 对每个面板检查 `shouldAutoRetry()` -- 阈值判断
3. `generatePromptPatch()` -- 基于 issue keywords 的规则映射
4. `applyPromptPatch()` -- 追加修正词到 prompt
5. 重新生成图片（每面板最多 1 轮自动重试）

### 手动修复（Phase 4.1）
1. 用户在 VisualDiagnosisWorkbench 查看诊断报告
2. 选择 patch / rewrite / batch_patch 模式
3. **patch**: 直接应用建议补丁，自动重生图
4. **rewrite**: 弹出确认对话框，可编辑 suggestedPrompt，确认后重生
5. **batch_patch**: 批量选择多个面板，一次性 patch + 重生

### 修复后行为
- 只自动重跑 visual score（不自动重跑 diagnosis）
- Diagnosis 标记为 stale
- 若修复后评分未提升：保留新图，显示"未改善"反馈，不回滚

---

## 测试与质量

- 6 个测试文件覆盖诊断、状态、重试、修复流程和 UI 组件
- 核心逻辑（vlmRetry）是纯规则映射，可确定性测试

---

## 常见问题 (FAQ)

**Q: vlmRetry 为什么不用 LLM？**
A: 设计原则与 scriptValidator 一致 -- 修复补丁基于 issue keyword -> prompt patch 的规则映射，零 LLM 调用，零成本，零幻觉风险。

**Q: 诊断过期 (stale) 是如何检测的？**
A: `deriveDiagnosisStaleness()` 比较每个诊断面板的 `imageUrl` 和 `promptSnapshot` 与当前面板值，任一变化即标记 stale。

**Q: VLM 评分失败会阻塞管线吗？**
A: 不会。VLM 评分是 best-effort 的，失败后跳过评分和自动重试，任务仍然进入 completed 状态。

---

## 相关文件清单

| 文件 | 说明 |
|------|------|
| `src/lib/vlmScorer.ts` | VLM 视觉评分（含 base64 解析、prompt 构建、VLM 调用） |
| `src/lib/vlmDiagnosis.ts` | 深度视觉诊断（结构化 issue 提取 + 修复建议生成） |
| `src/lib/vlmDiagnosisState.ts` | 诊断生命周期状态管理 |
| `src/lib/vlmRetry.ts` | Prompt 补丁系统（ISSUE_PATTERNS 规则映射） |
| `src/lib/client/taskLifecycle.ts` | 管线集成点 |
| `src/hooks/useTaskActions.ts` | React Hook 集成点 |
| `src/components/result/VisualDiagnosisWorkbench.tsx` | 诊断工作台 UI |
| `src/components/result/VisualDiagnosisAuditCard.tsx` | 单面板诊断卡片 |
| `src/components/result/VisualDiagnosisPromptDiff.tsx` | Prompt 差异展示 |
| `src/components/result/VisualRewriteConfirmDialog.tsx` | Rewrite 确认对话框 |
| `src/components/result/QualityScorePanel.tsx` | 质量评分展示 |
