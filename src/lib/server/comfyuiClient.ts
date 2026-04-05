const POLL_INTERVAL_MS = 500;
const MAX_POLL_TIME_MS = 120_000;

export interface RunComfyWorkflowInput {
  comfyuiUrl: string;
  workflow: Record<string, unknown>;
  prompt: string;
  width?: number;
  height?: number;
  seed?: number;
  negativePrompt?: string;
  referenceImage?: string;
}

export interface RunComfyWorkflowResult {
  image: string;
  promptId: string;
  seed: number;
}

export class ComfyUIClientError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ComfyUIClientError";
    this.status = status;
  }
}

function hasIPAdapter(workflow: Record<string, unknown>): boolean {
  for (const node of Object.values(workflow)) {
    const classType = (node as Record<string, unknown>).class_type as string | undefined;
    if (classType && (classType.includes("IPAdapter") || classType.includes("ip_adapter"))) {
      return true;
    }
  }
  return false;
}

function injectReferenceImage(
  workflow: Record<string, unknown>,
  uploadedFilename: string,
): void {
  const ipAdapterImageNodeIds = new Set<string>();
  for (const node of Object.values(workflow)) {
    const n = node as Record<string, unknown>;
    const classType = n.class_type as string | undefined;
    const inputs = n.inputs as Record<string, unknown> | undefined;
    if (!classType || !inputs) continue;
    if (classType.includes("IPAdapter") || classType.includes("ip_adapter")) {
      const image = inputs.image;
      if (Array.isArray(image) && typeof image[0] === "string") {
        ipAdapterImageNodeIds.add(image[0]);
      }
    }
  }

  for (const [nodeId, node] of Object.entries(workflow)) {
    const n = node as Record<string, unknown>;
    const classType = n.class_type as string | undefined;
    const inputs = n.inputs as Record<string, unknown> | undefined;
    if (!classType || !inputs) continue;
    if (ipAdapterImageNodeIds.has(nodeId) && (classType === "LoadImage" || classType.includes("LoadImage"))) {
      inputs.image = uploadedFilename;
    }
  }
}

async function uploadImageToComfyUI(baseUrl: string, base64Data: string): Promise<string> {
  const match = base64Data.match(/^data:(image\/\w+);base64,(.+)$/);
  if (!match) throw new Error("Invalid base64 image data");

  const mimeType = match[1];
  const ext = mimeType.split("/")[1] || "png";
  const buffer = Buffer.from(match[2], "base64");
  const filename = `comicpedia_ref_${Date.now()}.${ext}`;
  const boundary = `----ComicPediaBoundary${Date.now()}`;
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="${filename}"\r\nContent-Type: ${mimeType}\r\n\r\n`),
    buffer,
    Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="overwrite"\r\n\r\ntrue\r\n--${boundary}--\r\n`),
  ]);

  const res = await fetch(`${baseUrl}/upload/image`, {
    method: "POST",
    headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
    body,
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`ComfyUI upload failed (${res.status}): ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  return data.name || filename;
}

function injectParams(
  workflow: Record<string, unknown>,
  prompt: string,
  width?: number,
  height?: number,
  seed?: number,
  negativePrompt?: string,
): Record<string, unknown> {
  const wf = JSON.parse(JSON.stringify(workflow));
  const positiveNodeIds = new Set<string>();
  const negativeNodeIds = new Set<string>();

  for (const node of Object.values(wf)) {
    const n = node as Record<string, unknown>;
    const classType = n.class_type as string | undefined;
    const inputs = n.inputs as Record<string, unknown> | undefined;
    if (!inputs) continue;
    if (classType === "KSampler" || classType === "KSamplerAdvanced") {
      const positive = inputs.positive;
      if (Array.isArray(positive) && typeof positive[0] === "string") {
        positiveNodeIds.add(positive[0]);
      }
      const negative = inputs.negative;
      if (Array.isArray(negative) && typeof negative[0] === "string") {
        negativeNodeIds.add(negative[0]);
      }
    }
  }

  for (const [nodeId, node] of Object.entries(wf)) {
    const n = node as Record<string, unknown>;
    const classType = n.class_type as string | undefined;
    const inputs = n.inputs as Record<string, unknown> | undefined;
    if (!inputs) continue;

    if (classType === "CLIPTextEncode" && typeof inputs.text === "string") {
      if (positiveNodeIds.has(nodeId)) {
        inputs.text = prompt;
      } else if (negativeNodeIds.has(nodeId) && negativePrompt) {
        inputs.text = negativePrompt;
      } else if (positiveNodeIds.size === 0) {
        inputs.text = prompt;
      }
    }

    if (classType && classType.includes("Empty") && typeof inputs.width === "number") {
      if (width) inputs.width = width;
      if (height) inputs.height = height;
    }

    if ((classType === "KSampler" || classType === "KSamplerAdvanced") && typeof inputs.seed === "number") {
      inputs.seed = seed !== undefined ? seed : Math.floor(Math.random() * 2 ** 53);
    }
  }

  return wf;
}

export async function runComfyWorkflow(input: RunComfyWorkflowInput): Promise<RunComfyWorkflowResult> {
  const { comfyuiUrl, workflow, prompt, width, height, seed, negativePrompt, referenceImage } = input;
  const baseUrl = comfyuiUrl.replace(/\/+$/, "");
  const effectiveSeed = seed ?? Math.floor(Math.random() * 2 ** 53);
  const injectedWorkflow = injectParams(workflow, prompt, width, height, effectiveSeed, negativePrompt);

  if (referenceImage && hasIPAdapter(injectedWorkflow)) {
    try {
      const uploadedFilename = await uploadImageToComfyUI(baseUrl, referenceImage);
      injectReferenceImage(injectedWorkflow, uploadedFilename);
      console.log("[ComfyUI] IP-Adapter reference image uploaded:", uploadedFilename);
    } catch (err) {
      console.warn("[ComfyUI] IP-Adapter reference upload failed, continuing without:", err instanceof Error ? err.message : err);
    }
  }

  const submitRes = await fetch(`${baseUrl}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: injectedWorkflow }),
  });

  if (!submitRes.ok) {
    const errText = await submitRes.text().catch(() => "");
    throw new ComfyUIClientError(`ComfyUI 提交失败 (${submitRes.status}): ${errText.slice(0, 500)}`, 502);
  }

  const submitData = await submitRes.json();
  const promptId = submitData.prompt_id;
  if (!promptId) {
    throw new ComfyUIClientError("ComfyUI 未返回 prompt_id", 502);
  }

  const startTime = Date.now();
  let outputImages: { filename: string; subfolder: string; type: string }[] = [];

  while (Date.now() - startTime < MAX_POLL_TIME_MS) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

    const historyRes = await fetch(`${baseUrl}/history/${promptId}`);
    if (!historyRes.ok) continue;

    const historyData = await historyRes.json();
    const result = historyData[promptId];
    if (!result) continue;

    const isCompleted = result.status?.completed
      || result.status?.status_str === "success"
      || (!result.status && result.outputs && Object.keys(result.outputs).length > 0);

    if (isCompleted) {
      const outputs = result.outputs || {};
      for (const nodeOutput of Object.values(outputs)) {
        const out = nodeOutput as Record<string, unknown>;
        const imageList = (out.images || out.gifs) as
          Array<{ filename: string; subfolder: string; type: string }> | undefined;
        if (imageList && imageList.length > 0) {
          outputImages = imageList;
          break;
        }
      }

      if (outputImages.length === 0 && Object.keys(outputs).length > 0) {
        console.warn("[ComfyUI] 任务完成但未找到图片输出。outputs 结构:", JSON.stringify(outputs).slice(0, 1000));
      }

      if (outputImages.length === 0) {
        const messages = result.status?.messages || [];
        const isCached = messages.some((m: unknown[]) => m[0] === "execution_cached");
        if (isCached) {
          console.warn("[ComfyUI] 所有节点被缓存，outputs 为空。将使用随机 seed 重新提交。");
        }
      }
      break;
    }

    if (result.status?.status_str === "error") {
      const errMessages = result.status?.messages
        ? result.status.messages.map((m: unknown[]) => m[1]).join("; ")
        : "未知错误";
      throw new ComfyUIClientError(`ComfyUI 生成出错: ${errMessages}`, 500);
    }
  }

  if (outputImages.length === 0) {
    throw new ComfyUIClientError(
      "ComfyUI 生成超时或无输出。请检查 workflow 是否包含 SaveImage/PreviewImage 输出节点，以及 ComfyUI 控制台是否有报错",
      504,
    );
  }

  const img = outputImages[0];
  const viewUrl = `${baseUrl}/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder || "")}&type=${encodeURIComponent(img.type || "output")}`;
  const imageRes = await fetch(viewUrl);
  if (!imageRes.ok) {
    throw new ComfyUIClientError(`ComfyUI 图片获取失败: ${imageRes.status}`, 502);
  }

  const imageBuffer = await imageRes.arrayBuffer();
  const base64 = Buffer.from(imageBuffer).toString("base64");
  const contentType = imageRes.headers.get("content-type") || "image/png";

  return {
    image: `data:${contentType};base64,${base64}`,
    promptId,
    seed: effectiveSeed,
  };
}
