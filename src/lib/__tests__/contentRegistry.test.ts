import { describe, it, expect } from "vitest";
import {
  getContentHandler,
  registerContentType,
  getRegisteredTypes,
  isRegisteredType,
} from "@/lib/contentRegistry";

describe("getContentHandler", () => {
  it("returns science handler by default", () => {
    const handler = getContentHandler();
    expect(handler).toBeDefined();
    expect(handler.buildPrompt).toBeTypeOf("function");
    expect(handler.parseResponse).toBeTypeOf("function");
  });

  it("returns science handler for undefined", () => {
    const handler = getContentHandler(undefined);
    expect(handler).toBeDefined();
  });

  it("returns handler for each built-in type", () => {
    const types = ["science", "poetry", "xiaohongshu", "novel", "wikipedia"] as const;
    for (const type of types) {
      const handler = getContentHandler(type);
      expect(handler, `handler for ${type}`).toBeDefined();
      expect(handler.buildPrompt).toBeTypeOf("function");
      expect(handler.parseResponse).toBeTypeOf("function");
    }
  });

  it("falls back to science for unknown type", () => {
    const handler = getContentHandler("nonexistent" as never);
    const scienceHandler = getContentHandler("science");
    expect(handler).toBe(scienceHandler);
  });

  it("buildPrompt returns non-empty string", () => {
    const handler = getContentHandler("science");
    const prompt = handler.buildPrompt({
      topic: "black holes",
      style: "flat",
      panelCount: 6,
    });
    expect(prompt).toBeTypeOf("string");
    expect(prompt.length).toBeGreaterThan(100);
  });

  it("parseResponse returns null for invalid input", () => {
    const handler = getContentHandler("science");
    expect(handler.parseResponse("not json")).toBeNull();
    expect(handler.parseResponse("{}")).toBeNull();
    expect(handler.parseResponse("")).toBeNull();
  });

  it("parseResponse parses valid script JSON", () => {
    const handler = getContentHandler("science");
    const validJSON = JSON.stringify({
      title: "Test Comic",
      topic: "Testing",
      style: "flat",
      panels: [
        { id: 1, scene: "Scene 1", dialogue: "Hello", imagePrompt: "a test scene, flat style" },
      ],
    });
    const result = handler.parseResponse(validJSON);
    expect(result).not.toBeNull();
    expect(result!.title).toBe("Test Comic");
    expect(result!.panels).toHaveLength(1);
    expect(result!.panels[0].status).toBe("pending");
  });
});

describe("registerContentType", () => {
  it("registers a new content type", () => {
    const mockHandler = {
      buildPrompt: () => "test prompt",
      parseResponse: () => null,
    };
    registerContentType("custom-test" as never, mockHandler);
    const handler = getContentHandler("custom-test" as never);
    expect(handler.buildPrompt({ topic: "", style: "flat" })).toBe("test prompt");

    // Cleanup: re-register won't cause issues
    registerContentType("custom-test" as never, mockHandler);
  });
});

describe("getRegisteredTypes", () => {
  it("includes all built-in types", () => {
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
  it("returns true for registered types", () => {
    expect(isRegisteredType("science")).toBe(true);
    expect(isRegisteredType("poetry")).toBe(true);
    expect(isRegisteredType("wikipedia")).toBe(true);
  });

  it("returns false for unregistered types", () => {
    expect(isRegisteredType("nonexistent")).toBe(false);
    expect(isRegisteredType("")).toBe(false);
  });
});
