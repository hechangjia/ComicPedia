// 漫画生成相关类型定义

/** 单面板视觉评分 (VLM) */
export interface PanelVisualScore {
  panelIndex: number;
  textImageAlignment: number;  // 1-10: 画面与 imagePrompt 的匹配度
  styleAdherence: number;      // 1-10: 风格一致性
  artifactScore: number;       // 1-10: 视觉瑕疵（10=无瑕疵）
  compositionQuality: number;  // 1-10: 构图质量
  overall: number;             // 4 维平均
  issues: string[];            // 具体问题描述
}

/** VLM 视觉质量评分（基于实际生成图片） */
export interface VisualQualityScore {
  overall: number;
  panels: PanelVisualScore[];
  /** 跨面板一致性总分 (P3) */
  crossPanelConsistency?: number;
  /** 跨面板一致性详情 (P3) */
  crossPanelDetail?: {
    characterConsistency: number;
    styleDrift: number;
    colorPaletteCoherence: number;
    overall: number;
    issues: Array<{ panelIndices: number[]; description: string }>;
  };
  /** 建议重新生成的面板索引 + 修正方向 */
  retryRecommendations: Array<{
    panelIndex: number;
    reason: string;
    suggestedFix: string;
  }>;
  evaluatedAt: string;
}

/** Review 终态（任务/角色共用） */
export type ReviewStatus = "unreviewed" | "reviewed" | "needs_repair";

/** 角色参考图视觉评分结果 */
export interface CharacterVisualScore {
  overall: number;
  /** 角色特征清晰度（面部、服装、体型是否清楚呈现） */
  featureClarity: number;
  /** 跨图一致性（多张参考图间角色外貌是否统一） */
  consistency: number;
  /** 画面质量（瑕疵、分辨率、构图） */
  imageQuality: number;
  /** 具体问题 */
  issues: string[];
  /** 改进建议 */
  suggestions: string[];
  evaluatedAt: string;
}

/** 面板级 review 状态 */
export type PanelReviewStatus = "reviewed" | "needs_repair" | "retrying" | "failed";

/** 面板级 review 投影 */
export interface PanelReview {
  panelIndex: number;
  status: PanelReviewStatus;
  score: number;
  issues: string[];
}

/** 单次自动视觉 retry cycle 状态 */
export type VisualRetryCycleStatus = "running" | "completed" | "failed" | "skipped";

/** 单个面板在 retry cycle 内的 outcome */
export type VisualRetryOutcomeStatus = "retrying" | "completed" | "failed";

/** 轻量视觉 retry 摘要 */
export interface VisualRetrySummary {
  status: VisualRetryCycleStatus;
  startedAt: string;
  finishedAt?: string;
  initialOverallScore: number;
  finalOverallScore?: number;
  attemptedPanels: number[];
  outcomes: Array<{
    panelIndex: number;
    status: VisualRetryOutcomeStatus;
  }>;
}

/** 叙事大纲 — 面板级蓝图 (Director Agent) */
export type NarrativeTemplateType = "mechanism" | "mythic" | "historical" | "discovery";
export type NarrativeBeatRole = "hook" | "conflict" | "reveal" | "progression" | "closure";
export type NarrativeShotIntent = "establish" | "hook-closeup" | "contrast" | "process" | "reveal" | "aftermath";
export type NarrativeIntensity = "low" | "medium" | "high";

export interface PanelBlueprint {
  narrativeFunction: "opening" | "setup" | "development" | "climax" | "resolution" | "epilogue";
  beatRole: NarrativeBeatRole;
  suggestedComposition: string;
  shotIntent: NarrativeShotIntent;
  characters: string[];
  keyInfo: string;
  knowledgeGoal: string;
  infoDensity: "low" | "medium" | "high";
  intensity: NarrativeIntensity;
  carryForward: string;
}

/** Director Agent 生成的叙事大纲 */
export interface NarrativeOutline {
  totalPanels: number;
  templateType: NarrativeTemplateType;
  source?: "legacy" | "beat-plan";
  panels: PanelBlueprint[];
  characterList: Array<{ name: string; role: string; firstAppearance: number }>;
  infoDistribution: string;
  narrativeArc: string;
}

/** 图片版本记录 */
export interface ImageVersion {
  imageUrl: string;      // base64 data URI
  createdAt: number;     // Date.now() 时间戳
}

/** 面板过渡效果 */
export type PanelTransition = "cut" | "fade" | "slide" | "zoom" | "dissolve";

/** 难度等级（教育测验） */
export type DifficultyLevel = "easy" | "medium" | "hard";

/** 测验题目 */
export interface QuizQuestion {
  question: string;
  options: [string, string, string, string];
  correctIndex: number; // 0-3
  explanation: string;
}

/** 关联词条推荐 */
export interface RelatedTopic {
  keyword: string;
  wikipediaTitle: string;
  description?: string;
  thumbnail?: string;
  verified: boolean;
}

/** 单个漫画面板 */
export interface ComicPanel {
  id: number;
  scene: string;
  dialogue: string;
  imagePrompt: string;
  imageUrl?: string;
  status: "pending" | "generating" | "completed" | "failed";
  /** 面板级风格覆盖（优先于 script.style） */
  styleOverride?: ComicStyle;
  /** 所有历史版本（含当前），最新在末尾 */
  imageVersions?: ImageVersion[];
  /** 当前激活版本的索引，undefined 表示最新 */
  activeVersionIndex?: number;
  /** 面板级参考图覆盖（优先于 script 级） */
  referenceImage?: string;
  /** 面板级多参考图覆盖 */
  referenceImages?: string[];
  /** 面板过渡效果 */
  transition?: PanelTransition;
  /** 面板展示时长(秒) */
  duration?: number;
  /** Prompt 增强日志（透明化增强过程） */
  enhancementLog?: {
    original: string;
    enhanced: string;
    layers: { name: string; action: string }[];
  };
}

/** 单张参考图的完整记录 */
export interface ReferenceImageEntry {
  /** 当前显示的图片 (base64 data URI) */
  imageUrl: string;
  /** 生成该图时使用的 prompt（用户可编辑） */
  prompt?: string;
  /** 角色/标签名 */
  label: string;
  /** 来源：AI 生成 or 用户上传 */
  source: "ai" | "upload";
  /** 图片版本历史 */
  versions: ImageVersion[];
  /** 当前激活版本索引 */
  activeVersionIndex: number;
  /** 创建时间 */
  createdAt: number;
  /** Style used when generating this image */
  style?: ComicStyle;
}

/** 参考图生成模式 */
export type ReferenceGenMode = "controlnet" | "img2img";

/** 分镜脚本 */
export interface ComicScript {
  title: string;
  topic: string;
  style: ComicStyle;
  panels: ComicPanel[];
  /** 角色统一描述（用于保持角色一致性） */
  characterDescription?: string;
  /** 随机种子（用于图片生成一致性） */
  seed?: number;
  /** 全局参考图（base64 data URI），用于所有面板的 control_image */
  referenceImage?: string;
  /** 多参考图（base64 data URI 数组），多角色场景使用 */
  referenceImages?: string[];
  /** 参考图控制模式 */
  controlMode?: "HED" | "Canny" | "Depth";
  /** 结构化参考图列表（新版） */
  referenceEntries?: ReferenceImageEntry[];
  /** AI 生成的测验题 */
  quiz?: QuizQuestion[];
  /** 关联词条推荐 */
  relatedTopics?: RelatedTopic[];
}

/** 漫画风格 */
export type ComicStyle =
  | "anime"        // 日系动漫
  | "cartoon"      // 欧美卡通
  | "chibi"        // Q版可爱
  | "realistic"    // 写实风格
  | "watercolor"   // 水彩风格
  | "sketch"       // 黑白素描
  | "manga"        // 日漫黑白线稿
  | "inkwash"      // 水墨风格
  | "pixel"        // 像素风格
  | "flat"         // 扁平矢量插画
  | "infographic"  // 手绘信息图
  | "banana";      // 香蕉漫画

/** 内置内容类型 */
export type BuiltinContentType = "science" | "poetry" | "xiaohongshu" | "novel" | "wikipedia";

/** 内容类型（可扩展：内置类型有 IDE 补全，同时允许运行时注册新类型） */
export type ContentType = BuiltinContentType | (string & {});

/** 小说体裁 */
export type NovelGenre =
  | "wuxia"       // 武侠
  | "xianxia"     // 仙侠
  | "historical"  // 历史
  | "romance"     // 言情
  | "scifi"       // 科幻
  | "mystery"     // 悬疑
  | "classic"     // 经典名著
  | "fantasy";    // 奇幻

/** 小说元信息 */
export interface NovelMeta {
  title?: string;
  author?: string;
  era?: string;
  genre?: NovelGenre;
}

/** Wikipedia 文章内容（用于百科漫画生成） */
export interface WikipediaContent {
  title: string;
  extract: string;
  hasLatex?: boolean;
  sections?: string[];
  thumbnail?: string;
  lang: string;
}

/** 生成质量档位 */
export type GenerationQuality = "fast" | "standard" | "fine";

/** 诗词体裁 */
export type PoetryGenre =
  | "shi"      // 诗（唐诗、古诗）
  | "ci"       // 词（宋词）
  | "qu"       // 曲（元曲）
  | "modern"   // 现代诗
  | "novel";   // 经典小说片段

/** 诗词元信息 */
export interface PoetryMeta {
  author?: string;      // 作者名
  era?: string;         // 时代（如：唐代、宋代、近现代、当代）
  title?: string;       // 作品名
}

/** 生成请求 */
export interface GenerateRequest {
  topic: string;
  style: ComicStyle;
  panelCount?: number | null; // 可选，null/未填表示由模型自动决定
  characterId?: string; // Optional character ID for consistency
  llmConfig?: PartialLLMConfig;
  imageConfig?: PartialImageGenConfig;
  contentType?: ContentType; // 内容类型：科普或诗词
  poetryGenre?: PoetryGenre; // 诗词体裁（仅诗词模式）
  poetryMeta?: PoetryMeta;   // 诗词元信息（作者、时代等）
  /** 参考图（base64 data URI），创建时传入，写入 script.referenceImage */
  referenceImage?: string;
  /** 多参考图（base64 data URI 数组） */
  referenceImages?: string[];
  /** 参考图控制模式 */
  controlMode?: "HED" | "Canny" | "Depth";
  /** 小说元信息（仅小说模式） */
  novelMeta?: NovelMeta;
  /** Wikipedia 文章内容（仅百科模式） */
  wikipediaContent?: WikipediaContent;
  /** 结构化参考图列表 */
  referenceEntries?: ReferenceImageEntry[];
  /** 角色 ID 列表 */
  characterIds?: string[];
  /** 生成质量档位 */
  quality?: GenerationQuality;
  /** 难度等级（影响 prompt 用词和知识深度） */
  difficulty?: DifficultyLevel;
  /** Whether the model may add a generic guide/narrator/explorer character */
  allowGuideCharacter?: boolean;
}

/** 生成任务状态 */
export interface GenerateTask {
  id: string;
  status: "pending" | "scripting" | "script_ready" | "generating" | "completed" | "failed";
  progress: number; // 0-100
  script?: ComicScript;
  character?: Character; // Store character info if used
  error?: string;
  /** LLM 流式输出的实时文本（仅 scripting 阶段，不持久化） */
  streamText?: string;
  /** Topic research result from pre-scripting phase */
  topicResearch?: {
    expandedDescription: string;
    keyFacts: string[];
    narrativeAngle: string;
    /** Multiple narrative angle candidates with relevance scores */
    narrativeAngles?: Array<{
      angle: string;
      relevance: number;
      rationale: string;
    }>;
    /** Hierarchical knowledge map */
    knowledgeMap?: {
      core: string[];
      sub: string[];
      related: string[];
    };
  };
  factPack?: FactPack;
  researchBrief?: ResearchBrief;
  /** Narrative outline from Director Agent (guides script generation) */
  narrativeOutline?: NarrativeOutline;
  /** Script quality validation (auto-run after scripting, before script_ready) */
  scriptValidation?: {
    passed: boolean;
    characterConsistency: boolean;
    compositionVariety: boolean;
    styleAlignment: boolean;
    languagePurity: boolean;
    warnings: Array<{
      severity: "critical" | "warning" | "info";
      dimension: string;
      panelIndices: number[];
      message: string;
      suggestion: string;
    }>;
  };
  /** Number of automatic script repair rounds applied (0 = no repair needed) */
  scriptRepairRounds?: number;
  /** Auto-evaluated quality score (set after image generation completes) */
  qualityScore?: {
    overall: number;
    knowledge: number;
    visualConsistency: number;
    narrativeCoherence: number;
    compositionDiversity: number;
    suggestions: string[];
  };
  /** VLM visual quality score — evaluates actual generated images, not prompts */
  visualQualityScore?: VisualQualityScore;
  /** Task-level review terminal state; in-progress state lives in panelReview/visualRetrySummary */
  reviewStatus?: ReviewStatus;
  /** Lightweight panel-by-panel review projection derived from the latest visual score */
  panelReview?: PanelReview[];
  /** Latest bounded retry cycle summary */
  visualRetrySummary?: VisualRetrySummary;
  /** Latest time task visual review state was updated */
  lastReviewAt?: string;
  /** Generation config snapshot — records which models were used */
  generationConfig?: {
    llmModel?: string;
    llmProvider?: string;
    imageModel?: string;
    imageProvider?: string;
    quality?: string;
    allowGuideCharacter?: boolean;
    generatedAt?: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

/** 角色外观属性 */
export interface CharacterAppearance {
  gender: string;
  age: string;
  hair: string;
  eyes: string;
  clothing: string;
  /** Species/type for non-human characters (e.g., "penguin", "whale", "lobster") */
  species?: string;
}

/** 角色形象变体（同一角色的不同年龄/状态） */
export interface CharacterVariant {
  /** 变体名称（如"少年时期"、"中年时期"、"战斗形态"） */
  label: string;
  /** 该变体的外观属性 */
  appearance: CharacterAppearance;
  /** 该变体的参考图 */
  referenceEntries: ReferenceImageEntry[];
  /** 该变体的头像 */
  avatarUrl: string | null;
}

/** 角色定义 */
export interface Character {
  id: string;
  name: string;
  description: string;
  /** 默认/主要外观（向后兼容） */
  appearance: CharacterAppearance;
  style: ComicStyle;
  avatarUrl: string | null;
  /** 结构化参考图列表（默认形象） */
  referenceEntries: ReferenceImageEntry[];
  /** 标签 */
  tags: string[];
  /** 形象变体列表（同一角色的不同年龄/状态/服装） */
  variants?: CharacterVariant[];
  /** Latest persisted character visual review score */
  visualScore?: CharacterVisualScore;
  /** Character-level review terminal state */
  reviewStatus?: ReviewStatus;
  /** Latest time character visual review state was updated */
  lastReviewAt?: string;
  /** Custom display order (lower = earlier). Characters without this sort by updatedAt. */
  sortOrder?: number;
  createdAt: string;
  updatedAt: string;
}

/** 文生图适配器接口 */
export interface ImageGeneratorAdapter {
  name: string;
  generate(prompt: string, style: ComicStyle, seed?: number, signal?: AbortSignal): Promise<string>; // 返回图片URL
}

/** LLM 可覆盖配置（来自前端） */
export interface PartialLLMConfig {
  apiUrl?: string;
  apiKey?: string;
  model?: string;
  provider?: "openai-compatible" | "anthropic";
}

/** Z-Image extra_body 参数 */
export interface ZImageExtraBody {
  negative_prompt?: string;
  num_inference_steps?: number;
  guidance_scale?: number;
  control_image?: string;      // base64 编码图片
  control_mode?: "HED" | "Canny" | "Depth";
  control_context_scale?: number;
  image_scale?: number;
  /** img2img 输入图片 (base64) */
  image?: string;
  /** img2img 变化强度 (0-1, 越大变化越大) */
  strength?: number;
}

/** 文生图端点类型 */
export type ImageEndpointType = "chat" | "images" | "comfyui" | "auto";

/** 文生图可覆盖配置（来自前端） */
export interface PartialImageGenConfig {
  apiUrl?: string;
  apiKey?: string;
  model?: string;
  size?: string;
  endpointType?: ImageEndpointType;
  extraBody?: ZImageExtraBody;
  /** ComfyUI workflow JSON template */
  comfyuiWorkflow?: string;
}

// ============================================================
// 用户 API 配置系统类型
// ============================================================

/** API 提供商 */
export type APIProvider = "deepseek" | "openai" | "claude" | "gemini" | "nano-banana" | "z-image" | "ollama" | "comfyui" | "custom";

export type AccuracyProviderKind = "search" | "fetch";
export type AccuracyProviderVendor = "firecrawl" | "tavily" | "custom";
export type AccuracyProviderHealthStatus = "idle" | "success" | "error";
export type AccuracySourceTier = "anchor" | "whitelist" | "open_web";

export interface AccuracyProviderConfig {
  id: string;
  name: string;
  kind: AccuracyProviderKind;
  vendor: AccuracyProviderVendor;
  baseUrl: string;
  apiKey?: string;
  hasApiKey?: boolean;
  maskedApiKey?: string;
  capabilities: string[];
  enabled: boolean;
  priority: number;
  healthStatus?: AccuracyProviderHealthStatus;
  lastCheckedAt?: string;
  lastError?: string;
}

export interface AccuracyProviderSlots {
  primarySearch: string | null;
  fallbackSearch: string | null;
  primaryFetch: string | null;
  fallbackFetch: string | null;
}

export interface AccuracySettings {
  providers: AccuracyProviderConfig[];
  slots: AccuracyProviderSlots;
  whitelistDomains: string[];
}

export interface AccuracyHardFact {
  id: string;
  claimType: "person" | "date" | "number" | "term" | "place" | "event";
  subject: string;
  predicate: string;
  object: string;
  normalizedValue: string;
  sourceIds: string[];
  confidence: number;
  mustPreserve: boolean;
}

export interface AccuracySoftFact {
  id: string;
  summary: string;
  evidenceLevel: "strong" | "medium" | "weak";
  sourceIds: string[];
  rewriteFlexibility: "low" | "medium" | "high";
}

export interface AccuracySourceEntry {
  id: string;
  url: string;
  domain: string;
  title: string;
  sourceTier: AccuracySourceTier;
  retrievalMethod: "wikipedia" | "search" | "fetch";
  providerId?: string;
  excerpt: string;
  retrievedAt: string;
  trustScore: number;
}

export interface AccuracyCoverageGap {
  question: string;
  missingType: "hard_fact" | "soft_context" | "source" | "budget";
  severity: "info" | "warning" | "critical";
  reason: string;
}

export interface AccuracyConfidenceSummary {
  hardFactCoverage: number;
  softFactCoverage: number;
  overallRisk: "low" | "medium" | "high";
}

export interface AccuracyQueryPlan {
  hardFactQueries: string[];
  softFactQueries: string[];
  fallbackUsed: boolean;
}

export interface FactPack {
  topic: string;
  queryPlan: AccuracyQueryPlan;
  hardFacts: AccuracyHardFact[];
  softFacts: AccuracySoftFact[];
  sourceEntries: AccuracySourceEntry[];
  coverageGaps: AccuracyCoverageGap[];
  confidenceSummary: AccuracyConfidenceSummary;
  recommendedNarrativeAngles: string[];
}

export interface ResearchBrief {
  verifiedHardFactCount: number;
  sourceTiersUsed: AccuracySourceTier[];
  majorRisks: string[];
  safeToGenerate: boolean;
}

/** 用户 LLM 配置 */
export interface UserLLMConfig {
  id: string;
  name: string;
  provider: APIProvider;
  apiUrl: string;
  apiKey: string;
  model: string;
  protocolType: "openai-compatible" | "anthropic";
}

/** 用户文生图配置 */
export interface UserImageConfig {
  id: string;
  name: string;
  provider: APIProvider;
  apiUrl: string;
  apiKey: string;
  model: string;
  size: string;
  endpointType: ImageEndpointType;
  comfyuiWorkflow?: string;
}

/** 用户 API 配置 (v1 - 旧版，用于迁移) */
export interface UserAPIConfig {
  version: number;
  llm: Omit<UserLLMConfig, "id" | "name"> | null;
  image: Omit<UserImageConfig, "id" | "name"> | null;
  updatedAt: string;
}

/** 用户 API 配置 (v2 - 多配置) */
export interface UserAPIConfigV2 {
  version: 2;
  llmConfigs: UserLLMConfig[];
  imageConfigs: UserImageConfig[];
  /** VLM（视觉语言模型）配置，复用 LLM 配置格式 */
  vlmConfigs?: UserLLMConfig[];
  /** Accuracy research provider registry and retrieval settings */
  accuracyConfig: AccuracySettings;
  activeLLMId: string | null;
  activeImageId: string | null;
  activeVLMId?: string | null;
  updatedAt: string;
}
