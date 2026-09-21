# 评审模型引用统一（2026-09-21）

状态：本批完成；全面重构目标仍未完成。

## 问题与根因

配置 GET 已对密钥脱敏，但作品评分和角色评审仍用 apiUrl/apiKey/model 手工组装调用参数，丢失已保存配置的 ID 与角色。

- 作品的浏览器文字/视觉评分、角色参考图评分：没有引用时走临时连接请求，空密钥不会由代理自动补齐，需认证的上游会失败。
- 持久化深入评审：旧参数可能依赖服务端地址/模型/协议匹配。同地址同名连接存在多份时，不能表达用户实际选择的配置。
- 下拉选择用 split(":") 拆分，包含冒号的合法配置 ID 被截断。

先运行真实组件回调和角色 Hook 的五条回归，均因缺失 configId/configRole 失败；不是以导入失败作为红灯证据。日志：.codex/review-model-refs-2026-09-21/red.log。

## 实现

- src/lib/config/reviewModel.ts：统一转换已保存 LLM/VLM 请求。只复制 ID、角色和非敏感协议提示，不复制 apiKey、hasApiKey、clearApiKey 或其他编辑状态。
- 作品的文字评分、视觉评分、深入诊断、修复后重评，以及角色的初次评分/修复后重评采用相同选择逻辑。
- getStoredRequestConfigs 复用相同转换器，保留原有生成入口的选择规则，不用评审的 first-entry 回退改变创作行为。
- 默认评审保留原先的 active ID → 首项规则；没有 VLM 列表时使用 LLM，并明确携带 llm 角色。这不是视觉能力认证，模型是否支持图片仍需单独验证。
- 显式选择按第一个冒号分隔角色和完整 ID；无效角色、空 ID、已删除配置报错，不切换至其他配置。
- 浏览器代理请求发送 modelRef + payload；持久化评审 action 发送 configId/configRole 和非敏感协议提示。真正的目标地址、模型和凭据由服务端保存配置解析。

## 变体核查

从 QualityScorePanel 的 apiKey 字段组装精确匹配开始，扩展到 src/components 与 src/hooks 内所有 apiKey 赋值，找到 useCharacterForm 两处同根因调用，均修复并加调用链测试。

剩余匹配包括配置表单编辑、显式连接测试、v1 配置迁移：这些有意处理新输入/迁移凭据，不属于已保存模型调用丢失身份，未机械删除。服务端读取密钥用于上游认证也不是同类问题。

## 验证

新增 21 条测试：

- reviewModelSelection.test.ts（12）：角色隔离、冒号 ID、默认/显式选择、删除/无效选择、缺失配置、仅白名单字段。
- reviewModelIdentity.test.tsx（6）：实际组件回调和角色 Hook 的文字评分、持久评审、浏览器视觉评分、LLM 回退、角色评分及修复重评。模型响应是测试替身，不宣称 DOM 交互验证。
- reviewModelTransport.test.ts（3）：真实浏览器请求构建函数接真实 Next route handler，分别解析 LLM/VLM 凭据；删除后不调用上游、不回退另一角色。fetch 为测试替身。

全量验证：154 个测试文件通过、1 个跳过；1,138 条测试通过、1 条 live 测试跳过；typecheck、lint、生产 build 全部退出 0。Node 20.20.2 / pnpm 9.15.9，证据 .codex/review-model-refs-2026-09-21/verified-final.log。原有 Browserslist 数据过期及 metadataBase 警告仍存在。

### 真实浏览器 + 生产服务 + 本地模拟上游

独立端口 18342/18343、独立 runtime-data、独立浏览器上下文，不使用用户 8317 或真实 API Key。合成一格作品/16px 色块不冒充模型生成。

- 配置两角色使用相同 ID same:review、相同模型名，但不同协议/测试凭据。配置 GET 确认密钥脱敏。
- 点击作品页 AI 质量评分，实际 /api/llm 请求 200：modelRef 为 llm/same:review，不含客户端认证 headers/targetUrl。模拟上游确认命中 /v1/chat/completions 及正确 LLM 凭据。
- 用键盘选中专用 VLM，再点击 VLM 视觉评分；实际 action 202 携带完整 ID、vlm 角色、anthropic 协议，无 apiKey。模拟上游命中 /v1/messages，确认仅使用 VLM 凭据。
- 页面自行轮询后显示脚本/视觉各 8 分，服务端任务 completed/diagnosis succeeded。8 分为固定模拟返回，不是实际作品质量结论。
- 浏览器证据摘要 browser-smoke-summary.json、上游布尔校验 upstream-observations.json。本批未额外消费真实模型额度。
- Chrome 的 select fill 未成功，改用 click/ArrowDown/Enter；最初等待的评分标题文本与实际不符而超时，随后快照及 GET 证实正常完成。没有因为等待超时重启/重复任务。
- 浏览器控制台出现一次资源 404；本批不宣称全页面控制台无错误。

## 限制与后续

本批不是完整 Connection/Model/Role 领域迁移，也未解决并发改协议后的请求版本竞争。默认 first-entry 回退仍是保留的历史行为；未来应由显式角色绑定与可验证能力替代。全站授权保护、CAS/服务端修复原子性、完整备份恢复、多格验收仍待推进。

空诊断报告仍显示矛盾提示、已评分视图缺少便捷切换评审模型等 WebUI 问题未在本批顺带改动，避免无验收地扩大交互变更。

## 收尾

核对监听进程命令行后已关闭本批 18342/18343；用户 8317 仍监听。原始 data 仅 .gitkeep（448 bytes），git diff --check 退出 0。独立数据库只含合成测试凭据，无真实密钥。未 commit/push。收尾记录：cleanup-verification.json。
