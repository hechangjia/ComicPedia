import { describe, it, expect } from "vitest";
import { getContentHandler, getRegisteredTypes, isRegisteredType, registerContentType } from "@/lib/contentRegistry";

describe("contentRegistry", () => {
  describe("getRegisteredTypes", () => {
    it("returns all built-in content types", () => {
      const types = getRegisteredTypes();
      expect(types).toContain("science");
      expect(types).toContain("poetry");
      expect(types).toContain("xiaohongshu");
      expect(types).toContain("novel");
      expect(types).toContain("wikipedia");
      expect(types.length).toBeGreaterThanOrEqual(5);
    });
  });

  describe("isRegisteredType", () => {
    it("returns true for known types", () => {
      expect(isRegisteredType("science")).toBe(true);
      expect(isRegisteredType("poetry")).toBe(true);
      expect(isRegisteredType("wikipedia")).toBe(true);
    });

    it("returns false for unknown types", () => {
      expect(isRegisteredType("nonexistent")).toBe(false);
      expect(isRegisteredType("")).toBe(false);
    });
  });

  describe("getContentHandler", () => {
    it("returns handler for each registered type", () => {
      for (const type of getRegisteredTypes()) {
        const handler = getContentHandler(type);
        expect(handler).toBeDefined();
        expect(typeof handler.buildPrompt).toBe("function");
        expect(typeof handler.parseResponse).toBe("function");
      }
    });

    it("falls back to science for undefined/unknown type", () => {
      const handler = getContentHandler(undefined);
      const scienceHandler = getContentHandler("science");
      expect(handler).toBe(scienceHandler);

      const unknownHandler = getContentHandler("nonexistent" as never);
      expect(unknownHandler).toBe(scienceHandler);
    });

    it("science handler builds prompt with topic", () => {
      const handler = getContentHandler("science");
      const prompt = handler.buildPrompt({ topic: "black holes", style: "flat" });
      expect(prompt).toContain("black holes");
      expect(typeof prompt).toBe("string");
      expect(prompt.length).toBeGreaterThan(100);
    });

    it("wikipedia handler falls back to science when no content", () => {
      const handler = getContentHandler("wikipedia");
      const prompt = handler.buildPrompt({ topic: "DNA", style: "flat" });
      expect(prompt).toContain("DNA");
    });

    it("wikipedia handler uses content when provided", () => {
      const handler = getContentHandler("wikipedia");
      const prompt = handler.buildPrompt({
        topic: "DNA",
        style: "flat",
        wikipediaContent: {
          title: "DNA",
          extract: "Deoxyribonucleic acid is a polymer...",
          lang: "en",
        },
      });
      expect(prompt).toContain("Deoxyribonucleic acid");
      expect(prompt).toContain("DNA");
    });
  });

  describe("registerContentType", () => {
    it("registers a new content type", () => {
      const mockHandler = {
        buildPrompt: () => "test prompt",
        parseResponse: () => null,
      };

      registerContentType("test-custom" as never, mockHandler);
      expect(isRegisteredType("test-custom")).toBe(true);

      const handler = getContentHandler("test-custom" as never);
      expect(handler.buildPrompt({ topic: "x", style: "flat" })).toBe("test prompt");
    });
  });
});
