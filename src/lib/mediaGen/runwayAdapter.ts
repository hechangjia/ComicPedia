/**
 * Runway Gen-3/Gen-4 Video Generation Adapter
 *
 * Supports image-to-video and text-to-video generation.
 */

import type { MediaOutput } from "@/lib/types";
import type { MediaGenAdapter, MediaGenResult, VideoGenConfig } from "./index";

export const runwayAdapter: MediaGenAdapter = {
  name: "runway",
  supportedTypes: ["video"],

  async generate(prompt: string, config: VideoGenConfig): Promise<MediaGenResult> {
    const body: Record<string, unknown> = {
      model: config.model || "gen3a_turbo",
      prompt_text: prompt,
      duration: config.videoDuration || 5,
    };

    if (config.inputImage) {
      body.prompt_image = config.inputImage;
    }

    if (config.resolution === "1080p") {
      body.width = 1920;
      body.height = 1080;
    } else {
      body.width = 1280;
      body.height = 720;
    }

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
      throw new Error(err.error || `Runway API error: ${response.status}`);
    }

    const data = await response.json();

    const media: MediaOutput = {
      type: "video",
      url: data.output?.[0] || data.video_url || "",
      duration: config.videoDuration || 5,
      format: "mp4",
    };

    return { media, rawResponse: data };
  },
};
