import { getStyleModifier, getStyleNegativePrompt } from "@/lib/config/styles";
import { getAllTasks, getConfig, getTaskById, registerImage, upsertTask, upsertTaskJob } from "@/lib/server/db";
import { forwardImageGenerationRequest } from "@/lib/server/imageGenerationService";
import { readImageByKey, saveImageFileAsync } from "@/lib/server/imageStorage";
import { runComfyWorkflow } from "@/lib/server/comfyuiClient";
import { buildEnhancedPromptWithLog, mergeReferenceImage } from "@/lib/client/promptEnhancer";
import type {
  ComicPanel,
  ComicStyle,
  GenerateTask,
  ImageEndpointType,
  PartialImageGenConfig,
  PartialLLMConfig,
  TaskJobRecord,
  UserAPIConfigV2,
  UserImageConfig,
} from "@/lib/types";
import { createTaskJob, listTaskJobsByTaskId, summarizeTaskJobs } from "./store";

const FILE_REF_PREFIX = "file://";
const DEFAULT_NEGATIVE_PROMPT_BASE = "watermark, signature, logo, speech bubble, dialogue bubble, narration box, low quality, blurry, deformed";
const TEXT_BAN_NEGATIVE = "text, caption, label, subtitle, title, letters, words, writing, font";
const PROCESSABLE_JOB_STATUSES = new Set<TaskJobRecord["status"]>([
  "queued",
  "generating",
  "persisting",
  "light_check",
]);

type SanitizedImageConfig = Omit<PartialImageGenConfig, "apiKey">;

interface StoredImageJobPayload extends Record<string, unknown> {
  image?: {
    configId?: string;
    fallback?: SanitizedImageConfig;
    overlay?: SanitizedImageConfig;
  };
}

export interface EnqueuePanelImageJobsInput {
  imageConfig?: PartialImageGenConfig;
  imageConfigId?: string;
  llmConfig?: PartialLLMConfig;
  panelIndices: number[];
}

export interface RunTaskImageQueueInput {
  imageConfig?: PartialImageGenConfig;
  llmConfig?: PartialLLMConfig;
}

export interface EnqueuePanelImageJobsResult {
  task: GenerateTask;
  jobs: TaskJobRecord[];
  enqueuedPanelIndices: number[];
  queueSummary: GenerateTask["queueSummary"];
}

function fileRefForKey(key: string): string {
  return `${FILE_REF_PREFIX}${key}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function getPanel(task: GenerateTask, panelIndex: number): ComicPanel {
  const panel = task.script?.panels[panelIndex];
  if (!task.script || !panel) {
    throw new Error(`Panel ${panelIndex} not found for task ${task.id}`);
  }
  return panel;
}

function sanitizeImageConfigForPayload(imageConfig?: PartialImageGenConfig): SanitizedImageConfig | undefined {
  if (!imageConfig) return undefined;
  const { apiKey: _apiKey, ...safeImageConfig } = imageConfig;
  return Object.values(safeImageConfig).some((value) => value !== undefined)
    ? safeImageConfig
    : undefined;
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

function isSafeInlineImageConfig(imageConfig?: PartialImageGenConfig): imageConfig is PartialImageGenConfig {
  return !imageConfig?.apiKey && isLocalApiUrl(imageConfig?.apiUrl);
}

function matchesImageConfig(candidate: UserImageConfig, config?: Omit<PartialImageGenConfig, "apiKey">): boolean {
  if (!config) return false;
  return candidate.apiUrl === config.apiUrl
    && candidate.model === config.model
    && candidate.endpointType === config.endpointType
    && candidate.size === config.size
    && candidate.comfyuiWorkflow === config.comfyuiWorkflow;
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

function buildDurableImageJobPayload(input: EnqueuePanelImageJobsInput): StoredImageJobPayload {
  const sanitizedImageConfig = sanitizeImageConfigForPayload(input.imageConfig);
  const config = getConfig();
  const resolvedConfigId = input.imageConfigId
    ?? (sanitizedImageConfig ? config?.imageConfigs.find((candidate) => matchesImageConfig(candidate, sanitizedImageConfig))?.id : undefined);
  const safeFallback = isSafeInlineImageConfig(input.imageConfig)
    ? sanitizedImageConfig
    : undefined;
  const overlay = resolvedConfigId ? sanitizedImageConfig : undefined;

  if (!resolvedConfigId && !safeFallback) {
    throw new Error("缺少可重放的图片配置，请重新选择有效的图片模型配置后再试");
  }

  return {
    image: {
      configId: resolvedConfigId,
      fallback: resolvedConfigId ? undefined : safeFallback,
      overlay,
    },
  };
}

function mergeImageConfig(
  baseConfig: PartialImageGenConfig,
  overlay?: SanitizedImageConfig,
): PartialImageGenConfig {
  if (!overlay) {
    return baseConfig;
  }

  return {
    ...baseConfig,
    ...overlay,
    extraBody: {
      ...baseConfig.extraBody,
      ...overlay.extraBody,
    },
  };
}

function resolveJobImageConfig(
  payload: StoredImageJobPayload["image"],
  config: UserAPIConfigV2 | null,
  fallback?: PartialImageGenConfig,
): PartialImageGenConfig | undefined {
  let resolved: PartialImageGenConfig | undefined;

  if (config && payload?.configId) {
    const matched = config.imageConfigs.find((candidate) => candidate.id === payload.configId);
    if (matched) {
      resolved = buildImageConfig(matched);
    }
  }

  if (!resolved && config && payload?.fallback) {
    const matched = config.imageConfigs.find((candidate) => matchesImageConfig(candidate, payload.fallback));
    if (matched) {
      resolved = buildImageConfig(matched);
    }
  }

  if (!resolved && payload?.fallback) {
    resolved = payload.fallback;
  }

  if (!resolved) {
    resolved = fallback;
  }

  return resolved ? mergeImageConfig(resolved, payload?.overlay) : undefined;
}

function getProviderName(imageConfig?: PartialImageGenConfig): string | undefined {
  if (imageConfig?.endpointType === "comfyui") {
    return "comfyui";
  }
  return imageConfig?.endpointType;
}

function getLatestJobsByPanel(jobs: TaskJobRecord[]): Map<number, TaskJobRecord> {
  const latestJobsByPanel = new Map<number, TaskJobRecord>();

  for (const job of jobs) {
    if (typeof job.panelIndex !== "number") {
      continue;
    }
    const current = latestJobsByPanel.get(job.panelIndex);
    if (!current || current.updatedAt.localeCompare(job.updatedAt) <= 0) {
      latestJobsByPanel.set(job.panelIndex, job);
    }
  }

  return latestJobsByPanel;
}

function pushImageVersion(panel: ComicPanel, imageUrl: string): void {
  if (!panel.imageVersions) {
    panel.imageVersions = [];
  }

  const lastVersion = panel.imageVersions[panel.imageVersions.length - 1];
  if (lastVersion?.imageUrl !== imageUrl) {
    panel.imageVersions.push({
      imageUrl,
      createdAt: Date.now(),
    });
  }

  panel.activeVersionIndex = panel.imageVersions.length - 1;
}

function isCalibrationRequired(task: GenerateTask): boolean {
  return task.presetSnapshot?.imageProvider === "comfyui"
    && task.presetSnapshot?.calibrationRequired === true;
}

function isCalibrationApproved(task: GenerateTask): boolean {
  return task.presetSnapshot?.calibrationApproved === true;
}

function buildQueueStatus(task: GenerateTask, jobs: TaskJobRecord[]): GenerateTask["status"] {
  const summary = summarizeTaskJobs(jobs);
  if (summary.calibrationPending > 0) {
    return "calibrating";
  }
  if (summary.queued > 0 || summary.running > 0) {
    return "image_queue_running";
  }
  if (summary.failed > 0 || summary.attachFailed > 0 || summary.paused > 0) {
    return "image_queue_paused";
  }
  if (task.script?.panels.every((panel) => panel.status === "completed")) {
    return "completed";
  }
  return "script_ready";
}

function buildTaskProgress(task: GenerateTask): number {
  if (!task.script?.panels.length) {
    return task.progress;
  }

  const totalPanels = task.script.panels.length;
  const completedPanels = task.script.panels.filter((panel) => panel.status === "completed").length;
  if (completedPanels === totalPanels) {
    return 100;
  }
  return 30 + Math.floor((completedPanels / totalPanels) * 70);
}

async function persistQueueState(taskId: string): Promise<GenerateTask> {
  const task = getTaskById(taskId);
  if (!task) {
    throw new Error(`Task not found: ${taskId}`);
  }

  const jobs = await listTaskJobsByTaskId(taskId);
  const queueSummary = summarizeTaskJobs(jobs);
  const nextTask: GenerateTask = {
    ...task,
    queueSummary,
    status: buildQueueStatus(task, jobs),
    progress: buildTaskProgress(task),
    updatedAt: new Date(),
  };
  upsertTask(nextTask);
  return nextTask;
}

function getJobImageConfig(job: TaskJobRecord, fallback?: PartialImageGenConfig): PartialImageGenConfig | undefined {
  const payload = job.payload as StoredImageJobPayload;
  return resolveJobImageConfig(payload.image, getConfig(), fallback);
}

function updateJob(job: TaskJobRecord, patch: Partial<TaskJobRecord>): TaskJobRecord {
  return {
    ...job,
    ...patch,
    updatedAt: nowIso(),
  };
}

function buildComfyNegativePrompt(style: ComicStyle): string | undefined {
  const textBan = style === "infographic" ? "" : TEXT_BAN_NEGATIVE;
  const styleNegative = getStyleNegativePrompt(style);
  const parts = [DEFAULT_NEGATIVE_PROMPT_BASE, textBan, styleNegative].filter(Boolean);
  const deduped = [...new Set(parts.join(", ").split(",").map((item) => item.trim()).filter(Boolean))];
  return deduped.join(", ") || undefined;
}

function buildImagesPayload(
  prompt: string,
  style: ComicStyle,
  imageConfig: PartialImageGenConfig,
  seed?: number,
): Record<string, unknown> {
  const textBan = style === "infographic" ? "" : TEXT_BAN_NEGATIVE;
  const styleNegative = getStyleNegativePrompt(style);
  const userNegative = imageConfig.extraBody?.negative_prompt;
  const negativePrompt = [...new Set(
    [DEFAULT_NEGATIVE_PROMPT_BASE, textBan, styleNegative, userNegative]
      .filter(Boolean)
      .join(", ")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  )].join(", ");

  return {
    model: imageConfig.model,
    prompt,
    size: imageConfig.size ?? "1024x1024",
    response_format: "b64_json",
    negative_prompt: negativePrompt,
    ...(seed !== undefined ? { seed } : {}),
    ...(imageConfig.extraBody ? {
      num_inference_steps: imageConfig.extraBody.num_inference_steps,
      guidance_scale: imageConfig.extraBody.guidance_scale,
      ...(imageConfig.extraBody.control_image ? {
        control_image: imageConfig.extraBody.control_image,
        control_mode: imageConfig.extraBody.control_mode ?? "HED",
      } : {}),
      ...(imageConfig.extraBody.control_context_scale !== undefined ? {
        control_context_scale: imageConfig.extraBody.control_context_scale,
      } : {}),
      ...(imageConfig.extraBody.image_scale !== undefined ? {
        image_scale: imageConfig.extraBody.image_scale,
      } : {}),
      ...(imageConfig.extraBody.image ? {
        image: imageConfig.extraBody.image,
      } : {}),
      ...(imageConfig.extraBody.strength !== undefined ? {
        strength: imageConfig.extraBody.strength,
      } : {}),
    } : {}),
  };
}

function buildChatPayload(prompt: string, imageConfig: PartialImageGenConfig): Record<string, unknown> {
  const hasReferenceImage = Boolean(imageConfig.extraBody?.image);
  const messageContent = hasReferenceImage
    ? [
      { type: "image_url", image_url: { url: imageConfig.extraBody!.image } },
      { type: "text", text: `Transform this image: ${prompt}` },
    ]
    : prompt;

  return {
    model: imageConfig.model,
    messages: [{ role: "user", content: messageContent }],
    modalities: ["text", "image"],
    size: imageConfig.size ?? "1024x1024",
    ...(imageConfig.size ? { extra_body: { size: imageConfig.size } } : {}),
  };
}

function extractImageFromPlain(text: string): string | undefined {
  const trimmed = text.trim();
  if (trimmed.startsWith("data:image")) {
    return trimmed;
  }

  const clean = trimmed.replace(/\s/g, "");
  if (clean.length > 500 && /^[A-Za-z0-9+/=]+$/.test(clean)) {
    return `data:image/png;base64,${clean}`;
  }

  return undefined;
}

function extractImageFromContentPart(part: Record<string, unknown>): string | undefined {
  if (part.image_url && typeof part.image_url === "object") {
    const url = (part.image_url as Record<string, unknown>).url;
    if (typeof url === "string") {
      return url;
    }
  }

  if (typeof part.image_url === "string") {
    return part.image_url;
  }

  if (part.inline_data && typeof part.inline_data === "object") {
    const inlineData = part.inline_data as Record<string, unknown>;
    if (typeof inlineData.data === "string") {
      const mimeType = typeof inlineData.mime_type === "string"
        ? inlineData.mime_type
        : typeof inlineData.mimeType === "string"
          ? inlineData.mimeType
          : "image/png";
      return `data:${mimeType};base64,${inlineData.data}`;
    }
  }

  if ((part.type === "output_image" || part.output_image) && typeof (part.output_image ?? part) === "object") {
    const outputImage = (part.output_image ?? part) as Record<string, unknown>;
    if (typeof outputImage.url === "string") {
      return outputImage.url;
    }
    if (typeof outputImage.data === "string") {
      const format = typeof outputImage.format === "string" ? outputImage.format : "png";
      return `data:image/${format};base64,${outputImage.data}`;
    }
  }

  if (part.type === "image" && typeof part.data === "string") {
    return `data:image/png;base64,${part.data}`;
  }

  if (part.type === "image" && typeof part.url === "string") {
    return part.url;
  }

  if (typeof part.b64_json === "string") {
    const mimeType = typeof part.content_type === "string" ? part.content_type : "image/png";
    return `data:${mimeType};base64,${part.b64_json}`;
  }

  return undefined;
}

function extractImageFromContent(content: unknown): string | undefined {
  if (!content) {
    return undefined;
  }
  if (Array.isArray(content)) {
    for (const part of content) {
      if (part && typeof part === "object") {
        const extracted = extractImageFromContentPart(part as Record<string, unknown>);
        if (extracted) {
          return extracted;
        }
      }
    }
    return undefined;
  }
  if (typeof content === "string") {
    return extractImageFromPlain(content);
  }
  return undefined;
}

function extractGeneratedImage(response: Record<string, unknown>): string | undefined {
  const dataArray = response.data as Array<{ url?: string; b64_json?: string; content_type?: string }> | undefined;
  if (Array.isArray(dataArray) && dataArray.length > 0) {
    const first = dataArray[0];
    if (typeof first.b64_json === "string") {
      return `data:${first.content_type || "image/png"};base64,${first.b64_json}`;
    }
    if (typeof first.url === "string") {
      return first.url;
    }
  }

  const choices = response.choices as Array<{ message?: { content?: unknown } }> | undefined;
  const choiceImage = extractImageFromContent(choices?.[0]?.message?.content);
  if (choiceImage) {
    return choiceImage;
  }

  const output = response.output as Array<{ content?: unknown }> | undefined;
  if (Array.isArray(output)) {
    for (const item of output) {
      const outputImage = extractImageFromContent(item.content);
      if (outputImage) {
        return outputImage;
      }
      if (item && typeof item === "object") {
        const extracted = extractImageFromContentPart(item as Record<string, unknown>);
        if (extracted) {
          return extracted;
        }
      }
    }
  }

  return undefined;
}

async function generatePanelImage(
  task: GenerateTask,
  panelIndex: number,
  imageConfig: PartialImageGenConfig,
): Promise<{ image: string; promptSnapshot: string }> {
  const panel = getPanel(task, panelIndex);
  const directorComposition = task.narrativeOutline?.panels[panelIndex]?.suggestedComposition;
  const enhancement = buildEnhancedPromptWithLog(
    panel.imagePrompt,
    panelIndex,
    task.script?.characterDescription,
    panel.styleOverride ?? task.script!.style,
    task.script!.panels.length,
    directorComposition,
  );
  const mergedConfig = mergeReferenceImage(imageConfig, task.script!, panel, panelIndex);
  const style = panel.styleOverride ?? task.script!.style;
  const prompt = enhancement.enhanced;
  const seed = task.script?.seed !== undefined ? task.script.seed + panelIndex : undefined;

  if (mergedConfig?.endpointType === "comfyui") {
    if (!mergedConfig.apiUrl || !mergedConfig.comfyuiWorkflow) {
      throw new Error("ComfyUI queue run requires apiUrl and comfyuiWorkflow");
    }

    let workflow: Record<string, unknown>;
    try {
      workflow = JSON.parse(mergedConfig.comfyuiWorkflow);
    } catch {
      throw new Error("ComfyUI workflow JSON is invalid");
    }

    const [width, height] = (mergedConfig.size ?? "1024x1024").split("x").map(Number);
    const referenceImage = mergedConfig.extraBody?.control_image ?? mergedConfig.extraBody?.image;
    const result = await runComfyWorkflow({
      comfyuiUrl: mergedConfig.apiUrl,
      workflow,
      prompt: `${getStyleModifier(style)}, ${prompt}`,
      negativePrompt: buildComfyNegativePrompt(style),
      referenceImage: typeof referenceImage === "string" && referenceImage.startsWith("data:image")
        ? referenceImage
        : undefined,
      width: width || 1024,
      height: height || 1024,
      seed,
    });

    return {
      image: result.image,
      promptSnapshot: prompt,
    };
  }

  if (!mergedConfig?.apiUrl) {
    throw new Error("Image queue run requires imageConfig.apiUrl");
  }

  const baseUrl = mergedConfig.apiUrl.replace(/\/+$/, "");
  const useChatEndpoint = mergedConfig.endpointType === "chat"
    || (mergedConfig.endpointType !== "images" && baseUrl.includes("/chat/completions"));
  const targetUrl = useChatEndpoint
    ? (baseUrl.includes("/chat/completions") ? baseUrl : `${baseUrl}/chat/completions`)
    : (baseUrl.includes("/images/") ? baseUrl : `${baseUrl}/images/generations`);
  const payload = useChatEndpoint
    ? buildChatPayload(`${getStyleModifier(style)}, ${prompt}`, mergedConfig)
    : buildImagesPayload(`${getStyleModifier(style)}, ${prompt}`, style, mergedConfig, seed);
  const headers = mergedConfig.apiKey
    ? { Authorization: `Bearer ${mergedConfig.apiKey}` }
    : undefined;
  const response = await forwardImageGenerationRequest({
    targetUrl,
    headers,
    payload,
  });

  const image = "body" in response
    ? extractImageFromPlain(String(response.body))
    : extractGeneratedImage(response);

  if (!image) {
    throw new Error("Image provider response did not include an image");
  }

  return {
    image,
    promptSnapshot: prompt,
  };
}

async function persistGeneratedImage(taskId: string, panelIndex: number, jobId: string, image: string): Promise<string> {
  const outputFileKey = `${taskId}_panel${panelIndex}_job_${jobId}`;
  const stored = await saveImageFileAsync(outputFileKey, image);
  if (!stored) {
    throw new Error("Generated image is not a valid image data URI");
  }
  registerImage(outputFileKey, stored.filePath, stored.size);
  return outputFileKey;
}

async function attachPersistedImage(taskId: string, job: TaskJobRecord): Promise<void> {
  if (typeof job.panelIndex !== "number") {
    throw new Error(`Job ${job.id} is missing panelIndex`);
  }
  if (!job.outputFileKey) {
    throw new Error(`Job ${job.id} is missing outputFileKey`);
  }
  if (!readImageByKey(job.outputFileKey)) {
    throw new Error(`Persisted image not found for ${job.outputFileKey}`);
  }

  const task = getTaskById(taskId);
  if (!task || !task.script) {
    throw new Error(`Task not found: ${taskId}`);
  }

  const panel = getPanel(task, job.panelIndex);
  const nextImageRef = fileRefForKey(job.outputFileKey);
  if (panel.imageUrl && panel.imageUrl !== nextImageRef) {
    pushImageVersion(panel, panel.imageUrl);
  }
  pushImageVersion(panel, nextImageRef);
  panel.imageUrl = nextImageRef;
  panel.status = "completed";
  task.updatedAt = new Date();
  upsertTask(task);
}

async function markRemainingJobsCalibrating(taskId: string, remainingJobIds: Set<string>): Promise<void> {
  const jobs = await listTaskJobsByTaskId(taskId);
  for (const job of jobs) {
    if (!remainingJobIds.has(job.id)) {
      continue;
    }
    if (PROCESSABLE_JOB_STATUSES.has(job.status)) {
      upsertTaskJob(updateJob(job, {
        status: "calibrating",
        lastError: undefined,
      }));
    }
  }
  await persistQueueState(taskId);
}

export async function enqueuePanelImageJobs(
  taskId: string,
  input: EnqueuePanelImageJobsInput,
): Promise<EnqueuePanelImageJobsResult> {
  const task = getTaskById(taskId);
  if (!task || !task.script) {
    throw new Error(`Task not found: ${taskId}`);
  }

  const uniquePanelIndices = [...new Set(input.panelIndices)]
    .filter((panelIndex) => Number.isInteger(panelIndex) && panelIndex >= 0 && panelIndex < task.script!.panels.length)
    .sort((left, right) => left - right);
  const existingJobs = await listTaskJobsByTaskId(taskId);
  const latestJobsByPanel = getLatestJobsByPanel(existingJobs);
  const durableImagePayload = input.imageConfig || input.imageConfigId
    ? buildDurableImageJobPayload(input)
    : undefined;

  for (const panelIndex of uniquePanelIndices) {
    const existingJob = latestJobsByPanel.get(panelIndex);
    if (existingJob) {
      const nextJob = updateJob(existingJob, {
        kind: "panel_image",
        status: "queued",
        provider: getProviderName(input.imageConfig) ?? existingJob.provider,
        model: input.imageConfig?.model ?? existingJob.model,
        promptSnapshot: getPanel(task, panelIndex).imagePrompt,
        lastError: undefined,
        outputFileKey: existingJob.status === "attach_failed" ? existingJob.outputFileKey : undefined,
        payload: {
          ...existingJob.payload,
          ...(durableImagePayload ?? {}),
        },
      });
      upsertTaskJob(nextJob);
      continue;
    }

    if (!durableImagePayload) {
      throw new Error("缺少可重放的图片配置，请重新选择有效的图片模型配置后再试");
    }

    await createTaskJob({
      taskId,
      kind: "panel_image",
      status: "queued",
      panelIndex,
      provider: getProviderName(input.imageConfig),
      model: input.imageConfig?.model,
      promptSnapshot: getPanel(task, panelIndex).imagePrompt,
      payload: durableImagePayload,
    });
  }

  const nextTask = await persistQueueState(taskId);
  const jobs = await listTaskJobsByTaskId(taskId);
  return {
    task: nextTask,
    jobs,
    enqueuedPanelIndices: uniquePanelIndices,
    queueSummary: nextTask.queueSummary,
  };
}

export async function approveTaskCalibration(taskId: string): Promise<GenerateTask> {
  const task = getTaskById(taskId);
  if (!task) {
    throw new Error(`Task not found: ${taskId}`);
  }

  const nextTask: GenerateTask = {
    ...task,
    presetSnapshot: task.presetSnapshot
      ? { ...task.presetSnapshot, calibrationApproved: true }
      : undefined,
    updatedAt: new Date(),
  };
  upsertTask(nextTask);

  const jobs = await listTaskJobsByTaskId(taskId);
  for (const job of jobs) {
    if (job.status === "calibrating") {
      upsertTaskJob(updateJob(job, { status: "queued", lastError: undefined }));
    }
  }

  return persistQueueState(taskId);
}

export async function runTaskImageQueue(taskId: string, fallbackInput?: RunTaskImageQueueInput): Promise<void> {
  let task = getTaskById(taskId);
  if (!task || !task.script) {
    return;
  }

  let calibrationGatePending = isCalibrationRequired(task) && !isCalibrationApproved(task);

  while (true) {
    task = getTaskById(taskId);
    if (!task || !task.script) {
      return;
    }

    let liveJob = (await listTaskJobsByTaskId(taskId)).find((candidate) =>
      candidate.kind === "panel_image"
      && typeof candidate.panelIndex === "number"
      && PROCESSABLE_JOB_STATUSES.has(candidate.status),
    );
    if (!liveJob || typeof liveJob.panelIndex !== "number") {
      break;
    }

    const panelIndex = liveJob.panelIndex;
    const liveJobId = liveJob.id;
    const panel = getPanel(task, panelIndex);
    const previousPanelState = {
      imageUrl: panel.imageUrl,
      status: panel.status,
      imageVersions: panel.imageVersions ? structuredClone(panel.imageVersions) : undefined,
      activeVersionIndex: panel.activeVersionIndex,
      enhancementLog: panel.enhancementLog ? structuredClone(panel.enhancementLog) : undefined,
    };
    panel.status = "generating";
    const enhancement = buildEnhancedPromptWithLog(
      panel.imagePrompt,
      panelIndex,
      task.script.characterDescription,
      panel.styleOverride ?? task.script.style,
      task.script.panels.length,
      task.narrativeOutline?.panels[panelIndex]?.suggestedComposition,
    );
    panel.enhancementLog = enhancement;
    task.updatedAt = new Date();
    upsertTask(task);

    try {
      if (liveJob.outputFileKey && readImageByKey(liveJob.outputFileKey)) {
        liveJob = updateJob(liveJob, { status: "persisting" });
        upsertTaskJob(liveJob);
        await attachPersistedImage(taskId, liveJob);
      } else {
        liveJob = updateJob(liveJob, {
          status: "generating",
          attemptCount: liveJob.attemptCount + 1,
          lastError: undefined,
        });
        upsertTaskJob(liveJob);

        const imageConfig = getJobImageConfig(liveJob, fallbackInput?.imageConfig);
        if (!imageConfig) {
          throw new Error(`Job ${liveJob.id} is missing imageConfig`);
        }

        const generated = await generatePanelImage(task, panelIndex, imageConfig);
        liveJob = updateJob(liveJob, {
          status: "persisting",
          promptSnapshot: generated.promptSnapshot,
        });
        upsertTaskJob(liveJob);

        const outputFileKey = await persistGeneratedImage(taskId, panelIndex, liveJob.id, generated.image);
        liveJob = updateJob(liveJob, {
          status: "light_check",
          outputFileKey,
        });
        upsertTaskJob(liveJob);
        await attachPersistedImage(taskId, liveJob);
      }

      upsertTaskJob(updateJob(liveJob, {
        status: "completed",
        lastError: undefined,
      }));
      await persistQueueState(taskId);

      if (calibrationGatePending) {
        const remainingJobs = (await listTaskJobsByTaskId(taskId)).filter((job) =>
          job.kind === "panel_image"
          && job.id !== liveJobId
          && PROCESSABLE_JOB_STATUSES.has(job.status),
        );
        if (remainingJobs.length > 0) {
          await markRemainingJobsCalibrating(taskId, new Set(remainingJobs.map((job) => job.id)));
          return;
        }
        calibrationGatePending = false;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown image queue error";
      const failedStatus: TaskJobRecord["status"] = liveJob.outputFileKey ? "attach_failed" : "failed";
      if (failedStatus === "attach_failed" && previousPanelState.status === "completed" && previousPanelState.imageUrl) {
        const latestTask = getTaskById(taskId);
        if (latestTask?.script) {
          const latestPanel = getPanel(latestTask, panelIndex);
          latestPanel.imageUrl = previousPanelState.imageUrl;
          latestPanel.status = previousPanelState.status;
          latestPanel.imageVersions = previousPanelState.imageVersions;
          latestPanel.activeVersionIndex = previousPanelState.activeVersionIndex;
          latestPanel.enhancementLog = previousPanelState.enhancementLog;
          latestTask.updatedAt = new Date();
          upsertTask(latestTask);
        }
      } else if (failedStatus === "attach_failed") {
        const latestTask = getTaskById(taskId);
        if (latestTask?.script) {
          const latestPanel = getPanel(latestTask, panelIndex);
          latestPanel.imageUrl = undefined;
          latestPanel.status = "failed";
          latestPanel.activeVersionIndex = previousPanelState.activeVersionIndex;
          latestTask.updatedAt = new Date();
          upsertTask(latestTask);
        }
      }
      upsertTaskJob(updateJob(liveJob, {
        status: failedStatus,
        lastError: message,
      }));
      await persistQueueState(taskId);
    }
  }

  await persistQueueState(taskId);
}

export async function listReplayableImageTasks(): Promise<Array<{
  taskId: string;
}>> {
  const replayableTasks: Array<{ taskId: string }> = [];

  for (const task of getAllTasks()) {
    const jobs = await listTaskJobsByTaskId(task.id);
    const replayableJob = jobs.find((job) =>
      job.kind === "panel_image"
      && PROCESSABLE_JOB_STATUSES.has(job.status),
    );

    if (!replayableJob || replayableJob.status === "calibrating") {
      continue;
    }

    replayableTasks.push({
      taskId: task.id,
    });
  }

  return replayableTasks;
}
