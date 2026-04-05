import { NextRequest, NextResponse } from "next/server";
import { ComfyUIClientError, runComfyWorkflow } from "@/lib/server/comfyuiClient";

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

    const result = await runComfyWorkflow({
      comfyuiUrl,
      workflow,
      prompt,
      width,
      height,
      seed,
      negativePrompt,
      referenceImage,
    });

    return NextResponse.json({ image: result.image });
  } catch (error) {
    if (error instanceof ComfyUIClientError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[API /comfyui POST]", error);
    return NextResponse.json(
      { error: `ComfyUI 请求失败: ${error instanceof Error ? error.message : "未知错误"}` },
      { status: 500 },
    );
  }
}
