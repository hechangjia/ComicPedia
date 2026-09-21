# ComicPedia 全面项目审查报告

- 审查日期：2026-09-19（Asia/Shanghai）
- 仓库：`X:\Desktop\ComicPedia`
- 基准提交：`32fe56f95986dcb6252c3062969b49d3875469c2`
- 性质：只审查，不修复业务代码；没有提交、推送、升级依赖或调用收费模型。
- 结论：**可以构建、基本页面可运行，但当前版本不宜未经修复直接暴露给不可信网络，也不能把“完整备份”和批量删除的可恢复性当作可靠保证。**

## 1. 摘要

本次整理 **15 项主要发现：7 项 P1、8 项 P2**。P1 指应优先处理的安全/数据完整性问题；P2 指常规功能、配置、测试及可访问性缺陷。没有把条件不明的依赖告警直接视为已成功利用的漏洞。

优先顺序：
1. 文件操作路径边界、网络访问控制、依赖安全版本。
2. 完整备份、批量回收站、运行中任务删除。
3. 外部图片下载的 SSRF 边界与缓存一致性。
4. 配置校验、部署文档、Windows 测试生命周期、可访问性。

### 审查覆盖与边界

| 领域 | 已做的检查 | 验证边界 |
|---|---|---|
| 项目结构 | 盘点 402 个 src 跟踪文件、10 个页面、35 个 API 路由、111 个测试文件；阅读架构约定、构建与 CI 配置 | 核心链路深审，其他模块风险导向抽查；不是 7.4 万行逐行形式化证明 |
| 任务编排 | 脚本 runner、图片队列、复审队列、重放配置、状态 authority、客户端回退 | 复现删除竞态；不声称真实供应商重启恢复已端到端通过 |
| 数据与文件 | SQLite、图片提取/存储、回收站、备份导入导出、缓存 | 破坏性越界只用模拟文件系统；没有对真实文件执行攻击 |
| API 与安全 | 认证覆盖、配置敏感字段、请求校验、代理下载、云元数据过滤、依赖审计 | 未对公网或真实云元数据服务发送攻击请求 |
| 业务模块 | 角色/关系、连载、准确性研究、LLM 解析、导出、客户端生命周期相关实现和既有测试 | 没有真实模型质量评测或付费生成 |
| 前端 | 首页、创建、设置实际渲染；10 个页面路径 HTTP 冒烟；390px 亮色与 1440px 暗色检查；移动端 Lighthouse | 未跑完整生成/重绘/下载浏览器 E2E；没有用页面 HTTP 200 代替业务成功 |
| 工程与部署 | 冻结 lockfile 安装、lint、生产构建、全量测试、覆盖率、Docker/Compose/CI 静态检查 | Docker 容器未实际构建运行；CI 使用 Linux，本轮运行在 Windows |

## 2. 实测结果

验证使用临时 **Node 20.20.2 + pnpm 9.15.9**，与仓库 CI 的 Node 20 / pnpm 9 大版本一致，没有修改系统默认 Node 24.18.0。

| 项目 | 结果 |
|---|---|
| 冻结依赖安装 | Node 20 成功；Node 24 首次失败，better-sqlite3 无对应预编译二进制且本机缺 Visual Studio C++ 工具链 |
| `pnpm lint` | 通过，退出码 0 |
| `pnpm build` | 通过，退出码 0；编译、类型检查、静态页面生成完成 |
| `pnpm test` | **791 通过 / 9 失败 / 1 跳过**；111 文件中 108 通过、2 失败、1 跳过 |
| 覆盖率重跑 | 相同 9 项失败；语句 49.18%、分支 43.67%、函数 50.59%、行 50.78% |
| 独立缺陷探针 | **12/12 复现成功**，7 个文件；这些测试断言“坏行为仍存在”，并不表示已修复 |
| 生产模式页面冒烟 | 10 个页面路径和 `/api/health` 均返回 200；已查看首页、创建、设置 DOM |
| 创作页移动端 Lighthouse | Accessibility 88、Best Practices 100、SEO 100；该次审计不测 Performance |
| 网络依赖审计 | 54 条告警：3 critical、21 high、23 moderate、7 low；这是告警数量，不是已证明可利用漏洞数量 |

覆盖率是本轮 Vitest 默认收集范围的指标，**不是全部仓库文件的覆盖率保证**。例：`useAPIConfig.ts` 行覆盖率 4.46%、客户端 `db.ts` 17.39%、PDF 导出 2.68%、图片存储 33.67%；备份导出路由虽有 90.47% 行覆盖率，仍未测出落盘图片不能完整备份，说明需要更强的行为断言。

构建中出现 Google Fonts TLS 重试和缺少 `metadataBase` 的警告，但最终构建成功，不能把警告写成构建失败。官方 GitHub advisory API 二次查询遇到 403 限流，依赖结论以本次保存的 npm audit 返回为证；没有验证 CVE 利用链。

## 3. P1 发现

### A01 — 批量删除可把未经约束的 ID 带入目录操作，越界删除非图片文件

- 位置：`X:\Desktop\ComicPedia\src\app\api\tasks\route.ts:168-173`；`X:\Desktop\ComicPedia\src\lib\server\imageStorage.ts:238-248`。
- 根因：批量删除只检查 ID 为字符串，不检查其路径含义，也不先确认记录存在；随后 `trashTaskImages(id)` 将 ID 直接交给 `moveImagesToTrash`。后者在操作源和目标前没有目录边界验证。
- 触发：受控字符串 `../../sentinel` 在 `data/images` 与 `data/.trash` 下解析成同一个外部目录。程序把目标当作旧回收目录清理，实际删掉该目录内文件，然后才尝试移动。
- 证据：`batch.test.mjs` 证明即使数据库删除返回 0，也会先调用文件清理；`traversal.test.mjs` 用完全模拟的 fs 证明会请求 unlink 图片根目录外的 sentinel 文件。**没有实际删除任何越界目录。**
- 影响：能访问删除 API 的调用者可影响进程文件权限所及、具有相应结构的非图片目录；不要求先创建同 ID 任务。未登录可达性见 A02。
- 建议：对 ID 采用非路径型白名单；对每次源/目标操作做 resolve/relative 边界与必要的 reparse/symlink 校验；确认任务存在后才操作文件；拒绝源目标相同。
- 验收：路径穿越、反斜杠、绝对路径、同根前缀目录、符号链接均被拒绝且无副作用；未知 ID 不触发磁盘写操作。

### A02 — 管理/写入 API 没有统一认证，配置 GET 直接返回模型密钥

- 位置：`X:\Desktop\ComicPedia\src\app\api\config\route.ts:43-49`；`X:\Desktop\ComicPedia\src\middleware.ts:7-27`；`X:\Desktop\ComicPedia\docker-compose.yml:6-7`。
- 根因：middleware 只加响应头。`/api/config` 仅脱敏 accuracyConfig，其余 llm/image/vlm 配置整体返回。`ADMIN_TOKEN` 仅在备份导入检查，无法保护配置、任务、删除和维护路由。
- 证据：设置假的 ADMIN_TOKEN 后，无请求凭据调用配置 GET，仍得到 200 和假的 LLM 明文密钥。盘点 35 路由，ADMIN_TOKEN 只出现在备份导入路由。
- 条件：单人、可信本地进程环境与公网多用户环境不同。Compose 默认发布所有主机接口；直接公网部署、无认证的反向代理或局域网不可信客户端会放大风险。SHOWCASE_MODE 只是 UI/导航控制，不是安全边界。
- 影响：配置密钥、创作数据可被读取，写入/删除及有成本的工作可被非授权调用。
- 建议：先确定本地工具/公开展示的边界；公开部署必须加统一认证、写权限和只读展示限制；模型调用所需密钥逐步留在服务端，以 configId 引用。不要仅把密钥抹掉而破坏目前依赖它的浏览器调用链。
- 验收：未认证请求不能访问配置秘密和所有写入管理入口；公开展示不能触发模型生成或删除；本地允许模式明确且只绑定可信接口。

### A03 — 锁定的生产依赖命中严重安全公告

- 位置：`X:\Desktop\ComicPedia\package.json:24-33`；`X:\Desktop\ComicPedia\pnpm-lock.yaml`；`X:\Desktop\ComicPedia\next.config.ts:13-19`。
- 实测 lockfile：Next 15.5.14、jsPDF 4.2.0；npm audit --prod 返回 54 条告警。
- 重点公告：GHSA-p293-qw3h-jr36 标记 Windows 托管 Next 的 RCE 风险；GHSA-2xp9-vwfh-vxw4 标记 AVIF 图片优化风险；二者 audit 给出的 Next 修复下界为 15.5.24。项目允许任意 HTTPS 图片域，不能仅凭业务组件当前没有使用 next/image 就忽略优化路由。
- 限制：这里只验证依赖版本命中公告及相关配置，未执行 RCE/恶意图片利用。jsPDF GHSA-wfv2-pwc8-crg5 涉及特定 new-window 输出方式，代码审查未证明本项目调用该方式，不能等同为已暴露 XSS。
- 建议：以审计日期可用的修复版本更新并锁定 Next/相关依赖，复测构建、图片、导出和 SSRF 行为；不要盲目跨主版本升级或宣称“54 个漏洞全部能利用”。
- 验收：固定 lockfile 后重新 audit；每项剩余 high/critical 有版本与可达性判断，而不是忽略扫描退出码。

### A04 — “完整备份”没有带出已落盘图片，换机恢复会丢图

- 位置：`X:\Desktop\ComicPedia\src\app\api\backup\export\route.ts:26-31,78-85`；`X:\Desktop\ComicPedia\src\app\api\backup\import\route.ts:58-63`。
- 根因：导出直接返回 SQLite task/character，保存后的图像是 `file://key`，并非 base64。导出没有调用现有图片恢复函数或将图片打包。导入只写回实体数据，不携带对应原始图片文件。
- 证据：输入含 `file://audit_panel0_cur` 的任务，所谓 full backup 输出仍为同一引用，无任何图片字节。设置页明确宣称 Full Backup “Includes all images”，与实现不一致。
- 影响：在原机器导入可能因旧图片仍在而看起来成功；迁移至空 data 目录或原盘丢失后无法靠该 JSON 恢复漫画。
- 建议：导出图片字节/资源清单，并在导入时重新保存、注册 key；可复用已有 ZIP 图片打包能力。新的角色关系数据也应明确纳入备份范围或在 UI 中说明排除。
- 验收：独立空数据目录导入后，漫画、角色、历史版本图片可读取，内容哈希一致；不能仅验证 JSON 对象相等。

### A05 — 批量删除/清空没有写回收站元数据，实际上无法通过回收站恢复

- 位置：`X:\Desktop\ComicPedia\src\app\api\tasks\route.ts:168-180`；`X:\Desktop\ComicPedia\src\lib\server\imageExtractor.ts:407-425`。
- 根因：单任务删除传入完整 task；批量删除只调用 `trashTaskImages(id)`。只有 `task` 参数存在时才 `addToTrash`。
- 证据：批量路由探针确认仅传一个参数；随后调用 `deleteTasksByIds`/`clearAllTasks`。图片虽移走，恢复所需 task JSON 没有写入 trash 表。
- 影响：历史页批量删除和清空的行为与“软删除/可恢复”承诺不一致；回收站找不到记录。
- 建议：批量操作读取并记录完整 task 后再删除，与单条删除共用数据/文件迁移流程；考虑中途失败的恢复边界。
- 验收：批量删两项、清空及中途失败情形均能从回收站恢复内容与图片，原始元数据不丢。

### A06 — 正在生成脚本的任务被删除后，后台会重新写入“复活”

- 位置：`X:\Desktop\ComicPedia\src\lib\server\taskOrchestrator\scriptRunner.ts:36-38,472-475,545-549`；任务 DELETE 路由。
- 根因：runner 开始时读取 task，跨外部请求长期持有对象；结束、报错时无条件 upsert。DELETE 清除数据库记录，但没有取消对应脚本 Promise，也没有 tombstone/代次校验。
- 证据：阻塞模拟脚本请求，删除存储中的任务，随后让上游失败，runner 仍把任务以 failed 状态重新插入。独立探针未访问外部模型。
- 影响：删除不生效、工作可能继续消耗请求，旧快照也可能覆盖并行编辑。
- 建议：删除标记与 runner 取消/任务代次结合；每次异步结果提交须确认任务仍存在且版本有效，不能把所有 persist 都当成 insert-or-update。
- 验收：研究/流式脚本/回退请求成功或失败后，已删除任务均不再出现，不继续排图片队列。

### A07 — 图片响应里的 URL 绕过云元数据过滤

- 位置：`X:\Desktop\ComicPedia\src\lib\server\imageGenerationService.ts:31-59,77-90`。
- 根因：初始 targetUrl 经过 isUrlSafe，但提供商 JSON 内返回的图片 URL 由 `fetchImageAsBase64` 无校验请求，然后把结果 base64 返回。接受私有模型服务是既定设计，本问题不是“允许 localhost”本身，而是绕过明确声明的元数据禁止策略。
- 证据：isUrlSafe 对模拟元数据 URL 返回 false；同一 URL 放进图片响应 data[0].url 后，模拟 fetch 仍被调用，伪造元数据字节返回至调用方。没有向真实元数据服务请求。
- 影响：攻击者能控制上游响应或选择自己控制的 targetUrl 时，可借此读取不应可达的内部响应；可达性受网络与元数据服务自身鉴权限制。
- 建议：统一所有直接/二次下载 URL 的校验；对重定向重新校验或禁止跳转，对解析后地址实施元数据拒绝；明确可信内网 provider 例外。
- 验收：初始请求、嵌套图片 URL、跳转、IPv6/编码形式和 DNS 边界均覆盖，不能只测 isUrlSafe 单函数。

## 4. P2 发现

### A08 — Service Worker 永久返回可变图片的旧版本

- 位置：`X:\Desktop\ComicPedia\public\sw.js:30-42`；`X:\Desktop\ComicPedia\src\app\api\images\[key]\route.ts:11-27`。
- 图片 API 已区分 `char_*`、`*_cur`、无版本 ref 等可变 key，返回 must-revalidate；SW 却对所有图片 cache-first，命中时根本不访问服务器，应用层 Cache API 不自动遵守该重新验证意图。
- 证据：SW VM 探针放入 OLD_IMAGE，网络可返回 NEW_IMAGE；相同可变 URL 仍返回旧图，fetch 调用数为 0。
- 建议/验收：可变 key network-first/revalidate，版本化 key 才永久缓存；更新后刷新、跨页均显示新内容，并淘汰旧 SW 缓存。

### A09 — 图片负缓存没有在保存/恢复时失效

- 位置：`X:\Desktop\ComicPedia\src\lib\server\imageStorage.ts:121-139`，saveImageFile/saveImageFileAsync。
- 第一次 readImageByKey 找不到即缓存 null；后续保存同 key 没有删缓存。探针用隔离真实目录证明先读 miss→保存成功→再读仍为 null。
- 影响：图片队列的已保存输出检查，以及 images 表缺失/回收恢复后的 fallback 查找可能错误认为图片不存在；**正常 images 表命中路径不一定受此问题影响**。
- 建议/验收：保存、移动、恢复、删除均失效 key；负缓存带 TTL/上限，测试先 miss 后创建、删除后恢复。

### A10 — 配置版本检查发生在规范化之后，无效载荷可清空已有配置

- 位置：`X:\Desktop\ComicPedia\src\app\api\config\route.ts:25-38,60-77`。
- normalizeUserConfig 无条件把 version 改为 2、缺失数组改为空；随后 `config.version !== 2` 永远无法拒绝旧版本。探针提交 `{version:1}` 返回 200，saveConfig 收到空 llmConfigs。
- 建议/验收：先校验原始 schema/version，再执行明确迁移；错误版本/缺少关键字段返回 400，并保证原有配置不变。

### A11 — 文档承诺的模型环境变量没有被运行时代码消费

- 位置：`X:\Desktop\ComicPedia\README.md:398-410`；`X:\Desktop\ComicPedia\.env.example`；`X:\Desktop\ComicPedia\src\lib\llm\client.ts:87-98`。
- 文档列出 TEXT_API_URL/KEY/MODEL、IMAGE_*、MAX_IMAGE_WORKERS；源码中未找到其实际读取。getLLMConfig 只读取 overrides。
- 证据：设置假的 TEXT_API_URL/KEY/MODEL 后，getLLMConfig() 仍抛“未配置 LLM API”。创建页初始配置来自设置/SQLite，不存在环境变量 bootstrap 链路。
- 建议/验收：实现仅服务端的 env bootstrap/优先级，或明确移除过时部署承诺；从空数据库用文档步骤启动必须获得预期配置，密钥不得打进客户端包。

### A12 — SQLite 集成测试未关闭连接，Windows 全量测试持续失败

- 位置：`X:\Desktop\ComicPedia\src\__tests__\serverDbReviewPersistence.test.ts:311-318`；`X:\Desktop\ComicPedia\src\__tests__\taskOrchestratorStore.test.ts:17-24`；`X:\Desktop\ComicPedia\src\lib\server\db.ts:18`。
- 两组 afterEach 直接删除临时数据库目录，单例连接仍打开；Windows 抛 EBUSY，导致 9 项失败。普通测试及覆盖率重跑结果一致。
- 这不是已证明的 SQL 断言失败，不能写成 9 项业务逻辑错误。Linux unlink 行为可能让 CI 掩盖资源生命周期问题。
- 建议/验收：增加可控连接生命周期/close，清理前关闭全部句柄；Node 20 Windows 全量 0 fail，同时保持 Linux 验证。

### A13 — 创作控件与移动端首页图标缺可访问名称

- 位置：`X:\Desktop\ComicPedia\src\components\GenerationPresetSelector.tsx:16-19`；`X:\Desktop\ComicPedia\src\app\layout.tsx:87-94`；其他表单标签同类写法。
- label 没有 htmlFor、select 没有 id/aria-label；移动端隐藏 Logo 文本且图标无可访问名称。DOM 证实 select.labels 空、导航首页 link 的可见文本与 aria-label 均空，Lighthouse select-name/link-name 失败。
- 建议/验收：绑定 label/id；图标链接加语义名称，模式选择提供选中状态；使用键盘与可访问树复测，不以 placeholder 代替标签。

### A14 — 全局弱文本及主按钮配色对比不足

- 位置：`X:\Desktop\ComicPedia\src\app\globals.css:19-24,32-34,74-79`。
- Lighthouse 在创作页记录 46 个相关节点。例如 #a09a93/白底比值 2.78，白字/#3d8b84 为 4.01，12px 正文低于工具要求的 4.5。暗色桌面截图也显示说明文字很弱。
- 限制：46 是扫描节点数，部分引导步骤有淡化处理，不把每一个节点都无差别定为独立缺陷；非禁用的介绍、链接和按钮即可确认问题。
- 建议/验收：调整语义 token 与按钮文字/底色组合，不逐处覆写；重新审计亮暗主题、普通/hover/focus/disabled 状态。保留当前暖色设计方向，无需重做视觉体系。

### A15 — 两组测试直接写运行时 SQLite，污染项目数据目录

- 位置：`X:\Desktop\ComicPedia\src\__tests__\arcSnapshot.test.ts:1-7,40-49`；`X:\Desktop\ComicPedia\src\__tests__\taskOriginPersistence.test.ts:1-3,23-26`。
- 根因：顶层直接导入真实 server/db，没有替换数据目录、临时数据库或清理钩子；db 路径固定为 process.cwd()/data/comicpedia.db。
- 证据：本轮开始 data 只有 .gitkeep；两次全量运行后 SQLite 有 28 条任务，ID 全部属于 arc_test_/legacy-task-/test-origin- 加本轮时间戳，其他实体/配置/队列均为 0。每次运行这两组分别写入 11+3 条记录。
- 影响：在已有作品的 checkout 中执行 pnpm test 会混入测试任务，其中 legacy-task 会被当成用户作品；这些测试即使断言通过也不应触碰运行时库。
- 建议/验收：所有真实数据库测试通过显式测试 DB 路径或依赖注入隔离；关闭连接后清理测试副本。测试前后验证真实库不存在则仍不存在、存在则哈希和实体数量不变。
- 本轮处置：已停止审计服务，将本轮新建的 DB/WAL/SHM 按精确路径移至 `.codex/audit-2026-09-19/runtime-db-evidence`，逐个验证移动前后 SHA-256；data 已恢复为仅 .gitkeep。没有删除用户数据库。

## 5. 其他风险与维护建议（不冒充已验证的端到端漏洞）

1. **文件路径前缀判断不完整。** `readImageAsBase64`/`deleteImageFile` 使用 startsWith(IMAGE_BASE) 而没有分隔符，探针证明 `data/images-private/secret.txt` 可通过读取检查；但本轮未证明普通 HTTP 调用能任意写入 images registry 的路径，因此不单独声称任意文件读取已可远程利用。
2. **图片大小限制在完整缓冲之后。** proxy-image 与 imageGenerationService 先 arrayBuffer 再检查 20MB；这是接收后的检查，无法防止接收超大响应时的内存占用。未运行 OOM 压力攻击。建议复用带上限的流式读取，并设置并发/请求体预算。
3. **部分客户端 CRUD 吞异常。** 客户端 db 的删除同步失败后仍清理缓存/内存，UI 可能展示已删、刷新又出现；建议区分真实删除成功与离线待同步，不能仅 console.warn。
4. **备份导入缺全批次事务与充分 schema 校验。** tasks/characters/series 分开提交，中途异常可能部分成功；需要从空库和失败中段验证恢复。ADMIN_TOKEN 配置后 BackupManager 没有提交 token 的 UI/请求头，也需处理。
5. **流式脚本进度持久化不足。** scriptRunner 的 onChunk 只改闭包 task；长时间流式过程中浏览器轮询 SQLite 不一定能读到新 streamText。应结合限频持久化或服务端推送验证体验。
6. **运行时与部署约束欠明确。** package.json 没有 Node engines/packageManager 固定；本机 pnpm 11 已警告忽略 pnpm.onlyBuiltDependencies。建议固定受支持版本，并增加 Windows 矩阵，而非要求用户更改全局工具链。
7. **架构文档滞后。** 根 CLAUDE.md 写 12 页面/32 API/70余测试，当前实际为 10/35/111；其中引用的多个模块级 CLAUDE.md 不在本 checkout。应自动生成或维护清单，不能用旧摘要替代源码证据。
8. **跨进程队列边界待验证。** TaskRuntime 的防重集合是进程内 Map，SQLite job 表没有本轮验证过的分布式租约。当前单实例 Compose 可接受；扩容、多 worker 前必须验证重复执行与抢占。

### 已确认的正向基础

- TypeScript strict、ESLint 和生产构建可通过；既有单测规模较大，覆盖任务状态、复审、队列和代理多个分支。
- TaskStateAuthority 明确本地/服务端 durable/settled 的读取归属，优于在各页面随意定义状态规则。
- SQLite 使用 WAL、busy_timeout 和参数化 SQL；队列记录与重放请求分离。
- replay 配置剥离 API Key、accuracy 配置脱敏、safeReadText 有流式上限；这些正确做法需要扩展到遗漏路径，而不是全部推翻。
- 页面有主导航 landmark、skip link、全局错误边界、移动底栏与主题 token；390px 创作页实测没有横向溢出。

### 前端有限样本评分

仅针对本轮创作页与布局样本，不作全产品总分：可访问性 2/4、主题 2/4、响应式 3/4、实现一致性 2/4；性能未执行专门 Lighthouse performance/长任务追踪，记为未评，不凑总分。可先用 `$impeccable harden` 处理标签/状态、`$impeccable colorize` 校正 token，最后 `$impeccable polish` 检查；不要让外观工作排在数据保护之前。

## 6. 建议修复顺序与验收门槛

| 批次 | 范围 | 必须补充的验收 |
|---|---|---|
| 第一批 | A01/A02/A03/A07 | 不可信请求无磁盘副作用；统一鉴权；禁止二次元数据访问；新 lockfile 安全审计与回归 |
| 第二批 | A04/A05/A06 | 空环境备份恢复、批量回收恢复、各阶段删除任务不复活；保留数据与回滚方案 |
| 第三批 | A08/A09/A10/A11/A12/A15 | 真浏览器重绘缓存验证；缓存 miss 后写入；无效配置不覆盖；文档部署实测；Windows/Linux 测试均绿 |
| 第四批 | A13/A14 与导出 E2E | 标签/名称、亮暗对比度、角色/连载/导出实际交互补测 |

本次未主动实施上述修复；下一轮应先将本报告中的“坏行为确认探针”转换为正确行为回归测试，做到修改前失败、修改后通过，再进行小批次修复。

## 7. 证据、命令与工作区变化

证据目录：`X:\Desktop\ComicPedia\.codex\audit-2026-09-19`

- `test.log` / `coverage.log` / `coverage/coverage-summary.json`：全量测试与覆盖率。
- `lint.log` / `build.log`：lint 与生产构建。
- `repro.log` / `*.test.mjs` / `vitest.config.mjs`：12 个缺陷探针与配置。
- `dependency-audit.json`：npm 返回的完整生产依赖告警快照。
- `lighthouse-create-mobile.json`：创作页移动端审计。
- `inventory.json`：文件、路由、测试、较大模块盘点。
- `runtime-db-evidence/manifest.json` 和 DB/WAL/SHM：测试污染证据与移动前后 SHA-256。
- `ui-detector.log`：定向 detector 没有输出可用诊断，不把它当作“全 UI 无缺陷”的依据。

重跑命令（PowerShell，cwd 为隔离测试副本根；**修复 A15 前不要在含真实数据的工作目录直接跑全量测试**）：

```powershell
npx --yes --package=node@20 --package=pnpm@9 -c "pnpm install --frozen-lockfile"
npx --yes --package=node@20 --package=pnpm@9 -c "pnpm lint"
npx --yes --package=node@20 --package=pnpm@9 -c "pnpm test"
npx --yes --package=node@20 --package=pnpm@9 -c "pnpm build"
npx --yes pnpm@9 audit --prod --json
npx --yes --package=node@20 --package=pnpm@9 -c "pnpm exec vitest run --config .codex/audit-2026-09-19/vitest.config.mjs --reporter=verbose"
```

注意：临时 npx 版本别名可能随时间变化；以上本轮实际解析为 Node 20.20.2、pnpm 9.15.9。未修改 lockfile。

工作区副作用：新增这份报告；安装了被 gitignore 忽略的 node_modules，生成 .next、审计日志/探针/隔离小样本，以及由现有测试写入的 SQLite 数据库（28 条测试任务，已按 A15 留证并移出 data）。初始与收尾 data 均只有 .gitkeep，无用户作品。没有删除已有用户数据；没有修复源文件；未改变系统默认 Node/pnpm。所有审计探针留在忽略目录，不进入既有全量测试集合。审计专用 127.0.0.1:61324 服务已停止，未停止任何原有用户服务。

**完成标准：已交付基于当前提交的广度审查、核心链路复现、工程验证、风险分级及可执行验收建议。未验证事项已逐项标明；审查完成不意味着项目缺陷已修复或可安全公开部署。**
