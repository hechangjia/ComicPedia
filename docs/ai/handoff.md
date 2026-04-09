# Handoff

## 当前目标
主线基础设施收敛已经完成到“可继续往上做产品功能”的阶段。当前优先级从结果页/存储一致性收尾，转到继续补 API route 覆盖和后续 accuracy / queue 相关高风险边界。

## 本轮已完成内容
- 完成图片存储路径收敛切片：
  - `/api/save-image` 改为 canonical `data/images + file://` 契约
  - `/api/images/...` 在服务端持久化前会规范化回 `file://...`
  - 客户端图片生成 / VLM retry / 单面板重绘 / 参考图上传统一消费 canonical 返回值
- 收口结果页与 durable queue 一致性问题：
  - `selectedImageId -> imageConfigId -> /api/tasks/[id]/actions` 透传链路补齐
  - Result 页 `viewMode` 抽成纯派生规则，删除 effect 同步 `setState`
  - 单面板重绘和 client phase 出图都保证“图片先落盘，再持久化任务快照”
- 修复严格模式下的构建阻塞：
  - `/api/tasks` DELETE 请求体校验里的 `ids.every(...)` 参数显式标注 `unknown`
- 清理 lint 噪音：
  - `eslint.config.mjs` 已忽略 `.worktrees/`，`pnpm lint` 现在只反映主工作区问题
- 补齐高价值 API route 覆盖：
  - `relations` / `relations/[id]`
  - `wikipedia`
  - `accuracy/providers/test`
  - `accuracy/research`
  - `comfyui`
  - `trash` / `trash/[id]`
  - `series` / `series/[id]` / `series/[id]/arc-snapshots`
  - `backup/export` / `backup/import`
  - `characters` / `characters/[id]`
  - `migrate` / `migrate/image`
  - `image` / `proxy-image`
  - `health` / `models` / `demo/export` / `demo/seed`
- legacy 清理链可见化：
  - `public/output` 历史目录现在会被 `scanOrphanImages()` 和 `/api/cleanup/images` 报告与清理
  - 兼容清理 helper 的受限目录删除调用已修回，`build` 保持通过

## 当前状态
- 当前分支仍是 `dev`。
- 主工作区代码已验证通过；当前未提交内容只剩本地注入的 `AGENTS.md`。
- 存储收敛、结果页一致性、route 覆盖这一轮都已形成提交链，可以直接在此基础上继续。

## 关键决策和约束
- durable queue 的远端图片模型动作必须保留 `imageConfigId`，不能只依赖含 secret 的内联 `imageConfig`。
- `useTaskSubscription` 遇到一次临时空读必须继续轮询，只有确认进入不可恢复失败时才能停。
- 本地单面板重绘与 client phase 自动出图至少要保证“最终图片状态先落盘，再完成任务快照”，否则 Result 页面刷新会出现状态回退。
- Result 页的阅读/编辑/播放模式切换要用纯派生规则收敛，不能再靠 effect 同步改 state，否则很容易重新引入 `react-hooks/set-state-in-effect`。
- 运行时图片持久化的 canonical 模型现在是 `data/images + file://`；`/api/images/...` 仅作为客户端可渲染 URL，不应作为服务端持久化主格式。
- 继续沿用小步修正，只修真实问题，不顺手重构无关代码。

## 重要文件路径
- `src/app/api/save-image/route.ts`
- `src/app/api/images/[key]/route.ts`
- `src/lib/server/imageExtractor.ts`
- `src/lib/client/persistedImage.ts`
- `src/app/api/tasks/route.ts`
- `src/app/result/[id]/page.tsx`
- `src/app/result/viewMode.ts`
- `src/hooks/useTaskActions.ts`
- `src/hooks/useTaskSubscription.ts`
- `src/lib/client/panelManager.ts`
- `src/lib/client/phases/imageGen.ts`
- `src/lib/client/phases/vlm.ts`
- `src/__tests__/panelManager.test.ts`
- `src/__tests__/phasePersistence.test.ts`
- `src/__tests__/resultViewMode.test.ts`
- `src/__tests__/saveImageRoute.test.ts`
- `src/__tests__/imageRefNormalization.test.ts`
- `src/__tests__/relationsRoute.test.ts`
- `src/__tests__/relationByIdRoute.test.ts`
- `src/__tests__/wikipediaRoute.test.ts`
- `src/__tests__/accuracyProviderTestRoute.test.ts`
- `src/__tests__/accuracyResearchRoute.test.ts`
- `src/__tests__/comfyuiRoute.test.ts`
- `src/__tests__/trashRoute.test.ts`
- `src/__tests__/trashByIdRoute.test.ts`
- `src/__tests__/seriesRoute.test.ts`
- `src/__tests__/seriesByIdRoute.test.ts`
- `src/__tests__/backupExportRoute.test.ts`
- `src/__tests__/backupImportRoute.test.ts`
- `src/__tests__/charactersRoute.test.ts`
- `src/__tests__/characterByIdRoute.test.ts`
- `src/__tests__/migrateRoute.test.ts`
- `src/__tests__/migrateImageRoute.test.ts`
- `src/__tests__/imageApiRoute.test.ts`
- `src/__tests__/proxyImageRoute.test.ts`
- `src/__tests__/healthRoute.test.ts`
- `src/__tests__/modelsRoute.test.ts`
- `src/__tests__/demoRoutes.test.ts`
- `src/__tests__/llmStreamRoute.test.ts`
- `src/__tests__/taskActionsRoute.test.ts`
- `src/__tests__/taskByIdRoute.test.ts`
- `src/__tests__/tasksRoute.test.ts`

## 当前阻塞和风险
- 目前无直接阻塞。
- `public/output` 历史目录虽然已纳入清理扫描和 purge API，但中间件对 `/output/` 仍保留兼容放行，是否彻底退场还需单独决策。
- route 覆盖已经大幅前推，但 `accuracy/*` 仍有更深一层的 provider fallback / timeout / partial-failure 组合场景未锁死。
- `llm` 非流式路由目前主要由 `llm.test.ts` 间接覆盖，若继续做 route hardening，可以考虑补单独 route 测试。

## 下次启动优先执行
1. 决定 `public/output` 是否完全退场：
   - 如果确认不再对外暴露旧静态目录，可移除 middleware 对 `/output/` 的兼容豁免，并评估是否删除 legacy 目录本身。
2. 继续补 route 覆盖剩余深水区：
   - 优先 `accuracy/*` fallback/timeout 组合分支，其次单独为 `/api/llm` 做 route 级测试。
3. 如果切回产品功能线，优先结果页和生成链路上层功能；不要回头改已经稳定的存储契约，除非有明确回归。

## 当前验证状态
- 已验证命令：
  - `pnpm vitest run src/__tests__/saveImageRoute.test.ts src/__tests__/imageRefNormalization.test.ts src/__tests__/phasePersistence.test.ts src/__tests__/panelManager.test.ts src/__tests__/tasksRoute.test.ts src/__tests__/taskByIdRoute.test.ts src/__tests__/taskActionsRoute.test.ts src/__tests__/exportImport.test.ts -v`
  - `pnpm vitest run src/__tests__/taskLifecycle.test.ts src/__tests__/useTaskActions.test.ts src/__tests__/resultViewMode.test.ts -v`
  - `pnpm vitest run src/__tests__/relationsRoute.test.ts src/__tests__/relationByIdRoute.test.ts -v`
  - `pnpm vitest run src/__tests__/wikipediaRoute.test.ts -v`
  - `pnpm vitest run src/__tests__/accuracyProviderTestRoute.test.ts -v`
  - `pnpm vitest run src/__tests__/accuracyResearchRoute.test.ts -v`
  - `pnpm vitest run src/__tests__/comfyuiRoute.test.ts -v`
  - `pnpm vitest run src/__tests__/trashRoute.test.ts src/__tests__/trashByIdRoute.test.ts -v`
  - `pnpm vitest run src/__tests__/seriesRoute.test.ts src/__tests__/seriesByIdRoute.test.ts -v`
  - `pnpm vitest run src/__tests__/backupExportRoute.test.ts src/__tests__/backupImportRoute.test.ts -v`
  - `pnpm vitest run src/__tests__/charactersRoute.test.ts src/__tests__/characterByIdRoute.test.ts -v`
  - `pnpm vitest run src/__tests__/migrateRoute.test.ts src/__tests__/migrateImageRoute.test.ts -v`
  - `pnpm vitest run src/__tests__/imageApiRoute.test.ts src/__tests__/proxyImageRoute.test.ts -v`
  - `pnpm vitest run src/__tests__/healthRoute.test.ts src/__tests__/modelsRoute.test.ts src/__tests__/demoRoutes.test.ts -v`
  - `pnpm vitest run src/__tests__/llmStreamRoute.test.ts -v`
  - `pnpm test`
  - `pnpm lint`
  - `pnpm build`
- 覆盖结果：
  - 存储收敛回归：8 个 test files，53 个 tests，全部通过。
  - 结果页 / task action / lifecycle 回归：3 个 test files，35 个 tests，全部通过。
  - 新增 route 覆盖已扩展到 trash / series / backup / characters / migrate / image proxy / system routes / llm-stream。
  - 当前全量测试：101 个 test files 通过、1 跳过；764 个 tests 通过、1 跳过。
- lint/build 状态：
  - `pnpm lint` 退出码 `0`，主工作区无额外 warning。
  - `pnpm build` 退出码 `0`。
