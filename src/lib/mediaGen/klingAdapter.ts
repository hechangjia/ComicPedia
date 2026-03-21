/**
 * Kling AI Video Generation Adapter
 *
 * Supports image-to-video generation via Kling API.
 * API docs: https://docs.qingque.cn/d/home/eZQB2yS-AOAbde5nLI_xIEHMA
 */

import type { MediaOutput } from "@/lib/types";
import type { MediaGenAdapter, MediaGenResult, VideoGenConfig } from "./index";

export const klingAdapter: MediaGenAdapter = {
  name: "kling",
  supportedTypes: ["video"],

  async generate(prompt: string, config: VideoGenConfig): Promise<MediaGenResult> {
    const body: Record<string, unknown> = {
      model: config.model || "kling-v1",
      prompt,
      duration: config.videoDuration || 5,
      resolution: config.resolution || "720p",
    };

    if (config.inputImage) {
      body.image = config.inputImage;
      body.mode = "img2video";
    }

    if (config.cameraMovement) {
      body.camera_control = config.cameraMovement;
    }

    // Route through Next.js proxy to avoid CORS
    const response = await fetch("/api/llm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetUrl: config.apiUrl,
        apiKey: config.apiKey,
        body,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `Kling API error: ${response.status}`);
    }

    const data = await response.json();

    const media: MediaOutput = {
      type: "video",
      url: data.data?.video_url || data.video_url || "",
      duration: config.videoDuration || 5,
      format: "mp4",
    };

    return { media, rawResponse: data };
  },
};
