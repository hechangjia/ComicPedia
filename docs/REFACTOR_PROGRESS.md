# ComicPedia 全面重构进度

更新：2026-09-21（本机 Asia/Shanghai）
分支：codex/comprehensive-refactor
状态：进行中；基础存储、模型能力测试、配置持久化与配置传输批次已落地，绝非全面重构完成。

## 完整目标及首批状态快照（2026-09-20）

注意：下表与早期批次中的“未实施 / 未改”是当时快照，不是当前结论。后续章节记录了凭据、生成流程、图片队列、导出、脚本/复审生命周期及诊断界面的实际进展；最近一次验证见文末。整体目标仍未完成。

| 目标 | 状态 | 后续验收 |
| --- | --- | --- |
| WebUI 创作工作台、设置、响应式、可访问性 | 未实施 | 桌面/移动端亮暗主题、键盘操作、真实浏览器全流程 |
| 架构分层与单一服务端任务权威 | 部分完成 | 数据路径/连接边界已拆分；配置域、任务领域及提供商边界待重构 |
| 文字/VLM/文生图统一配置 | 部分完成：能力测试、端点归一化、版本化保存、草稿恢复与完整角色配置传输 | 服务端凭据、角色绑定、协议解析、模型能力单独实测、旧配置迁移 |
| localhost:8317 / gpt-5.6-luna / gpt-image-2 | 直接 API 实测通过 | 授权后模型列表、文字、真实视觉输入、出图与生成图复审通过；应用浏览器端到端仍待验证，详见 MODEL_COMPATIBILITY.md |
| 漫画生成向导、预设、恢复/取消/复审 | 未实施 | 完整文字→分镜→图像→VLM 链路和中断恢复 |
| 导出配置与渲染器、完整资源备份 | 未实施 | 参数实际影响 PNG/PDF/ZIP；空目录恢复含图片 |
| 安全、性能、依赖、部署 | 部分完成 | 路径与文件恢复防护已有回归；访问保护、密钥泄漏、SSRF、依赖升级等仍待完成 |

## 已落地的基础改造

1. 数据目录边界：COMICPEDIA_DATA_DIR 用于 SQLite、图片、回收站和 demo seed；默认保持 data。图片新存储引用保持逻辑 data/images/...，不暴露临时绝对路径。
2. 显式数据库连接生命周期：可关闭 singleton；连接注册表跨模块重载保留所有权，清理前关闭句柄。
3. 测试隔离：每文件独立临时数据库，不继承真实数据目录；修复 Windows EBUSY。live smoke 改为显式私有 JSON 配置，不直接读取运行时数据库。
4. 媒体路径边界：写入前校验标识和路径；严格子路径检查；拒绝 junction/符号链接；API registry 二进制读取与直接读取使用相同路径策略。
5. 缓存一致性：不保留缺图负缓存；写入、删除、回收站操作失效已有缓存；缓存命中仍检查目标存在和边界。
6. 删除恢复：批量删除验证全部 ID、忽略不存在/重复任务、保留完整元数据；单项删除先安全转移图片，再删除任务。canonical 与 task_ 迁移图片组一起预检/移动；恢复支持迁移组。
7. 文件保护：回收站目标冲突拒绝覆盖，跨组移动失败尝试回滚，不再降级成吞错复制/删除。SQL 图片前缀删除使用字面边界而非 LIKE 通配符。
8. 验证补强：新增 pnpm typecheck；修正旧测试的领域类型错配；CI 增加类型检查和 Ubuntu/Windows 矩阵。CI 尚未推送执行。

## 基础改造批次验证证据

命令在临时 Node 20.20.2 / pnpm 9.15.9 下执行，未更改系统默认运行时：

`pnpm test && pnpm typecheck && pnpm lint && pnpm build`

- 全链命令退出码 0。
- Vitest：114 文件通过、1 文件跳过；849 测试通过、1 live smoke 跳过。
- tsc --noEmit：通过。
- ESLint：通过，无本轮新增警告。
- Next 生产构建：通过；仍有已有的 Browserslist 数据过旧和 metadataBase 未配置提醒，不能写成零警告。
- 真实 SQLite + 文件 + API 集成测试覆盖：删除/恢复后重新读取原始 PNG 字节；图片冲突时任务保留；迁移组冲突时 canonical 图片也不移动。
- junction/路径/缓存回归先观察到失败，再修复验证。
- data 目录在测试和构建后仍只有原 .gitkeep；构建用 .codex/refactor-2026-09-19/build-data。
- git diff --check 通过。

日志：.codex/refactor-2026-09-19/foundation-verification.log；TDD 过程记录包含 storage-red.log、media-red.log、media-routes-red.log、media-collision-red.log、delete-order-red.log 等。该目录为忽略的本机验证证据，不会自动进 Git。

## 仍需关注，不能当成已修复

- 配置 GET 的 LLM/VLM/图片密钥已在后续凭据批次脱敏；全面授权保护尚未实施。
- scriptRunner 持有旧任务并 upsert 的删除复活竞态未改。
- Service Worker 对可变图片的旧缓存未改。
- 图片抓取二跳 SSRF、流式大小上限及依赖安全升级未改。
- 整个备份仍未包含所有图片二进制。
- 跨 SQLite 与文件系统事务还未形成完整恢复日志；恢复流程中元数据写入失败后的补偿仍需加强。
- 存储历史 prefix 语义、不同扩展名覆写、完整媒体类型/内容校验需随媒体领域进一步整理，当前回归不是完整安全证明。
- 新 COMICPEDIA_DATA_DIR 不会自动迁移原始绝对路径 registry，已有绝对记录跨根迁移需显式迁移工具。
- Node 24 原生依赖兼容、支持中的运行时与 Next/依赖版本升级待验证；当前 Node 20 仅复现本轮验证环境。

## 下一批实施顺序

1. 模型配置域：服务连接、模型能力、角色绑定与脱敏客户端 DTO；完整追踪 useAPIConfig、API routes、replay/snapshots、导入导出和持久化调用方，不能只在 GET 删 key 导致生成失效。
2. 已完成 localhost 授权与模型能力实测；后续验证应用浏览器内文字→分镜→图像→VLM 的完整流程，并处理服务返回尺寸与请求不一致。
3. 统一生成生命周期和 UI 工作台，再接入可配置导出/完整备份。
4. 全范围验收、浏览器/无障碍/性能、迁移恢复与真实模型端到端；全部满足前不标记 goal complete。

没有创建 commit、推送远端、删除用户数据或安装新项目依赖。

## 模型能力批次（2026-09-20）

- 授权后的本地服务验证通过；密钥未写入源代码、报告或测试文件。
- 设置页区分文字、视觉和出图测试；VLM 必须提交真实红蓝测试图并校验回答，不能复用纯文字 ping。
- 出图测试要求可解码图片，拒绝 HTTP 200 的 HTML、纯文字、空数据或未知响应；显示实际像素尺寸。ComfyUI ping 明确只证明连通性。
- 外部图片引用通过既有 POST /api/proxy-image 下载，不携带模型服务凭据；对象 URL 用后释放。完整 SSRF 与流式限额治理仍未完成。
- 端点归一化复用于设置测试、LLM（含流式）、VLM、图片客户端、服务端图片 runner 和模型发现；根地址补 /v1，已有完整端点/自定义前缀不重复拼接，拒绝 URL 内嵌凭据及查询参数。
- 最新测试：115 文件通过、1 跳过；871 测试通过、1 跳过。类型检查通过。证据在 .codex/model-probe-2026-09-20/runtime-endpoints-green.log。
- 红绿回归证据包含 capabilities-red.log、artifact-proxy-red.log、runtime-endpoints-red.log。真实模型调用与 mock 单测分开记录，不能当成完整应用端到端已通过。
- 最新 ESLint 与生产构建命令退出码 0；日志 final-build.log。保留既有 Browserslist / metadataBase 提醒。测试和构建后 data 仍只有原 .gitkeep；git diff --check 通过（有既有 CRLF 转 LF 提示）。

## 配置持久化批次（2026-09-20）

- 新 configStore 统一编辑、读取与串行写入；useAPIConfig 的 CRUD 回调基于最新 store 快照，不再依赖当前 React render 的旧 config。配置导入连续多次添加和非 Hook 获取当前角色均有集成回归。
- GET /api/config 返回 ETag、no-store；PUT 在归一化前验证 V2 结构、模型/协议、重复 ID 和角色引用，必须 If-Match。缺失版本返回 428，过期版本返回 412；SQLite immediate transaction 内比较与保存，避免跨进程丢失更新。
- 不再使用浏览器与服务器时间戳判断覆盖顺序；HTTP 失败或缺失成功确认不标记保存成功。设置页显示读取中、保存中、已保存、错误与冲突，提供重试和有确认提示的读取服务器版本。
- 每标签页 sessionStorage 草稿与共享 localStorage 缓存分离，原始旧格式缓存在替换前备份。该缓存仍可能含密钥，不是凭据隔离、加密或完整备份。
- 检索服务健康测试只向最新配置中未变化的 provider 写回状态，并使用条件保存；不会用慢请求的旧快照覆盖新模型配置或复活已删除 provider。设置页测试后安全刷新服务器状态，不二次覆盖整份配置。
- 旧数据迁移中的配置写入改为仅允许空服务器，已有配置返回 409，不再绕过新保存边界覆盖。其他作品迁移与备份导入的全面重构尚未完成。
- 最新全量验证：121 测试文件通过、1 跳过；916 项测试通过、1 live smoke 跳过；typecheck、lint、build 通过，全链退出码 0。Node 20.20.2 / pnpm 9.15.9 临时运行时；已有 Browserslist 和 metadataBase 提醒仍存在。
- 浏览器真实验证：无密钥测试模型新增/保存、并发冲突、刷新保留草稿、显式接受服务器版本、断网重试、双标签页刷新不丢草稿。390px 下同步提示无水平溢出；不代表全站移动端验收。
- 使用隔离 browser-data/build-data，运行目录 data 仍只有原 .gitkeep。未追加模型调用，未写入真实服务凭据，未 commit/push。验证日志和浏览器记录在 .codex/config-persistence-2026-09-20/。

### 下一步仍是完整配置域，而不是宣布完成

继续把 Connection / Model / Role binding 与服务端凭据 DTO 接入真实生成请求；配置导入导出已在后续批次覆盖四类配置，默认排除 API 密钥和工作流；详见下节。当前客户端仍保存模型 key，GET 仍返回模型 key，生成请求仍携带具体参数；不要把本批并发保护称为凭据安全已修复。然后继续创作工作台、任务生命周期、漫画导出配置与完整备份验收。

## 配置导入导出批次（2026-09-20）

- configTransfer 领域模块承担有界解析、字段白名单导出、四类配置合并与 ID/角色重映射；UI 不再逐项调用 addLLM/addImage 导致部分导入。useAPIConfig.importArchive 在最新 store 上一次性提交。
- 支持 LLM、VLM、文生图、检索服务、默认模型/检索角色与域名白名单；兼容旧 V1、V2 与此前单类导出。VLM 卡片新增单独导出。
- 默认导出不含 API Key 字段、密钥掩码、历史健康结果、未知扩展或自定义工作流；工作流必须显式勾选且提示潜在内嵌敏感内容。apiKeyFieldsIncluded 不是对任意工作流内容的无密钥保证。
- 导入先预览新增/重复数量和服务地址；旧文件中的密钥与工作流分别默认关闭，确认后才合并。取消/Escape 不保存；现有默认选择和密钥不覆盖，新 ID 不借用本机凭据。字段错误、悬空/错配角色、重复 ID、超过 2 MiB / 每类合计 200 项拒绝整次导入。
- 修复 store updater 抛错仍把草稿标脏的问题；失败合并不发送 PUT。默认排除工作流时的重复比较保持往返幂等，原工作流不被空内容替换。
- 验证：123 测试文件通过、1 跳过；943 项测试通过、1 live smoke 跳过；typecheck/lint/build 全链退出码 0。已有 Browserslist/metadataBase 提醒仍存在。日志 .codex/config-transfer-2026-09-20/final-verification.log。
- 真实浏览器：四类配置预览/取消/确认保存、默认密钥/工作流排除、下载 Blob 内容检查、往返导入不重复且保留现有密钥/工作流、无效文件不改服务器版本、390px 弹窗布局及取消初始焦点。未将 Blob 验证宣称为下载目录文件验收。
- 仅隔离 browser-data/build-data 和合成测试凭据；无模型调用，data 仍只有原 .gitkeep，未 commit/push。规则见 CONFIGURATION_TRANSFER.md；浏览器证据见忽略目录 browser-evidence.md。

### 配置导入导出批次结束时仍未完成的主线

当时服务端模型凭据 DTO、Connection/Model/Role binding 统一存储和角色 ID 请求解析仍未接入（角色 ID 请求解析见下方后续批次）；模型密钥仍会经过 GET 和浏览器运行时，不能将安全导出当作凭据隔离。WebUI 创作工作台、可恢复生成向导、漫画出版导出参数、完整作品备份和全站验收依然属于原目标，未缩小范围、未标记完成。

## 服务端模型引用批次（2026-09-20）

- 已保存配置的 LLM（含流式）、VLM、图片、ComfyUI 浏览器请求改为角色 + ID 引用，服务器解析连接；请求选择器不再向生成调用传递 API key / 工作流。
- 修复图片队列合并旧 overlay 时可能把服务器密钥发送到客户端覆盖地址的问题。新旧任务均只允许画幅和生成参数覆盖，保存的地址/模型/协议/工作流保持服务器权威。
- 新建脚本、重放、图片任务与视觉复审解析显式引用；已删除引用不再悄悄切换到其他配置。历史 replay 中仅保存在 llm/image 子对象的 ID 也保留到执行阶段，防止退回环境默认。
- 主模型 HTTP 请求拒绝重定向；服务端代理不打印上游原始错误文本。
- 合成本地 HTTP 实测覆盖普通文字、流式、视觉角色、图片和 ComfyUI ping；删除引用 404、错误角色 400、重定向拒绝，恶意目标收到 0 请求。未额外消耗真实模型调用。
- 详细边界见 SERVER_MODEL_REFERENCES.md；GET/store/cache 密钥、授权、临时配置兼容接口和完整生成端到端仍未完成，不把本批称为完整安全隔离。
- 没有创建 commit 或 push；完整重构 goal 保持 active。

- 本批最终验证：126 测试文件通过、1 跳过；975 测试通过、1 live 测试跳过；typecheck、lint、生产构建整链退出码 0。最后测试文件仅整理 describe 归属后单独 4 项回归通过。
- 完整证据：.codex/model-references-2026-09-20/final-verification-rerun.log；生产构建后 HTTP 再验证：http-smoke-final.log。data 仍只有原 .gitkeep；git diff --check 通过，临时 HTTP 服务器已退出。
- 保留已有 Browserslist / metadataBase 构建提醒。验证辅助 .cjs 文件曾被 ESLint 误纳入，触发 react-hooks 配置作用域错误；改为不带 JS 扩展名的忽略目录辅助脚本后，原项目 lint 命令复验通过，未通过关闭规则绕过。


## 模型密钥生命周期批次（2026-09-20）

- GET 配置不再返回三个模型角色的实际密钥；同角色 ID 的 PUT 支持保留/替换/显式清除，服务地址或协议变化不能自动携带旧凭据。
- 设置编辑器增加凭据状态与明确清除控件；保存确认后清除已确认的输入，保护更新中的下一次输入；本地无认证图片服务可留空。
- 能力测试及模型发现使用服务端引用，获取列表拒绝改变目标和重定向；带凭据或引用的发现不做长期缓存。
- 新模型 key 不写 localStorage/sessionStorage，刷新后缺失输入明确报错，不静默保存。可解析旧模型缓存备份会在下次写入时去除 key。清除复选框切回保留不丢失缺失输入标记，迁移接口同样拒绝不完整凭据草稿。
- 浏览器实测保留/替换/清除：上游凭据标记依次 original/replacement/none，其他角色未受影响；GET/浏览器缓存无测试 key。保存失败再刷新要求重新输入，服务器未改变；390px 无横向溢出。
- 规则和明确限制见 MODEL_CREDENTIALS.md。认证授权、Accuracy 凭据生命周期、任意工作流内嵌秘密、所有旧缓存清理、完整 Connection/Model/Role 存储迁移、生成工作台及漫画导出仍未完成。
- 本批无真实模型调用、无 commit/push，原 data 目录未改；整体 goal 仍 active。
- 最终整链验证退出码 0：129 测试文件通过、1 跳过；993 测试通过、1 live 测试跳过；typecheck、lint、生产构建通过。保留已有 Browserslist 数据过期、metadataBase 提醒。
- git diff --check 通过；原 data 仍只有 .gitkeep（448 bytes）；临时 QA 端口 18330/18331 已停止监听。日志在 .codex/model-secrets-2026-09-20/final-verification.log。

## 创作预检与入口批次（2026-09-20）

- 五类表单共用生成前检查，默认先审分镜；明确本次模型、格数与视觉回退，配置未同步/选择已删除/格数非法在提交前提示。仅文字模型可先审分镜，连续出图必须配置图片模型。
- 点击时读取最新配置快照，防止同一时刻重复任务创建，失败可重试；高级设置只合并变化字段，预设切换不再冻结旧的停顿策略。
- 修复 mode URL 导致类别切换失效；收拢配置指引与模板入口，保留原有五类内容表单与画室样式。轻量检查关闭时后台不再调用视觉评分器。
- 最终验证：135 文件通过、1 跳过；1,017 测试通过、1 live 跳过；typecheck、lint、生产构建退出码 0。保留已有 Browserslist / metadataBase 提醒。
- 最新生产构建浏览器验证了缺配置阻断、仅 LLM 的分镜入口、非法格数、无 key 的合成提交、失败重试、五类 URL 导航和 390px 暗色无横向溢出。合成提交拦截不会调用真实模型，不能当成生成/导出端到端证据。
- 规则与局限见 CREATION_FLOW.md；日志在 .codex/creation-flow-2026-09-20/。后端真实并发未完成（界面已明示）；服务端统一校验/幂等、完整草稿、恢复取消与导出等主线继续保留，整体 goal 仍 active。无 commit/push。
- 收尾确认：git diff --check 通过；原 data 仍只有 .gitkeep（448 bytes）；隔离 QA 端口 18332 已停止监听。

## 图片队列真实并发批次（2026-09-20）

- 单作品实际启用 1–4 个槽位，按完成补位；旧任务无设置保持串行，ComfyUI 校准前单张。设置页面不再声称并发尚未生效。
- 分离单分镜执行与调度，队列汇总等待后读当前任务，视觉评分只合并对应分镜而不覆盖整份旧快照。
- 暂停停止派发、已派发请求完成后保存；Comfy 远程等待超时保留 prompt ID 并停止追加请求。正在执行的分镜不能被重新入队覆盖，接口返回 409。
- 修复图片写入期间删除导致 jobs 复活，以及图片生成失败后面板停留 generating 的问题；原有成功图重绘失败仍保留。
- 实际 HTTP + SQLite + 图片文件集成验证了并发乱序保存、独立 DB 读取、暂停恢复、等待期间删除。只用固定合成 PNG，不涉及真实模型调用，不是内容生成/导出端到端验收。
- 全量测试 136 文件通过、1 跳过；1,031 测试通过、1 live 跳过；typecheck、lint 通过。执行规则和未完成边界见 IMAGE_QUEUE_EXECUTION.md；日志在 .codex/image-concurrency-2026-09-20/。
- 全局并发预算、跨进程协调、真正远程取消、其他 runner 的恢复删除、完整草稿/出版导出/备份仍属原目标，未缩小范围，goal 保持 active。无 commit/push。
- 图片队列批次补充收尾证据：生产构建退出码 0，git diff --check 通过，原 data 仍只有 .gitkeep（448 bytes）。

## 出版导出选项批次（2026-09-20）

- PNG/PDF/ZIP/Markdown 图片包接到统一 ExportOptions 和生成前检查，显式选择分镜/缺图策略/文字/署名；PNG 列数与倍率、PDF 纸张方向/布局/DPI/边距/封面参数实际传入渲染器。
- 原生导出设置 dialog 提供格式相关选项、PNG 整图/PDF 首页实际排版预览、错误与忙碌反馈，不再以静默跳过失败图片的文件冒充完整成功。
- PNG/PDF 图片按比例放入；图片包校验 HTTP/MIME/读取预算，保留原始编号和正确扩展名，包含选项与输出清单。增加单画布及 PDF 总渲染预算。
- 全量 140 测试文件通过、1 跳过；1,042 测试通过、1 live 跳过；typecheck、lint 通过。真实浏览器 Blob 生成后经本机接收器落盘，PDF 两页用 Poppler 渲染查看、PNG 成图检查、ZIP CRC/清单/内容检查通过；无真实模型调用。
- 390px 暗色对话框无横向溢出；模拟图片 404 显示错误且没有新增下载 Blob。并未据此宣称已检查用户下载目录或所有格式完成。
- 详细规则/证据/限制见 PUBLICATION_EXPORT.md。专用格式、完整备份恢复、多页预览、细粒度进度取消、真实生成至导出全链路等继续属于原目标，goal 保持 active；无 commit/push。

- 最终构建与确认：生产构建退出码 0；最新 A4 含封面 PDF 为 2 页、595.28×841.89 pt，两页渲染检查通过；已有署名初始值、Escape 关闭后下载按钮焦点复验通过。日志见 export-options-2026-09-20/final-build.log。
- 导出批次收尾：git diff --check 通过，原 data 仍只有 .gitkeep（448 bytes）；临时 QA 服务及文件接收器端口 18334/18335 已停止。

## 专用出版格式批次（2026-09-20）

- 小红书长图/分页与视频 JSON/TXT/ZIP 接入统一 ExportOptions/对话框；固定分页 3:4、1080/1440 宽度，图片保留比例，文字超预算报错；长图如实标注可变高度。
- 纯视频脚本无需完成图片；可选画幅、估算/固定时长。参考图包读取本地图片，正确区分 PNG/JPEG，脚本指向包内素材，保留原分镜编号；明确未验证第三方平台兼容。
- 复制长图/Web Share 共用受检渲染器，失败不静默漏图；分享卡片仍另行实现。
- 全量 142 测试文件通过、1 跳过；1,051 测试通过、1 live 跳过；typecheck、lint、生产构建整链退出码 0。日志在 .codex/specialized-export-2026-09-20/full-verification.log。
- 实际浏览器生成分页 ZIP 与视频参考图 ZIP 后，通过本机接收器检查：CRC 正常、3 张 1440×1920 分页图，横竖画面四边保留；视频包选择第 2/3 格，9:16、7 秒/段共 14 秒，包内引用与图像格式正确。
- 复制与分享入口生成实际 PNG，但系统剪贴板/分享 API 被测试函数替代，没有触碰用户剪贴板或实际系统分享；390px 暗色对话框无横向溢出。未把 Blob 检查描述为用户下载目录验收。
- 细节与剩余限制见 SPECIALIZED_EXPORT.md；没有真实模型调用、没有 commit/push；整体 goal 保持 active，完整备份/生命周期/服务端授权/真实生成到导出等原范围未缩小。
- 收尾确认：git diff --check 退出码 0；原 data 仍仅 .gitkeep（448 bytes）；只停止本批已核实的 QA 进程，18336/18337 已无监听。

## 脚本执行生命周期批次（2026-09-20）

- 用真实 SQLite 先复现 5 项失败：删除后复活、删除后降级重试、同 ID 恢复被覆盖、标签丢失、新旧执行倒序覆盖。增加服务端执行 ID，原子认领/读取、UPDATE-only 条件写入与仅释放自身归属，保留重放/标签/收藏/未知 metadata。
- 研究、百科、导演、生成/降级、修复、自动生图交接检查归属；删除或替代后旧执行退出，不再写失败结果。pipelineTrace 落库；移除未使用的旧全量 patchTask helper。
- 真实 HTTP 集成发现服务端流式请求漏 stream:true，且 SSE catch 吞消费者异常；修复两种协议参数和解析器错误/reader 释放边界。不是远程取消功能。
- 专项真实 HTTP/SSE→parser/validator→SQLite 测试验证正常输出、重放信息保留、迟到 200/400 不复活也不发降级请求、未结束流的下一 chunk 使已删除执行退出。
- 同类扫描确认深度复审与通用任务 PUT 仍有旧快照风险，详见 SCRIPT_LIFECYCLE.md；未将局部 fencing 声称为所有任务生命周期完成。没有真实模型调用、没有 commit/push；整体 goal 保持 active。
- 最终整链退出码 0：145 文件通过、1 跳过；1,069 测试通过、1 live 跳过；typecheck/lint/build 通过。日志 .codex/script-lifecycle-2026-09-20/final-verification.log。保留已有 Browserslist/metadataBase 警告；原 data 仅 .gitkeep（448 bytes）。

## 深度复审生命周期与服务端 I/O（2026-09-20 至 2026-09-21）

- 真实 SQLite 先复现 6 失败/1 通过；引入 review/queue 事务转换、作业执行 ID 和结构化输入校验。开始复审、pause/resume/reconcile 不再跨 await 写旧任务；通用恢复 job 不恢复执行权。
- 复审评分/诊断提交前比较来源，缓存包含媒体字节和服务/模型/协议，防止同 URL 换图、切换模型或无版本旧报告混入当前结果；同源定向报告可合并。
- 真实 HTTP 集成证明旧 server VLM 路径未请求上游却可能产生默认 5 分；新增可注入服务端 I/O，读取存储图片、受限直连模型、strict 错误传播，单图 light check 同步接入。
- 成功与失败集成覆盖真实文件、HTTP、多面板/跨面板、定向报告、缓存和事务回滚；没有真实模型调用，不能把合成响应当成模型能力认证。范围与边界见 REVIEW_LIFECYCLE.md。
- 尚未完成通用任务 PUT/POST 版本控制、所有 image worker 原子写回、即时远程取消、完整备份、真实模型全链路等原目标。goal 保持 active，无 commit/push。
- 最终整链退出码 0：147 文件通过/1 跳过；1,092 测试通过/1 live 跳过；typecheck/lint/build 通过。生产 API 200/202→completed/succeeded，合成上游真实收到 2 次请求；结果页显示数据库中的评分和诊断。记录在 review-lifecycle-2026-09-20/production-http.json。
- 浏览器发现待办：clean/no_issue_detected 仍出现在“待修复面板”并显示修复优先标签；已记录为下一批 WebUI 语义修正，不把成功 API 路径推广为全界面完成。

- 收尾复查：仅终止本批已核对命令行的 QA 进程（18338/18339），两端口均无监听；用户 8317 服务保留。git diff --check 退出 0；原始 data 目录仍仅 .gitkeep（448 字节）。未 commit/push，整体目标保持 active。


## 诊断工作台状态与修复资格（2026-09-21）

- 修复上一批浏览器发现的 clean 被推荐修复：按 issues_found / uncertain / clean 分组，保留正常报告但不展示修复入口；评分独立保留，不把 clean 当成达标。
- 统一直接/批量资格；uncertain、manual_only、过期、当前素材与快照不匹配不能直接执行；批量限全部 apply_directly 低风险 patch。单格需确认 patch 先展示改动再确认，取消没有修复请求。
- 清理状态文案与暗色低对比度，真实浏览器核对 mixed/clean/stale/empty、1366px 亮色/390px 暗色、键盘 Enter 选择及 aria-pressed。范围见 DIAGNOSIS_WORKBENCH.md；没有宣称全站无障碍通过。
- 最新整链退出 0：148 测试文件通过/1 跳过，1,106 项测试通过/1 live 跳过，typecheck/lint/build 通过。证据 .codex/diagnosis-ui-2026-09-21/final-verification.log。
- 仍是客户端修复前置校验，不是服务器原子修复生命周期；通用任务版本、完整备份、统一配置域和真实模型应用全链路等主目标未完成。goal 保持 active，无 commit/push。

## 真实本地模型应用验收与联调修复（2026-09-21）

- 页面发起 1 格原创小说任务，gpt-5.6-luna 生成分镜并执行脚本修复；审核后 gpt-image-2 实际出图，单图片作业 attemptCount=1，PNG 1312×1199 / 3,376,136 bytes，浏览器 decode 成功。
- 页面手动评分写回 8.5，默认高分无重试候选所以诊断报告为空；另外通过 action API 指定单格获得真实 clean 报告。明确区分评分、候选筛选与逐格诊断。
- 修复首次评分入口消失、分镜审核双操作栏、Date 转换损坏、completed→review 后轮询不重启，以及请求返回后运行态按钮未锁定。新增真实脚本 fixture 和生命周期回归；不是仅为测试置入合成结果。
- 导出页面实际产物：PNG 1104×1336；PDF A4 两页，Poppler 全页查看；Markdown ZIP CRC/相对引用/原图字节一致。细节和文件在 LIVE_APP_ACCEPTANCE.md 及忽略证据目录。
- 全量最终 151 文件通过/1 跳过，1,117 测试通过/1 live 跳过，typecheck/lint/build 退出 0；日志 live-app-2026-09-21/verified-final.log。
- 三个角色凭据已显式清除，SQLite VACUUM/WAL清理及已知凭据残留扫描通过；临时18340/18341关闭、用户8317保留、data原样、无commit/push。
- **仍未完成**：统一服务端修复/CAS及通用创建更新版本、跨页同步、多格/所有内容类型验收、完整恢复备份、完整 Connection/Model/Role 域与授权保护等。单格应用链路已有实证，不再重复声称完全未测，但整体 goal 保持 active。

## 评审与角色调用补齐模型引用（2026-09-21）

- 实测定位已脱敏配置仍被 QualityScorePanel/useCharacterForm 组装成无 ID 临时请求的问题；新增统一转换器，作品文字/视觉/诊断/修复重评及两处角色评审均保留 configId/configRole，删除不回退，含冒号 ID 不截断。
- getStoredRequestConfigs 复用白名单转换，保持生成入口原有选择规则。保留默认评审历史回退，不冒称完整角色绑定迁移。
- 新增 21 条回归；154 文件通过/1 跳过，1,138 测试通过/1 live 跳过，typecheck/lint/build 退出 0。
- 生产服务与浏览器实际点击验证同 ID 的 LLM/VLM 分别命中 OpenAI-compatible/Anthropic 模拟上游，凭据匹配、页面自动完成；没有调用真实 8317/消耗模型额度。
- 详情 REVIEW_MODEL_REFERENCES.md；证据 .codex/review-model-refs-2026-09-21。整体 goal 保持 active，无 commit/push。

## 诊断范围、覆盖语义与并行启动（2026-09-21）

- 诊断 UI 增加建议/全部已生成/手动画格三种范围，提交显式索引；无候选或手动空选禁止发起，提示范围和可能的额外评分调用。已评分后仍可更换模型。
- 当前有效诊断覆盖以真实报告中的画格为准，排除过期/素材提示词不匹配；不把空报告当成全图通过。下方旧“已通过”摘要明确改为评分状态。
- 实际生产浏览器 + 模拟上游：选择第2格提交[1]得到1/2覆盖，再全部提交[0,1]得到2/2；运行控件锁定、自动更新、桌面亮色/移动暗色截图与390px无溢出实测。
- 首次构建暴露 SQLite WAL 初始化并发 SQLITE_BUSY；真实独立连接锁竞争先复现，再添加仅 BUSY 的有限启动重试、返回值检查与失败连接关闭。修复后两个新隔离目录生产构建成功。
- 本批新增23测试；最终158文件通过/1跳过，1,161测试通过/1live跳过，typecheck/lint/build退出0。DIAGNOSIS_SCOPE.md 与 .codex/diagnosis-scope-2026-09-21/verified-complete.log 记录范围。
- 18344/18345关闭，用户8317保留，原始data无改动，无真实模型新增调用，无commit/push。完整任务版本、配置域、备份恢复等主目标仍未完成。
