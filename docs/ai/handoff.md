# Handoff

## 2026-04-09 Promotion Readiness Status

- 当前 HEAD: `60ab9c94dcdf154cc4d070f1ad187738ba58ee27`
- 当前分支: `dev`
- 当前工作区状态: 代码已提交，未跟踪文件只剩用户自己的 `AGENTS.md`

### 这轮最后完成的事情

- Track 1 数据治理已经落地并跑过一次真实清理：
  - `436 auto-delete task(s) removed`
  - `20 origin fixture task(s) removed`
- SQLite 当前只剩 `33` 条任务
- 空白 `Episode / Test` 垃圾历史项已经被清掉
- `神农尝百草` 已确认仍在主库，不在回收站：
  - task id: `264c7dde-27af-48b0-b3ad-3c7f9d49d404`
  - title: `神农尝百草：从传说到医药文明`
  - result url: `/result/264c7dde-27af-48b0-b3ad-3c7f9d49d404`
  - image dir: `data/images/264c7dde-27af-48b0-b3ad-3c7f9d49d404`
- Accuracy provider 配置不再只是“测试可用”：
  - `runAccuracyResearch()` 现在真的会使用 Search / Fetch 槽位
  - 运行时命中链路落在 `factPack.queryPlan.providerExecutions`
  - 结果页 `Accuracy Summary` 会显示实际命中的 provider
- 图片连接测试不再把 HTML 网页误报成成功
  - `https://aiapi.exe.xyz` 的真实 API 根已确认是 `https://aiapi.exe.xyz/v1`
  - `google/nano-banana-2` 当前仍被上游返回 `insufficient_user_quota`
  - 所以不要把它切成默认发布模型，除非额度问题先解决

### 下次启动最短路径

```bash
pnpm install
pnpm dev
```

启动后先看这三个页面：

1. `/settings`
2. `/history`
3. `/result/264c7dde-27af-48b0-b3ad-3c7f9d49d404`

### 下次如果用户再报类似问题

- 历史页又出现空白垃圾卡片：
  - 去 `设置 -> 维护与修复`
  - `扫描任务健康`
  - 看 `autoDelete`
  - 再 `执行自动删除`
- 作品“消失”：
  - 去 `设置 -> 维护与修复`
  - 用 `作品找回搜索`
  - 可按任务 ID、标题或主题搜 SQLite 权威数据
- 用户质疑 Accuracy provider 是否生效：
  - 让他打开任意 `science / wikipedia` 结果页
  - 展开 `Accuracy Summary`
  - 看 `命中链路`
- 用户说图片测试返回 HTML：
  - 先确认 URL 是否是 API 根而不是站点首页
  - 对 `aiapi.exe.xyz`，应使用 `/v1`
  - 如果已是 `/v1`，再看是否是额度不足而不是接口不通

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
