# 诊断工作台状态与修复资格（2026-09-21）

## 范围与根因

延续已批准的全面重构，修复 REVIEW_LIFECYCLE.md 中记录的实际浏览器问题。旧工作台对全部 report.panels 按 severity 排序，统一标注“待修复面板 / 建议先修这格”；单格/批量入口只依据 recommendedMode 与 manual_only 判断。clean、uncertain、过期报告甚至带残留修复数据的记录都可能显示不恰当的执行入口。

本批不改评分数值、不把 clean 等同于达标，不移除独立评分产生的重新生成建议。

## 实现

- 工作台分为发现问题、待人工确认、未发现问题，组内按严重程度排列；选择按钮使用 aria-pressed，保留键盘按钮行为与焦点轮廓。
- 摘要从面板实际状态计算，不盲信历史 summary；空报告有明确提示。这里的“问题”只计 issues_found，与历史持久化 summary 包含 uncertain 的口径分开。
- clean 显示明确的无问题说明与可展开的历史提示词，不显示问题审计、修复建议、raw no_issue_detected 或执行入口。评分仍原样显示并解释两个判断维度不同。
- uncertain 保留证据与待核对建议，但不宣称可直接执行，也不开放修复入口。stale 保留历史资料并要求重新诊断。
- diagnosisRepairPolicy.ts 作为 UI / payload 共用资格判断：必须 issues_found、有问题证据、建议模式匹配、没有 manual_only。批量 patch 进一步限制为全部 apply_directly、无高误判风险。
- 单格 confirm_first / 高误判风险 patch 展示追加与排除内容，执行前使用原生确认框；rewrite 沿用现有确认对话框。取消不发起修复。
- QualityScorePanel 在写入修复开始状态之前核对 stale、当前图片 URL 与提示词快照；批量逐项预检，禁止不符合条件的面板先开始执行。buildDiagnosisRepairExecution 同样拒绝 clean / uncertain / manual_only 等非法输入。
- 运行中禁止同时从工作台启动其他单格/批量修复。二级文字改用既有 text-secondary token，诊断卡的小字、按钮提高可读性与触控高度；不修改全局色彩。

## 验证证据

证据目录 `.codex/diagnosis-ui-2026-09-21/`（忽略目录，不是产品资产）。

- red.log：5 项状态展示回归先失败，既有 7 项通过。
- policy-red.log：新策略模块未实现时测试入口失败（模块缺失，不能当作行为红灯）；后续策略行为测试和既有 payload 测试通过。
- contrast-red.log：可读性/uncertain 标签回归先失败。
- final-focused.log：3 文件 / 35 项通过。
- full-verification.log 为首次全量：1,105 项通过，1 live 跳过，类型/Lint/构建退出 0。
- final-verification.log 为可读性修正后的最终全量，终态见本节后续收尾记录。
- seed-browser：通过生产 API 在独立 browser-data 建立 clean/mixed/stale/empty 四种合成任务。全程没有模型请求，没有真实作品数据。
- 首轮生产浏览器确认混合分组、默认选择真实问题；confirm_first patch 弹出确认框，取消后网络记录只有 GET，未开始修复；390px 暗色断点呈单列布局。
- Chrome 截图工具写入工作区路径被其自身权限拒绝，因此截图以内联工具结果检查，不声称已落盘。

## 边界与后续

- 当前源校验是客户端执行前检查，不是服务端 CAS。相同 URL 字节替换、点击后其他客户端变更、多进程并发仍依赖后续统一服务端修复命令与版本控制。
- 本批不证明真实模型生成、修复效果、即时取消或所有页面无障碍；没有把合成报告当成真实 VLM 质量证据。
- 独立视觉评分的“一键修复”和任务 reviewStatus 与 diagnosis 是不同入口，本批不抹除低分提示。下一阶段需要统一评分/诊断/修复执行生命周期，不只统一文案。
- 原目标中的通用任务版本、备份、完整凭据/连接域，以及用户授权本地模型的应用全链路仍待完成。整体 goal 保持 active。
## 最终收尾

- 最终整链退出 **0**：148 个测试文件通过、1 跳过；**1,106 项测试通过、1 live 跳过**；typecheck、lint、build 通过。日志 final-verification.log。既有 Browserslist、metadataBase 警告仍在。
- 最终构建浏览器复核：1366px 亮色与 390px 暗色，页面无水平溢出；二级文字实测分别 rgb(107,101,96) / rgb(158,152,144)。截图以内联工具结果验收，未落盘。
- mixed 任务显示 1 问题 / 1 待确认 / 1 clean；按 Enter 选中待确认面板，aria-pressed 同步，详情无执行按钮或“可直接执行”标签。clean 详情无错误问题标题、raw sentinel 或修复按钮。
- stale 任务保留证据并提示重新诊断，修复按钮为 0；empty 任务显示空记录提示、按钮为 0。
- 合成任务全部位于独立 browser-data；本批没有调用 8317 或其他模型，没有真实图片生成。真实应用全链路仍是后续主线，不以这次界面回归替代。

- 清理复查：已核对命令行后终止本批 QA 18338 服务；该端口无监听，用户 8317 保留。原始 data 仍仅 .gitkeep（448 字节），git diff --check 退出 0，无 commit/push。
