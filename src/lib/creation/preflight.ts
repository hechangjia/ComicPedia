import type { GenerationPresetSnapshot, UserAPIConfigV2, UserLLMConfig, UserImageConfig } from "@/lib/types";
import type { ConfigSyncStatus } from "@/lib/config/configStore";
import { modelEndpoint } from "@/lib/providers/endpoints";

export interface CreationPreflightInput {
  config: UserAPIConfigV2;
  syncStatus: ConfigSyncStatus;
  selectedLLMId?: string | null;
  selectedImageId?: string | null;
  preset: GenerationPresetSnapshot;
  panelCount: number | null;
  customPanelCount: string;
  maxPanelCount: number;
}
export interface ModelSummary { id: string; name: string; model: string }
export interface CreationPreflight {
  canSubmit: boolean;
  errors: string[];
  warnings: string[];
  roles: { llm?: ModelSummary; image?: ModelSummary; review?: ModelSummary };
  panelCount: number | null;
  pauseAfterScript: boolean;
  lightCheckEnabled: boolean;
  submitLabel: string;
}
const summary = (model?: UserLLMConfig | UserImageConfig): ModelSummary | undefined => model ? { id: model.id, name: model.name, model: model.model } : undefined;
function validAddress(url: string): boolean { try { modelEndpoint(url, "models"); return true; } catch { return false; } }

/** Explain exactly this selection, not just whether the default model exists. No credentials in output. */
export function buildCreationPreflight(input: CreationPreflightInput): CreationPreflight {
  const { config, preset } = input;
  const llmId = input.selectedLLMId ?? config.activeLLMId;
  const imageId = input.selectedImageId ?? config.activeImageId;
  const llm = config.llmConfigs.find(model => model.id === llmId);
  const image = config.imageConfigs.find(model => model.id === imageId);
  const vision = config.vlmConfigs?.find(model => model.id === config.activeVLMId);
  const errors: string[] = [];
  const warnings: string[] = [];
  const syncMessages = {
    loading: "正在读取服务器配置，请稍候。",
    saving: "模型配置尚在保存，请等待服务器确认。",
    error: "模型配置尚未同步，请前往设置重试或补充密钥。",
    conflict: "模型配置存在版本冲突，请前往设置处理后再生成。",
  };
  if (input.syncStatus !== "saved") errors.push(syncMessages[input.syncStatus]);
  if (!llm || !llm.model.trim() || !validAddress(llm.apiUrl)) errors.push("请选择有效的分镜模型（LLM）；已删除的选择不会自动改用其他模型。");
  if (imageId && (!image || !validAddress(image.apiUrl))) errors.push("所选文生图配置不可用，请重新选择或在设置中修正。");
  const pauseAfterScript = preset.pauseAfterScript === true;
  if (!image && !pauseAfterScript) errors.push("自动出图需要文生图模型；也可选择先审核分镜的预设。");
  if (!image && pauseAfterScript) warnings.push("本次仅生成分镜；开始图片生成前还需配置文生图模型。");
  if (preset.calibrationMode === "required" && image?.endpointType !== "comfyui") errors.push("校准流程需要选择 ComfyUI 文生图配置。");
  if (image?.endpointType === "comfyui" && !image.comfyuiWorkflow?.trim()) errors.push("ComfyUI 配置缺少工作流，请先在设置中补充。");
  let panelCount = input.panelCount;
  if (input.customPanelCount.trim()) {
    panelCount = /^\d+$/.test(input.customPanelCount.trim()) ? Number(input.customPanelCount.trim()) : NaN;
  }
  if (panelCount !== null && (!Number.isSafeInteger(panelCount) || panelCount < 1 || panelCount > input.maxPanelCount)) errors.push(`分镜数量必须是 1–${input.maxPanelCount} 的整数，或选择自动。`);
  if (preset.imageConcurrency !== undefined && (!Number.isInteger(preset.imageConcurrency) || preset.imageConcurrency < 1 || preset.imageConcurrency > 4)) errors.push("图片并发设置必须为 1–4 的整数。");
  const lightCheckEnabled = preset.lightCheckMode !== "off";
  if (lightCheckEnabled && !vision && llm) warnings.push("未单独配置 VLM，将尝试使用分镜模型看图；需在设置中验证其视觉能力。");
  warnings.push("模型选择和字段完整不代表能力已验证；实际调用可能产生服务费用。");
  return { canSubmit: errors.length === 0, errors, warnings, roles: { llm: summary(llm), image: summary(image), review: lightCheckEnabled ? summary(vision ?? llm) : undefined },
    panelCount, pauseAfterScript, lightCheckEnabled, submitLabel: pauseAfterScript ? "生成分镜，先审核" : "生成分镜并自动出图" };
}
