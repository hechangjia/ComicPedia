/**
 * 媒体生成适配器抽象层
 *
 * 为 AnimePedia 演进准备的统一媒体生成接口。
 * 当前仅注册图片适配器，视频/动画适配器待 API 可用时实现。
 */

import type { MediaOutput, MediaType } from "../types";

// ============================================================
// 适配器接口
// ============================================================

export interface MediaGenConfig {
  type: MediaType;
  apiUrl: string;
  apiKey?: string;
  model?: string;
  size?: string;
  videoDuration?: number;
  resolution?: "720p" | "1080p";
  extraBody?: Record<string, unknown>;
}

export interface MediaGenResult {
  media: MediaOutput;
  rawResponse?: unknown;
}

export interface MediaGenAdapter {
  name: string;
  supportedTypes: MediaType[];
  generate(prompt: string, config: MediaGenConfig): Promise<MediaGenResult>;
}

// ============================================================
// 适配器注册表
// ============================================================

const adapters = new Map<string, MediaGenAdapter>();

export function registerMediaAdapter(name: string, adapter: MediaGenAdapter): void {
  adapters.set(name, adapter);
}

export function getMediaAdapter(name: string): MediaGenAdapter | undefined {
  return adapters.get(name);
}

export function getAdaptersByType(type: MediaType): MediaGenAdapter[] {
  return Array.from(adapters.values()).filter((a) => a.supportedTypes.includes(type));
}

export function getRegisteredAdapters(): string[] {
  return Array.from(adapters.keys());
}

// ============================================================
// 视频适配器接口预留（待实现）
// ============================================================

export interface VideoGenConfig extends MediaGenConfig {
  type: "video";
  inputImage?: string;
  videoDuration: number;
  resolution?: "720p" | "1080p";
  cameraMovement?: string;
}

// 支持的视频生成 API（待实现）:
// - Runway Gen-3/Gen-4: 图生视频
// - Kling: 文/图生视频
// - Pika: 文/图生视频
// - Sora: 文生视频 (OpenAI)
// - Seedance (字节跳动): 图生视频
