import {
  Character,
  ComicScript,
  ComicStyle,
  ContentType,
  FactPack,
  NarrativeOutline,
  NovelMeta,
  PoetryGenre,
  PoetryMeta,
  WikipediaContent,
} from "./types";
import { buildScriptPrompt, parseScriptResponse } from "@/prompts/scriptGenerator";
import { buildPoetryPrompt, parsePoetryResponse } from "@/prompts/poetryGenerator";
import { buildXhsPrompt, parseXhsResponse } from "@/prompts/xhsGenerator";
import { buildNovelPrompt, parseNovelResponse } from "@/prompts/novelGenerator";
import { buildWikipediaPrompt, parseWikipediaResponse } from "@/prompts/wikipediaGenerator";

// ============================================================
// 统一参数接口
// ============================================================

/** generateScript 的统一参数 */
export interface ScriptGenerationParams {
  topic: string;
  style: ComicStyle;
  panelCount?: number;
  poetryGenre?: PoetryGenre;
  poetryMeta?: PoetryMeta;
  character?: Character;
  novelMeta?: NovelMeta;
  wikipediaContent?: WikipediaContent;
  allowGuideCharacter?: boolean;
  narrativeOutline?: NarrativeOutline;
  factPack?: FactPack;
}

// ============================================================
// 注册表接口
// ============================================================

/** 内容类型处理器 */
interface ContentTypeHandler {
  /** 构建 LLM prompt */
  buildPrompt: (params: ScriptGenerationParams) => string;
  /** 解析 LLM 响应为 ComicScript */
  parseResponse: (response: string) => ComicScript | null;
}

// ============================================================
// 注册表实现
// ============================================================

const contentRegistry = new Map<ContentType, ContentTypeHandler>();

/** 科普漫画 */
contentRegistry.set("science", {
  buildPrompt: (p) => buildScriptPrompt(p.topic, p.style, p.panelCount, p.character, p.allowGuideCharacter, p.narrativeOutline, p.factPack),
  parseResponse: parseScriptResponse,
});

/** 诗词漫画 */
contentRegistry.set("poetry", {
  buildPrompt: (p) => {
    if (!p.poetryGenre) {
      // 降级到默认体裁
      return buildPoetryPrompt(p.topic, "shi", p.style, p.panelCount, p.poetryMeta);
    }
    return buildPoetryPrompt(p.topic, p.poetryGenre, p.style, p.panelCount, p.poetryMeta);
  },
  parseResponse: parsePoetryResponse,
});

/** 小红书图文 */
contentRegistry.set("xiaohongshu", {
  buildPrompt: (p) => buildXhsPrompt(p.topic, p.style, p.panelCount),
  parseResponse: parseXhsResponse,
});

/** 小说场景 */
contentRegistry.set("novel", {
  buildPrompt: (p) => buildNovelPrompt(p.topic, p.style, p.panelCount, p.novelMeta),
  parseResponse: parseNovelResponse,
});

/** Wikipedia 百科 */
contentRegistry.set("wikipedia", {
  buildPrompt: (p) => {
    if (!p.wikipediaContent) {
      // 降级：无百科内容时用科普模式
      return buildScriptPrompt(p.topic, p.style, p.panelCount, undefined, p.allowGuideCharacter, p.narrativeOutline);
    }
    return buildWikipediaPrompt(p.wikipediaContent, p.style, p.panelCount, p.allowGuideCharacter, p.narrativeOutline, p.factPack);
  },
  parseResponse: parseWikipediaResponse,
});

// ============================================================
// 公共 API
// ============================================================

/**
 * 根据内容类型获取对应的处理器。
 * 未注册的类型降级到 science 处理器。
 */
export function getContentHandler(contentType?: ContentType): ContentTypeHandler {
  return contentRegistry.get(contentType || "science") || contentRegistry.get("science")!;
}

/**
 * 注册新的内容类型处理器（用于扩展）。
 */
export function registerContentType(type: ContentType, handler: ContentTypeHandler): void {
  contentRegistry.set(type, handler);
}

/**
 * 获取所有已注册的内容类型。
 */
export function getRegisteredTypes(): ContentType[] {
  return Array.from(contentRegistry.keys());
}

/**
 * 检查内容类型是否已注册。
 */
export function isRegisteredType(type: string): type is ContentType {
  return contentRegistry.has(type as ContentType);
}
