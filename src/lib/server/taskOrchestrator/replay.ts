import { getConfig } from "@/lib/server/db";
import type {
  GenerateRequest,
  ImageEndpointType,
  PartialImageGenConfig,
  PartialLLMConfig,
  UserAPIConfigV2,
  UserImageConfig,
  UserLLMConfig,
} from "@/lib/types";

type SanitizedLLMConfig = Omit<PartialLLMConfig, "apiKey">;
type SanitizedImageConfig = Omit<PartialImageGenConfig, "apiKey">;

export interface ServerScriptReplayPayload {
  request: Omit<GenerateRequest, "llmConfig" | "imageConfig">;
  llm?: {
    configId?: string;
    fallback?: SanitizedLLMConfig;
  };
  image?: {
    configId?: string;
    fallback?: SanitizedImageConfig;
  };
}

function requestNeedsImageReplay(request: GenerateRequest): boolean {
  return Boolean(request.imageConfigId || request.imageConfig);
}

function sanitizeLLMConfig(config?: PartialLLMConfig): SanitizedLLMConfig | undefined {
  if (!config) return undefined;
  const { apiKey: _apiKey, ...sanitized } = config;
  return Object.values(sanitized).some((value) => value !== undefined) ? sanitized : undefined;
}

function sanitizeImageConfig(config?: PartialImageGenConfig): SanitizedImageConfig | undefined {
  if (!config) return undefined;
  const { apiKey: _apiKey, ...sanitized } = config;
  return Object.values(sanitized).some((value) => value !== undefined) ? sanitized : undefined;
}

function isLocalApiUrl(apiUrl?: string): boolean {
  if (!apiUrl) return false;
  try {
    const url = new URL(apiUrl);
    return ["localhost", "127.0.0.1", "::1", "0.0.0.0"].includes(url.hostname);
  } catch {
    return false;
  }
}

function isSafeInlineLLMConfig(
  request: GenerateRequest,
  sanitized?: SanitizedLLMConfig,
): sanitized is SanitizedLLMConfig {
  return !request.llmConfig?.apiKey && isLocalApiUrl(sanitized?.apiUrl);
}

function isSafeInlineImageConfig(
  request: GenerateRequest,
  sanitized?: SanitizedImageConfig,
): sanitized is SanitizedImageConfig {
  return !request.imageConfig?.apiKey && isLocalApiUrl(sanitized?.apiUrl);
}

function matchesLLMConfig(candidate: UserLLMConfig, config?: SanitizedLLMConfig): boolean {
  if (!config) return false;
  return candidate.apiUrl === config.apiUrl
    && candidate.model === config.model
    && candidate.protocolType === config.provider;
}

function matchesImageConfig(candidate: UserImageConfig, config?: SanitizedImageConfig): boolean {
  if (!config) return false;
  return candidate.apiUrl === config.apiUrl
    && candidate.model === config.model
    && candidate.endpointType === config.endpointType
    && candidate.size === config.size
    && candidate.comfyuiWorkflow === config.comfyuiWorkflow;
}

function buildLLMConfig(config?: UserLLMConfig): PartialLLMConfig | undefined {
  if (!config) return undefined;
  return {
    apiUrl: config.apiUrl,
    apiKey: config.apiKey,
    model: config.model,
    provider: config.protocolType,
  };
}

function buildImageConfig(config?: UserImageConfig): PartialImageGenConfig | undefined {
  if (!config) return undefined;
  return {
    apiUrl: config.apiUrl,
    apiKey: config.apiKey,
    model: config.model,
    size: config.size,
    endpointType: config.endpointType as ImageEndpointType,
    comfyuiWorkflow: config.comfyuiWorkflow,
  };
}

function resolveLLMConfig(
  payload: ServerScriptReplayPayload["llm"],
  config: UserAPIConfigV2 | null,
): PartialLLMConfig | undefined {
  if (!payload) return undefined;

  if (config && payload.configId) {
    const matched = config.llmConfigs.find((item) => item.id === payload.configId);
    if (matched) return buildLLMConfig(matched);
  }

  if (config && payload.fallback) {
    const matched = config.llmConfigs.find((item) => matchesLLMConfig(item, payload.fallback));
    if (matched) return buildLLMConfig(matched);
  }

  return payload.fallback;
}

function resolveImageConfig(
  payload: ServerScriptReplayPayload["image"],
  config: UserAPIConfigV2 | null,
): PartialImageGenConfig | undefined {
  if (!payload) return undefined;

  if (config && payload.configId) {
    const matched = config.imageConfigs.find((item) => item.id === payload.configId);
    if (matched) return buildImageConfig(matched);
  }

  if (config && payload.fallback) {
    const matched = config.imageConfigs.find((item) => matchesImageConfig(item, payload.fallback));
    if (matched) return buildImageConfig(matched);
  }

  return payload.fallback;
}

export function buildServerScriptReplayPayload(request: GenerateRequest): ServerScriptReplayPayload {
  const config = getConfig();
  const sanitizedLLM = sanitizeLLMConfig(request.llmConfig);
  const sanitizedImage = sanitizeImageConfig(request.imageConfig);
  const { llmConfig: _llmConfig, imageConfig: _imageConfig, ...requestWithoutSecrets } = request;

  const llmConfigId = request.llmConfigId
    ?? (sanitizedLLM ? config?.llmConfigs.find((item) => matchesLLMConfig(item, sanitizedLLM))?.id : undefined);
  const imageConfigId = request.imageConfigId
    ?? (sanitizedImage ? config?.imageConfigs.find((item) => matchesImageConfig(item, sanitizedImage))?.id : undefined);

  return {
    request: requestWithoutSecrets,
    llm: llmConfigId || isSafeInlineLLMConfig(request, sanitizedLLM) ? {
      configId: llmConfigId,
      fallback: isSafeInlineLLMConfig(request, sanitizedLLM) ? sanitizedLLM : undefined,
    } : undefined,
    image: imageConfigId || isSafeInlineImageConfig(request, sanitizedImage) ? {
      configId: imageConfigId,
      fallback: isSafeInlineImageConfig(request, sanitizedImage) ? sanitizedImage : undefined,
    } : undefined,
  };
}

export function validateServerReplayPayload(
  request: GenerateRequest,
  payload: ServerScriptReplayPayload,
): string | null {
  if (!payload.llm?.configId && !payload.llm?.fallback) {
    return "缺少可重放的 LLM 配置，请重新选择有效的模型配置后再试";
  }

  if (requestNeedsImageReplay(request) && !payload.image?.configId && !payload.image?.fallback) {
    return "缺少可重放的图片配置，请重新选择有效的图片模型配置后再试";
  }

  return null;
}

export function hydrateReplayRequest(payload: ServerScriptReplayPayload): GenerateRequest {
  const config = getConfig();

  return {
    ...payload.request,
    llmConfig: resolveLLMConfig(payload.llm, config),
    imageConfig: resolveImageConfig(payload.image, config),
  };
}
