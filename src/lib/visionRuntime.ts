import type { PartialLLMConfig } from "./types";

/** Inject I/O into shared scoring logic; server-only storage never enters client bundles. */
export interface VisionRuntime {
  resolveImage(url: string): Promise<string | null>;
  request(config: PartialLLMConfig, payload: unknown): Promise<string>;
  checkpoint(): void;
  strict: boolean;
}
