import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ComicScript } from "@/lib/types";

const mockBlob = new Blob(["fake"], { type: "image/png" });

const mockCtx = {
  createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
  fillRect: vi.fn(),
  fillText: vi.fn(),
  drawImage: vi.fn(),
  save: vi.fn(),
  restore: vi.fn(),
  clip: vi.fn(),
  stroke: vi.fn(),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  quadraticCurveTo: vi.fn(),
  closePath: vi.fn(),
  arc: vi.fn(),
  fill: vi.fn(),
  fillStyle: "",
  font: "",
  strokeStyle: "",
  lineWidth: 0,
  textAlign: "left" as CanvasTextAlign,
};

const mockCanvas = {
  width: 0,
  height: 0,
  getContext: vi.fn(() => mockCtx),
  toBlob: vi.fn((cb: (b: Blob | null) => void) => cb(mockBlob)),
};

const mockAnchor = { href: "", download: "", click: vi.fn() };

const origCreateElement = globalThis.document?.createElement;
const origImage = globalThis.Image;
const origCreateObjectURL = globalThis.URL?.createObjectURL;
const origRevokeObjectURL = globalThis.URL?.revokeObjectURL;

beforeEach(() => {
  vi.resetAllMocks();
  mockCanvas.toBlob.mockImplementation((cb: (b: Blob | null) => void) => cb(mockBlob));
  mockCanvas.getContext.mockReturnValue(mockCtx);

  globalThis.document = globalThis.document || {};
  globalThis.document.createElement = vi.fn((tag: string) => {
    if (tag === "canvas") return mockCanvas as unknown as HTMLCanvasElement;
    if (tag === "a") return mockAnchor as unknown as HTMLAnchorElement;
    return {} as HTMLElement;
  });

  // @ts-expect-error - mock
  globalThis.Image = class {
    crossOrigin = "";
    src = "";
    onload: (() => void) | null = null;
    onerror: ((e: Error) => void) | null = null;
    constructor() {
      setTimeout(() => this.onload?.(), 0);
    }
  };

  globalThis.URL.createObjectURL = vi.fn(() => "blob:fake");
  globalThis.URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  if (origCreateElement) globalThis.document.createElement = origCreateElement;
  if (origImage) globalThis.Image = origImage;
  if (origCreateObjectURL) globalThis.URL.createObjectURL = origCreateObjectURL;
  if (origRevokeObjectURL) globalThis.URL.revokeObjectURL = origRevokeObjectURL;
});

const makeScript = (overrides?: Partial<ComicScript>): ComicScript => ({
  title: "Test Comic",
  topic: "Science",
  style: "flat",
  panels: [
    { id: 1, scene: "Scene 1", dialogue: "Hello", imagePrompt: "test", imageUrl: "http://img.png", status: "completed" },
    { id: 2, scene: "Scene 2", dialogue: "World", imagePrompt: "test2", imageUrl: "http://img2.png", status: "completed" },
  ] as ComicScript["panels"],
  ...overrides,
});

describe("generateShareCardBlob", () => {
  it("returns a Blob", async () => {
    const { generateShareCardBlob } = await import("@/lib/shareCard");
    const blob = await generateShareCardBlob(makeScript());
    expect(blob).toBeInstanceOf(Blob);
  });

  it("sets canvas dimensions to 1200x630", async () => {
    const { generateShareCardBlob } = await import("@/lib/shareCard");
    await generateShareCardBlob(makeScript());
    expect(mockCanvas.width).toBe(1200);
    expect(mockCanvas.height).toBe(630);
  });

  it("handles script with no valid panels", async () => {
    const { generateShareCardBlob } = await import("@/lib/shareCard");
    const script = makeScript({
      panels: [{ id: 1, scene: "s", dialogue: "d", imagePrompt: "p", imageUrl: "", status: "pending" }] as ComicScript["panels"],
    });
    const blob = await generateShareCardBlob(script);
    expect(blob).toBeInstanceOf(Blob);
  });

  it("truncates long titles", async () => {
    const { generateShareCardBlob } = await import("@/lib/shareCard");
    await generateShareCardBlob(makeScript({ title: "A".repeat(30) }));
    const titleCall = mockCtx.fillText.mock.calls.find(
      (c: unknown[]) => typeof c[0] === "string" && (c[0] as string).endsWith("..."),
    );
    expect(titleCall).toBeTruthy();
  });
});

describe("downloadShareCard", () => {
  it("creates a download link and clicks it", async () => {
    const { downloadShareCard } = await import("@/lib/shareCard");
    await downloadShareCard(makeScript());
    expect(mockAnchor.click).toHaveBeenCalled();
    expect(mockAnchor.download).toContain("分享卡片.png");
  });
});
