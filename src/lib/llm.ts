// Re-export hub — all exports preserved for backward compatibility
// Original module split into src/lib/llm/*.ts

export type { StreamChunkCallback } from "./llm/client";
export { callLLM, getLLMConfig } from "./llm/client";

export { generateScript, generateScriptStream, generateTopicResearch, buildEnhancedTopicFromResearch, summarizeWikipediaContent, generateReferenceImagePrompt } from "./llm/parsers";
export type { TopicResearchResult } from "./llm/parsers";

export { generateCharacterProfile, generateCharacterReferencePrompt, generateCharacterPrompts } from "./llm/characterGen";
export type { CharacterProfileResult, CharacterPromptResult } from "./llm/characterGen";
