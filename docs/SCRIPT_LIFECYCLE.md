# 脚本执行生命周期与过期结果隔离（2026-09-20）

## 本批解决的实际问题

原脚本 runner 跨越研究、生成和修复 await 后，对最初读取的整份任务执行 upsert：

- 等待期间删除任务，迟到结果会重新插入任务。
- 删除后流式调用失败仍触发非流式降级。
- 回收站恢复同 ID 后，旧执行可能把恢复后的内容覆盖。
- 生成期间通过 PATCH 修改的标签/收藏被旧快照覆盖。
- 两次执行乱序完成，旧执行可以覆盖新执行。
- 初次状态写回丢失 rowToTask 不公开的 serverScriptReplay；pipelineTrace 原来也没有完整落库。

以上前五种场景先在真实 SQLite + 受控生成 Promise 中复现，5 项测试失败，再实施修复。不是只用 mock upsert 的调用次数推断数据结果。

## 服务端写入边界

数据库层提供四个入口：claimTaskScriptRun、hasTaskScriptRun、updateTaskForScriptRun、finishTaskScriptRun。

- 每次执行有随机 run ID。claim 在 immediate SQLite 事务内同时设置执行归属并读取当前快照；新执行取代旧执行。
- run ID 只在服务端任务 metadata 内保存，不加入公开 GenerateTask DTO；通用 upsert、导入与恢复不携带该字段，因此使旧执行失效。
- 脚本写入使用 UPDATE-only + run ID 比较，不插入不存在的行。读 metadata、合并脚本所属字段、条件写回均在 immediate 事务内完成，避免跨连接的读后写竞争。
- 只更新脚本所属的状态/进度/脚本/角色/错误和相关 metadata；保留当前 tags、favorited、created_at、重放信息以及无关/未知 metadata。
- finally 仅释放自己仍拥有的标识，旧执行的清理不会清掉新执行标识。
- 已完成/已进入其他阶段的任务不接受迟到的脚本 enqueue。删除或替代被视为旧执行正常退出，不再写入 failed 结果。

研究、百科补充、导演、流式生成及降级、修复和自动生图交接都检查当前归属。去掉没有归属检查的 setTimeout 生图交接；runtime 本身已有微任务调度。运行中的 pipelineTrace 及结束结果可持久化。

此处是**结果写入隔离**，不是分布式唯一执行锁。多个进程仍可能同时消耗上游资源，新 run ID 只保证旧结果无权写回。也没有新增跨进程取消通知或远程任务取消证明。

## HTTP 集成中发现的流式问题

生产实现中浏览器 /api/llm-stream 会补 stream:true，而服务端直接调用的两个流式函数未设置它。本批在 OpenAI-compatible/Anthropic 流式请求体中都显式设置 stream:true。

SSE 解析器原来把 JSON.parse 和 onChunk 放在同一个 catch 中，消费者抛出的生命周期失效错误被当成坏 JSON 忽略。本批仅忽略 JSON 解析错误，让回调错误正常传播，并在 DONE/结束/失败时释放 reader。关闭本地 reader 不代表提供商已停止计费或生成。

新 SSE 回归先失败（两类请求缺参数、回调异常被吞导致超时），修复后通过。

## 验证与证据

最终完整验证：145 测试文件通过、1 跳过；1,069 项测试通过、1 live 测试跳过。类型检查、Lint 和生产构建的最终退出码见 `.codex/script-lifecycle-2026-09-20/final-verification.log`。

新增/更新的验证：

- scriptLifecycle.test.ts：真实 SQLite 配受控生成结果；删除、删除后错误、同 ID 恢复、乱序新旧运行、标签/收藏、研究/修复删除、正常失败、禁止重新生成已完成任务、独立 SQLite 连接读写、隐私 DTO、重放与未知 metadata 保留、自动交接。
- scriptLifecycleIntegration.test.ts：没有模块 mock；真实本机 HTTP/SSE → 提供商适配 → 脚本 parser/validator → SQLite，检查正常完成与独立连接读取。HTTP 200/400 的迟到响应均不复活、不追加降级请求；保持上游流未结束时，删除后的下一 chunk 触发本地退出。
- streamTransport.test.ts：两种协议流式参数、回调错误传播、reader cancel/release。
- 现有 taskRuntimeScript/scriptRelations 单元 fixture 更新新存储边界；真实数据库行为由上述测试证明，不依赖 fixture 代替数据库。

首次全量测试发现旧 scriptRelations fixture 缺新接口，更新 fixture 后复验。首次 HTTP 测试的清理会等待仍存活的 runner，掩盖 stream 参数断言为超时；修正清理后暴露真实缺参错误，修复生产代码。保留失败日志，不以增大超时绕过。

测试全部使用 setup.ts 分配的独立目录，构建使用忽略目录 build-data；没有真实模型调用、没有真实密钥、没有用户数据修改。整体目标仍 active，未 commit/push。

## 同类风险扫描与未完成范围

从脚本 persistTask 扩展至 orchestrator 的 upsertTask，再扩展至生产源码：当前共 10 处受保护 persistTask、21 处 orchestrator upsertTask、28 处生产 upsertTask 候选；完整候选清单在忽略目录 variant-candidates.json。这是调用位置计数，不是漏洞数量。

逐段阅读确认仍有相同的「await 前读旧任务、之后全量 upsert」风险：

| 候选 | 当前判断 | 剩余工作 |
| --- | --- | --- |
| reviewRunner.persistReviewState | P1，同类旧快照写回；读取任务后 await jobs | 建立删除/暂停/图片变化回归，原子写 review 所属字段 |
| reviewRunner 评分后暂停分支、诊断后成功/失败分支 | P1，同类；任务和 job 读取之间 await，且未验证素材版本 | 引入作业执行归属、图像/提示词版本校验 |
| deepReviewRunner.startDeepReview | P1，任务快照跨 createTaskJob/listJobs await | 事务化创建与状态写入，并禁止删除后复活 |
| tasks/[id] PUT | P1，extractTaskImagesAsync 后无条件 upsert | 区分创建/更新，建立任务版本及冲突响应，避免客户端缓存重建已删除作品 |
| imageRunner | 部分路径已有删除检查与重读，但未实现本批同等跨进程 fencing | 不能用这次脚本验证声称图片所有竞争均已修复 |
| 无 await 的创建/种子导入 | 仅命中调用模式，不据此认定为本问题 | 另审导入权限与数据完整性 |

CI 回归以 scriptLifecycle/Integration 中的权威数据库状态断言为准；简单禁止整个仓库 upsert 会误伤合法创建，未添加这种高误报规则。

后续仍包括：脚本显式暂停/取消/重试 UI 与持久化命令、跨进程唯一执行和通知、长时间无数据时及时停止、阶段内部 retry 感知归属、流式文字节流落库、工作台草稿恢复、完整备份和真实模型端到端。当前检查发生在 await 边界或下一 chunk；不能保证删除后立即终止已发出的远程请求。完整重构范围不缩小。
