import { APIProvider, ImageEndpointType, UserLLMConfig, UserImageConfig, ZImageExtraBody } from "../types";

/** LLM 预设模板 */
export interface LLMPreset {
  id: APIProvider;
  name: string;
  apiUrl: string;
  defaultModel: string;
  protocolType: "openai-compatible" | "anthropic";
}

/** 文生图预设模板 */
export interface ImagePreset {
  id: APIProvider;
  name: string;
  apiUrl: string;
  defaultModel: string;
  defaultSize: string;
  defaultEndpointType: ImageEndpointType;
  defaultExtraBody?: ZImageExtraBody;
}

/** LLM 提供商预设 */
export const LLM_PRESETS: LLMPreset[] = [
  {
    id: "deepseek",
    name: "DeepSeek",
    apiUrl: "https://api.deepseek.com/v1",
    defaultModel: "deepseek-chat",
    protocolType: "openai-compatible",
  },
  {
    id: "openai",
    name: "OpenAI",
    apiUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    protocolType: "openai-compatible",
  },
  {
    id: "claude",
    name: "Claude",
    apiUrl: "https://api.anthropic.com/v1/messages",
    defaultModel: "claude-sonnet-4-20250514",
    protocolType: "anthropic",
  },
  {
    id: "gemini",
    name: "Gemini",
    apiUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    defaultModel: "gemini-2.0-flash",
    protocolType: "openai-compatible",
  },
  {
    id: "nano-banana",
    name: "Nano Banana",
    apiUrl: "https://api.nanobanana.com/v1",
    defaultModel: "banana-xl",
    protocolType: "openai-compatible",
  },
  {
    id: "custom",
    name: "自定义",
    apiUrl: "",
    defaultModel: "",
    protocolType: "openai-compatible",
  },
];

/** 文生图提供商预设 */
export const IMAGE_PRESETS: ImagePreset[] = [
  {
    id: "openai",
    name: "OpenAI DALL-E",
    apiUrl: "https://api.openai.com/v1/images/generations",
    defaultModel: "dall-e-3",
    defaultSize: "1024x1024",
    defaultEndpointType: "images",
  },
  {
    id: "gemini",
    name: "Gemini",
    apiUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    defaultModel: "gemini-2.0-flash-exp-image-generation",
    defaultSize: "1024x1024",
    defaultEndpointType: "chat",
  },
  {
    id: "z-image" as APIProvider,
    name: "Z-Image (Gitee AI)",
    apiUrl: "https://ai.gitee.com/v1/images/generations",
    defaultModel: "z-image-turbo",
    defaultSize: "1024x1024",
    defaultEndpointType: "images",
    defaultExtraBody: {
      num_inference_steps: 9,
      guidance_scale: 1,
      negative_prompt: "blurry, ugly, bad quality, distorted",
    },
  },
  {
    id: "nano-banana",
    name: "Nano Banana",
    apiUrl: "https://api.nanobanana.com/v1/images/generations",
    defaultModel: "banana-image-xl",
    defaultSize: "1024x1024",
    defaultEndpointType: "images",
  },
  {
    id: "custom",
    name: "自定义",
    apiUrl: "",
    defaultModel: "",
    defaultSize: "1024x1024",
    defaultEndpointType: "auto",
  },
];

/** 根据 ID 获取 LLM 预设 */
export function getLLMPreset(id: APIProvider): LLMPreset | undefined {
  return LLM_PRESETS.find((p) => p.id === id);
}

/** 根据 ID 获取文生图预设 */
export function getImagePreset(id: APIProvider): ImagePreset | undefined {
  return IMAGE_PRESETS.find((p) => p.id === id);
}

/** 从预设创建 LLM 配置 */
export function createLLMConfigFromPreset(
  preset: LLMPreset,
  apiKey: string,
  customModel?: string
): UserLLMConfig {
  return {
    id: `${preset.id}_${Date.now()}`,
    name: preset.name,
    provider: preset.id,
    apiUrl: preset.apiUrl,
    apiKey,
    model: customModel || preset.defaultModel,
    protocolType: preset.protocolType,
  };
}

/** 从预设创建文生图配置 */
export function createImageConfigFromPreset(
  preset: ImagePreset,
  apiKey: string,
  customModel?: string,
  customSize?: string
): UserImageConfig {
  return {
    id: `${preset.id}_${Date.now()}`,
    name: preset.name,
    provider: preset.id,
    apiUrl: preset.apiUrl,
    apiKey,
    model: customModel || preset.defaultModel,
    size: customSize || preset.defaultSize,
    endpointType: preset.defaultEndpointType,
  };
}
