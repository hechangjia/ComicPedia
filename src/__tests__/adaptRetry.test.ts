/**
 * Tests for P2: Intelligent Retry Strategy (adaptPromptForRetry).
 *
 * The function is not exported directly, so we test it indirectly by
 * extracting the strategy logic into testable units. Since the function
 * lives inside taskLifecycle.ts (a client module with heavy deps),
 * we test the same logic via a duplicated pure-function version here.
 */
import { describe, it, expect } from "vitest";

// Replicate the strategy logic from taskLifecycle.ts for isolated testing.
// These are the same constants and functions used in production.

const SENSITIVE_TERMS = [
  "blood", "gore", "violence", "weapon", "gun", "knife", "sword",
  "nude", "naked", "sexy", "revealing", "provocative",
  "dead", "death", "kill", "murder", "corpse",
  "drug", "alcohol", "cigarette", "smoking",
];

const ATMOSPHERE_TERMS = [
  "atmospheric", "ethereal", "mystical", "dreamy", "moody",
  "serene", "tranquil", "melancholic", "whimsical", "nostalgic",
  "dramatic lighting", "volumetric", "rim light", "backlight",
  "golden hour", "sunset glow", "chiaroscuro", "bokeh",
  "depth of field", "lens flare", "motion blur",
  "in the background", "background details", "scattered",
];

function removeSensitiveTerms(prompt: string): string {
  let result = prompt;
  for (const term of SENSITIVE_TERMS) {
    result = result.replace(new RegExp(`\\b${term}\\b`, "gi"), "");
  }
  return result.replace(/,\s*,/g, ",").replace(/\s+/g, " ").trim();
}

function removeAtmosphereTerms(prompt: string): string {
  let result = removeSensitiveTerms(prompt);
  for (const term of ATMOSPHERE_TERMS) {
    result = result.replace(new RegExp(`\\b${term}\\b`, "gi"), "");
  }
  result = result.replace(/,\s*,/g, ",").replace(/\s+/g, " ").trim();
  const words = result.split(/\s+/);
  if (words.length > 200) {
    result = words.slice(0, 150).join(" ") + ", high quality illustration";
  }
  return result;
}

function adaptPromptForRetry(original: string, retryLevel: number, lastError: Error | null): string {
  const msg = lastError?.message?.toLowerCase() || "";

  if (msg.includes("safety") || msg.includes("content_filter") ||
      msg.includes("blocked") || msg.includes("nsfw") ||
      msg.includes("inappropriate") || msg.includes("violat")) {
    return removeSensitiveTerms(original);
  }

  // Rate limit must be checked before "too long" (avoids "Too Many Requests" false match)
  if (msg.includes("rate") || msg.includes("429") || msg.includes("quota")) {
    return original;
  }

  if (msg.includes("too long") || msg.includes("token") ||
      msg.includes("maximum") || msg.includes("length")) {
    const words = original.split(/\s+/).slice(0, 120);
    return words.join(" ") + ", high quality illustration";
  }

  if (retryLevel === 1) return removeSensitiveTerms(original);
  return removeAtmosphereTerms(original);
}

// ============================================================

describe("adaptPromptForRetry", () => {
  const BASE_PROMPT = "a warrior with sword and gun in dramatic lighting, blood splatter, atmospheric, golden hour, close-up portrait, anime style";

  describe("safety filter strategy", () => {
    it("removes sensitive terms on content_filter error", () => {
      const result = adaptPromptForRetry(BASE_PROMPT, 1, new Error("content_filter: unsafe content detected"));
      expect(result).not.toContain("sword");
      expect(result).not.toContain("gun");
      expect(result).not.toContain("blood");
      expect(result).toContain("anime style");
      expect(result).toContain("dramatic lighting");
    });

    it("removes sensitive terms on safety error", () => {
      const result = adaptPromptForRetry(BASE_PROMPT, 1, new Error("Request blocked due to safety"));
      expect(result).not.toContain("sword");
      expect(result).not.toContain("blood");
    });

    it("removes sensitive terms on nsfw error", () => {
      const result = adaptPromptForRetry(BASE_PROMPT, 1, new Error("NSFW content detected"));
      expect(result).not.toContain("sword");
    });

    it("removes sensitive terms on violation error", () => {
      const result = adaptPromptForRetry(BASE_PROMPT, 1, new Error("Content policy violated"));
      expect(result).not.toContain("blood");
    });
  });

  describe("prompt too long strategy", () => {
    it("truncates to 120 words on token limit error", () => {
      const longPrompt = Array.from({ length: 200 }, (_, i) => `word${i}`).join(" ");
      const result = adaptPromptForRetry(longPrompt, 1, new Error("Maximum token limit exceeded"));
      const words = result.split(/\s+/);
      // 120 original words + "high quality illustration" (3 words) + comma
      expect(words.length).toBeLessThanOrEqual(124);
      expect(result).toContain("high quality illustration");
    });

    it("truncates on 'too long' error", () => {
      const longPrompt = Array.from({ length: 200 }, (_, i) => `w${i}`).join(" ");
      const result = adaptPromptForRetry(longPrompt, 1, new Error("Prompt is too long"));
      expect(result.split(/\s+/).length).toBeLessThanOrEqual(124);
    });
  });

  describe("rate limit strategy", () => {
    it("keeps original prompt on 429 error", () => {
      const result = adaptPromptForRetry(BASE_PROMPT, 1, new Error("429 Too Many Requests"));
      expect(result).toBe(BASE_PROMPT);
    });

    it("keeps original prompt on rate limit error", () => {
      const result = adaptPromptForRetry(BASE_PROMPT, 1, new Error("Rate limit exceeded"));
      expect(result).toBe(BASE_PROMPT);
    });

    it("keeps original prompt on quota error", () => {
      const result = adaptPromptForRetry(BASE_PROMPT, 1, new Error("API quota exhausted"));
      expect(result).toBe(BASE_PROMPT);
    });
  });

  describe("default progressive strategy", () => {
    it("level 1: removes only sensitive terms", () => {
      const result = adaptPromptForRetry(BASE_PROMPT, 1, new Error("Unknown image gen error"));
      expect(result).not.toContain("sword");
      expect(result).not.toContain("blood");
      // Atmosphere terms preserved at level 1
      expect(result).toContain("dramatic lighting");
      expect(result).toContain("atmospheric");
    });

    it("level 2: removes sensitive + atmosphere terms", () => {
      const result = adaptPromptForRetry(BASE_PROMPT, 2, new Error("Unknown error"));
      expect(result).not.toContain("sword");
      expect(result).not.toContain("blood");
      expect(result).not.toContain("dramatic lighting");
      expect(result).not.toContain("atmospheric");
      expect(result).not.toContain("golden hour");
      // Core content preserved
      expect(result).toContain("anime style");
    });

    it("level 2: truncates if still over 200 words after cleanup", () => {
      const longPrompt = Array.from({ length: 250 }, (_, i) => `word${i}`).join(" ");
      const result = adaptPromptForRetry(longPrompt, 2, null);
      const words = result.split(/\s+/);
      expect(words.length).toBeLessThanOrEqual(154);
      expect(result).toContain("high quality illustration");
    });
  });

  describe("null error handling", () => {
    it("defaults to progressive strategy when error is null", () => {
      const result = adaptPromptForRetry(BASE_PROMPT, 2, null);
      expect(result).not.toContain("blood");
      expect(result).not.toContain("atmospheric");
    });
  });
});
