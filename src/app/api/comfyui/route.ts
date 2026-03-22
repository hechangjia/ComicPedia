import { NextRequest, NextResponse } from "next/server";

/**
 * ComfyUI API 代理路由
 *
 * POST /api/comfyui
 * Body: { comfyuiUrl, workflow, prompt, width?, height?, seed?, negativePrompt? }
 *
 * 流程：
 *   1. 将 prompt 注入 workflow JSON 的文本编码节点
 *   2. 提交 workflow 到 ComfyUI /prompt
 *   3. 轮询 /history/{prompt_id} 等待完成
 *   4. 获取生成的图片，返回 base64
 */

const POLL_INTERVAL_MS = 500;
const MAX_POLL_TIME_MS = 120_000; // 2 分钟超时

interface ComfyUIRequest {
  comfyuiUrl: string;
  workflow: Record<string, unknown>;
  prompt: string;
  width?: number;
  height?: number;
  seed?: number;
  negativePrompt?: string;
  /** Base64 参考图（用于 IP-Adapter 角色一致性） */
  referenceImage?: string;
}

/** 检测 workflow 中是否包含 IP-Adapter 节点 */
function hasIPAdapter(workflow: Record<string, unknown>): boolean {
  for (const node of Object.values(workflow)) {
    const classType = (node as Record<string, unknown>).class_type as string | undefined;
    if (classType && (classType.includes("IPAdapter") || classType.includes("ip_adapter"))) {
      return true;
    }
  }
  return false;
}

/** 查找 workflow 中连接到 IP-Adapter 的 LoadImage 节点并注入参考图文件名 */
function injectReferenceImage(
  workflow: Record<string, unknown>,
  uploadedFilename: string,
): void {
  // 找到所有 IP-Adapter 节点的 image 输入引用的节点 ID
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

  // 将这些 LoadImage 节点的 image 输入设为上传的文件名
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

/**
 * 上传 base64 图片到 ComfyUI 的 /upload/image 端点。
 * 返回上传后的文件名。
 */
async function uploadImageToComfyUI(baseUrl: string, base64Data: string): Promise<string> {
  // 提取 MIME 和 raw base64
  const match = base64Data.match(/^data:(image\/\w+);base64,(.+)$/);
  if (!match) throw new Error("Invalid base64 image data");

  const mimeType = match[1];
  const ext = mimeType.split("/")[1] || "png";
  const buffer = Buffer.from(match[2], "base64");
  const filename = `comicpedia_ref_${Date.now()}.${ext}`;

  // 构建 multipart/form-data
  const boundary = "----ComicPediaBoundary" + Date.now();
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="${filename}"\r\nContent-Type: ${mimeType}\r\n\r\n`),
    buffer,
    Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="overwrite"\r\n\r\ntrue\r\n--${boundary}--\r\n`),
  ]);

  const res = await fetch(`${baseUrl}/upload/image`, {
    method: "POST",
    headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
    body,
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`ComfyUI upload failed (${res.status}): ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  return data.name || filename;
}

/** 在 workflow 中查找并替换 prompt、尺寸、seed、negativePrompt */
function injectParams(
  workflow: Record<string, unknown>,
  prompt: string,
  width?: number,
  height?: number,
  seed?: number,
  negativePrompt?: string,
): Record<string, unknown> {
  const wf = JSON.parse(JSON.stringify(workflow));

  // Step 1: 找到 KSampler 的正向和负向 prompt 节点 ID
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

  // Step 2: 注入参数
  for (const [nodeId, node] of Object.entries(wf)) {
    const n = node as Record<string, unknown>;
    const classType = n.class_type as string | undefined;
    const inputs = n.inputs as Record<string, unknown> | undefined;
    if (!inputs) continue;

    // 注入 prompt 到 CLIPTextEncode 节点
    if (classType === "CLIPTextEncode" && typeof inputs.text === "string") {
      if (positiveNodeIds.has(nodeId)) {
        // 正向 prompt 节点
        inputs.text = prompt;
      } else if (negativeNodeIds.has(nodeId) && negativePrompt) {
        // 负向 prompt 节点（仅在有 negativePrompt 时注入）
        inputs.text = negativePrompt;
      } else if (positiveNodeIds.size === 0) {
        // 无 KSampler 时注入所有 CLIPTextEncode
        inputs.text = prompt;
      }
    }

    // 注入尺寸到 EmptyLatentImage 系列节点
    if (classType && classType.includes("Empty") && typeof inputs.width === "number") {
      if (width) inputs.width = width;
      if (height) inputs.height = height;
    }

    // 注入 seed 到 KSampler
    if ((classType === "KSampler" || classType === "KSamplerAdvanced") && typeof inputs.seed === "number") {
      inputs.seed = seed !== undefined ? seed : Math.floor(Math.random() * 2 ** 53);
    }
  }

  return wf;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { comfyuiUrl, ping } = body;

    // Ping 模式：测试 ComfyUI 是否可达
    if (ping && comfyuiUrl) {
      const baseUrl = (comfyuiUrl as string).replace(/\/+$/, "");
      try {
        const res = await fetch(`${baseUrl}/system_stats`, {
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const stats = await res.json();
        const gpuName = stats.devices?.[0]?.name || "unknown";
        return NextResponse.json({
          ok: true,
          detail: `GPU: ${gpuName}`,
        });
      } catch (err) {
        return NextResponse.json(
          { error: `无法连接 ComfyUI (${comfyuiUrl}): ${err instanceof Error ? err.message : "超时"}` },
          { status: 502 },
        );
      }
    }

    const { workflow, prompt, width, height, seed, negativePrompt, referenceImage } = body as ComfyUIRequest;

    if (!comfyuiUrl || !workflow || !prompt) {
      return NextResponse.json(
        { error: "缺少必要参数: comfyuiUrl, workflow, prompt" },
        { status: 400 },
      );
    }

    const baseUrl = (comfyuiUrl as string).replace(/\/+$/, "");

    // 1. 注入参数到 workflow（始终使用随机 seed，避免 ComfyUI 缓存导致空 outputs）
    const effectiveSeed = Math.floor(Math.random() * 2 ** 53);
    const injectedWorkflow = injectParams(workflow, prompt, width, height, effectiveSeed, negativePrompt);

    // 1b. IP-Adapter 参考图注入（如果 workflow 包含 IP-Adapter 节点且有参考图）
    if (referenceImage && hasIPAdapter(injectedWorkflow)) {
      try {
        const uploadedFilename = await uploadImageToComfyUI(baseUrl, referenceImage);
        injectReferenceImage(injectedWorkflow, uploadedFilename);
        console.log("[ComfyUI] IP-Adapter reference image uploaded:", uploadedFilename);
      } catch (err) {
        console.warn("[ComfyUI] IP-Adapter reference upload failed, continuing without:", err instanceof Error ? err.message : err);
        // 非致命：参考图上传失败不阻塞生成
      }
    }

    // 2. 提交 workflow 到 ComfyUI
    const submitRes = await fetch(`${baseUrl}/prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: injectedWorkflow }),
    });

    if (!submitRes.ok) {
      const errText = await submitRes.text().catch(() => "");
      return NextResponse.json(
        { error: `ComfyUI 提交失败 (${submitRes.status}): ${errText.slice(0, 500)}` },
        { status: 502 },
      );
    }

    const submitData = await submitRes.json();
    const promptId = submitData.prompt_id;
    if (!promptId) {
      return NextResponse.json(
        { error: "ComfyUI 未返回 prompt_id" },
        { status: 502 },
      );
    }

    // 3. 轮询 /history/{prompt_id} 等待完成
    const startTime = Date.now();
    let outputImages: { filename: string; subfolder: string; type: string }[] = [];

    while (Date.now() - startTime < MAX_POLL_TIME_MS) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

      const historyRes = await fetch(`${baseUrl}/history/${promptId}`);
      if (!historyRes.ok) continue;

      const historyData = await historyRes.json();
      const result = historyData[promptId];
      if (!result) continue;

      // 检查是否完成（兼容不同 ComfyUI 版本）
      const isCompleted = result.status?.completed
        || result.status?.status_str === "success"
        || (!result.status && result.outputs && Object.keys(result.outputs).length > 0);

      if (isCompleted) {
        // 提取输出图片（兼容 images/gifs 等不同输出类型）
        const outputs = result.outputs || {};
        for (const [nodeId, nodeOutput] of Object.entries(outputs)) {
          const out = nodeOutput as Record<string, unknown>;
          // 尝试 images、gifs 等常见输出字段
          const imageList = (out.images || out.gifs) as
            Array<{ filename: string; subfolder: string; type: string }> | undefined;
          if (imageList && imageList.length > 0) {
            outputImages = imageList;
            break;
          }
        }

        // 如果 outputs 非空但没找到图片，记录调试信息
        if (outputImages.length === 0 && Object.keys(outputs).length > 0) {
          console.warn("[ComfyUI] 任务完成但未找到图片输出。outputs 结构:", JSON.stringify(outputs).slice(0, 1000));
        }

        // 缓存执行时 outputs 可能为空，检查 messages 中是否全部 cached
        if (outputImages.length === 0) {
          const messages = result.status?.messages || [];
          const isCached = messages.some((m: unknown[]) => m[0] === "execution_cached");
          if (isCached) {
            console.warn("[ComfyUI] 所有节点被缓存，outputs 为空。将使用随机 seed 重新提交。");
            // 不 break，继续轮询（不应该到这里，因为我们已经使用了随机 seed）
          }
        }
        break;
      }

      // 检查是否出错
      if (result.status?.status_str === "error") {
        const errMessages = result.status?.messages
          ? result.status.messages.map((m: unknown[]) => m[1]).join("; ")
          : "未知错误";
        return NextResponse.json(
          { error: `ComfyUI 生成出错: ${errMessages}` },
          { status: 500 },
        );
      }
    }

    if (outputImages.length === 0) {
      return NextResponse.json(
        { error: "ComfyUI 生成超时或无输出。请检查 workflow 是否包含 SaveImage/PreviewImage 输出节点，以及 ComfyUI 控制台是否有报错" },
        { status: 504 },
      );
    }

    // 4. 获取生成的图片
    const img = outputImages[0];
    const viewUrl = `${baseUrl}/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder || "")}&type=${encodeURIComponent(img.type || "output")}`;

    const imageRes = await fetch(viewUrl);
    if (!imageRes.ok) {
      return NextResponse.json(
        { error: `ComfyUI 图片获取失败: ${imageRes.status}` },
        { status: 502 },
      );
    }

    const imageBuffer = await imageRes.arrayBuffer();
    const base64 = Buffer.from(imageBuffer).toString("base64");
    const contentType = imageRes.headers.get("content-type") || "image/png";

    return NextResponse.json({
      image: `data:${contentType};base64,${base64}`,
    });
  } catch (error) {
    console.error("[API /comfyui POST]", error);
    return NextResponse.json(
      { error: `ComfyUI 请求失败: ${error instanceof Error ? error.message : "未知错误"}` },
      { status: 500 },
    );
  }
}
