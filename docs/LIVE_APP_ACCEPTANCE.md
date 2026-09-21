# 本地模型应用全链路验收（2026-09-21）

状态：本批验收完成；本文件仅覆盖一格原创小说场景，不替代全面重构完成审计。

## 隔离和调用范围

- 使用用户授权的 localhost:8317、gpt-5.6-luna、gpt-image-2。没有猜测其他平台的模型身份或兼容性。
- 生产服务端口 18340，数据目录 `.codex/live-app-2026-09-21/runtime-data`；原始 data 不参与。临时导出捕获端口 18341，仅绑定 loopback 且仅允许本机 QA origin。
- 三个角色配置通过实际配置 API 保存，GET 返回空 apiKey + hasApiKey。配置仅位于隔离数据库，结束时清除并检查残留；证据不保存凭据。
- 浏览器小说表单输入原创机器人读绘本片段，1 格、快速质量、先审分镜、并发 1、关闭自动轻量检查，避免多图和重复评审费用。
- 作品 ID `dbb75e99-17f9-46d5-af5a-f746e6cede24`，模型生成标题“叶形相遇”。

## 已观察结果

- 模型发现 HTTP 200，两模型均列出。设置保存 HTTP 200，浏览器获得脱敏配置。
- 浏览器 POST /api/tasks HTTP 200，包含配置 ID/角色和参数，不含 API Key。
- 分镜达 script_ready / 30%，实际 1 格。脚本流程发生一次修复阶段；快速模式并不保证只有一次文字调用。没有人为替换模型生成的脚本。
- 页面点击“开始生成图片”后，单个 panel_image 作业 attemptCount=1、completed。实际 PNG 3,376,136 bytes、1312×1199，浏览器 decode 成功并显示机器人、绘本与窗边叶子。
- 请求配置是 1024×1024，但本地服务仍返回非正方形；沿用实际尺寸，不把请求参数当作产物尺寸证明。
- 首次页面手动 VLM 评分后，服务端达到 completed / visualDiagnosisState=succeeded，overall=8.5。这个分数是该模型单次判断，不是人工准确性或整体产品质量认证。

## 真实路径暴露并修复的问题

1. **首次评分入口消失**：CompletedView 的 quality tab 仅在已有评分/诊断时显示，关闭轻量检查的作品无法开始首次评审。现在 completed 且有分镜即可显示；暂停评审等中间状态不新增空 tab。
2. **重复出图操作栏**：ScriptReadyView 和父 ResultPage 同时挂载 StickyActionBar。移除子视图中的重复实例，父视图唯一负责。原来的单按钮测试没有 script，未覆盖真实子视图；现已补齐真实脚本 fixture。
3. **日期被图片引用遍历清空**：normalizeImageRefsToFileRefs 已保留 Date，但 fileRefsToUrls / restoreFileRefs 将 Date 当普通 object 遍历为 {}。补充 Date 直通，覆盖详情三种 withImages 模式、列表、mutation 和嵌套日期。
4. **完成后再次复审不恢复轮询**：useTaskSubscription polling effect 只依赖 taskId，completed 时退出后无法因 deep_review_running 重启。现在依赖状态，停止的旧轮询在 await 后不再写回；补充完成→复审、暂停时旧响应、卸载后响应测试。
5. **后台正在评审但按钮已恢复可点击**：QualityScorePanel 原本只检查启动请求的本地 loading。现在同时读取持久化 visualDiagnosisState=running，避免启动请求返回后呈现空闲按钮。

## 回归证据

- regressions-red.log：首次入口、重复操作栏、日期变换的真实失败。
- regressions-green.log：37 项针对性测试和 typecheck 通过。
- polling-red.log：轮询与运行态 4 项先失败。
- polling-green.log：运行态/轮询测试通过。全量中发现测试动态 mock 重注册不稳定，改为固定模块 mock + 每用例状态注入，不通过禁用产品规则掩盖问题。
- 最终全量日志和重建后的浏览器自动更新、导出产物验收见收尾记录。

## 尚未覆盖

多格、跨格一致性、全部内容类型、断线恢复、取消上游、真正服务端版本冲突、长文本与所有导出变体、完整二进制备份等仍需原目标后续实现/验收。浏览器上重复渲染与日期修复不等同于解决所有并发写回风险。

## 最终验收与边界（2026-09-21）

- **最新全量通过**：151 文件通过 / 1 跳过，**1,117 测试通过 / 1 live 跳过**；typecheck、lint、生产构建均退出 0。唯一最终日志为 `.codex/live-app-2026-09-21/verified-final.log`。中间失败日志保留作审计，不能冒充最终状态。既有 Browserslist / metadataBase / next-start standalone 提醒未处理。
- 真实浏览器刷新最终构建后，“质量评分”入口可用。完成作品点击“运行深入诊断”返回 202 后，浏览器自行 GET 查询并恢复完成展示，无手动刷新参与该次轮询验证。评分按匹配素材/模型的缓存复用，未重复出图。
- **分清评分与诊断**：8.5 分的本例没有低分重试候选，因此默认深入诊断产生空面板报告；不能把空报告当作逐格视觉诊断。另通过真实任务 action API 指定 panelIndices=[0]，仅补做一格 VLM 诊断，结果 succeeded、clean、0 条问题，评分仍 8.5。该定向操作是 API 验证，不声称当前 UI 已有全格诊断选择器。
- 最终页面刷新读取了真实持久化的 clean 报告，正常显示原图尺寸和 8.5 评分，诊断详情没有修复按钮。轮询恢复只覆盖同页状态转换；其他客户端直接发起的任务不会自动让已停轮询的 completed 页面发现变化，跨页同步仍待统一。
- 原始任务 API 日期已恢复为 ISO 字符串：createdAt=2026-09-21T03:37:23.702Z；最终 targeted review 的 updatedAt=2026-09-21T03:57:09.022Z。

### 实际导出产物

所有文件来自生产页面真实导出函数，未用外部脚本重制。为了检查真实 Blob，临时包装 URL.createObjectURL，将同一 Blob 复制到仅本机允许的测试接收器；浏览器原下载路径保留。这里验证的是落盘捕获文件，不宣称系统默认下载目录已验收。

- PNG：1104×1336，2,585,283 bytes；一列/2×，标题、完整面板、中文旁白/场景、署名可见，已用本地图片工具查看。
- PDF：6,082,163 bytes，A4 纵向 2 页（封面 + 单格正文），pypdf strict 读取和 Poppler 两页渲染成功；两页已逐页查看，图片保持比例、中文可读。PDF 是栅格排版，非可检索/可访问文本。Poppler 在此 Unicode 文件名的摘要中显示 file size=0，而实际 stat/pypdf 和渲染均正常，文件大小以 stat 为准。
- Markdown 图片包：3,378,960 bytes；ZIP CRC 通过；README 的 images/panel_01.png 引用存在，图像与生成原图逐字节一致；包含完整旁白、场景与提示词。export.json 的 format=markdown。
- SHA-256、页盒、尺寸和 ZIP 条目详见 artifact-verification.json。产物在 `.codex/live-app-2026-09-21/exports/`，只是发布文件，不是完整恢复备份。

### 安全收尾

- 真实凭据已通过配置 API 的 clearApiKey 显式删除，GET 中三个角色 hasApiKey 均为 false。
- 核对进程命令行后关闭本批 18340/18341；用户 8317 服务保留。独立 SQLite 执行 secure_delete、WAL checkpoint/truncate、VACUUM，integrity_check=ok。
- 对本批全部证据、导出、数据库和辅助文件进行已知凭据字节扫描，命中为 0；cleanup-verification.json 保存无密钥的检查结果。这不等同于磁盘法证级安全擦除。
- 原始 data 仍仅 .gitkeep（448 bytes），git diff --check 退出 0，无 commit/push。所有验收只改动隔离作品，原始作品未参与。

本批实证打通一格原创小说的页面提交 → 真实分镜/脚本修复 → 页面审核出图 → 实际图片读取 → 手动视觉评分 → 出版导出，并通过定向 API 补充真实结构化诊断。**不代表所有内容类型、多格/并发、完整恢复备份或整个重构目标已完成。**
