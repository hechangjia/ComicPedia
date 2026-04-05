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

  return {
    request: requestWithoutSecrets,
    llm: sanitizedLLM ? {
      configId: config?.llmConfigs.find((item) => matchesLLMConfig(item, sanitizedLLM))?.id,
      fallback: sanitizedLLM,
    } : undefined,
    image: sanitizedImage ? {
      configId: config?.imageConfigs.find((item) => matchesImageConfig(item, sanitizedImage))?.id,
      fallback: sanitizedImage,
    } : undefined,
  };
}

export function hydrateReplayRequest(payload: ServerScriptReplayPayload): GenerateRequest {
  const config = getConfig();

  return {
    ...payload.request,
    llmConfig: resolveLLMConfig(payload.llm, config),
    imageConfig: resolveImageConfig(payload.image, config),
  };
}
