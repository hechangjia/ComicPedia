import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const runAccuracyResearchMock = vi.fn();
const getConfigMock = vi.fn();

vi.mock("@/lib/accuracy/research", () => ({
  runAccuracyResearch: runAccuracyResearchMock,
}));

vi.mock("@/lib/server/db", () => ({
  getConfig: getConfigMock,
}));

function makeConfig() {
  return {
    accuracyConfig: {
      providers: [{ id: "search-1", kind: "search" }],
    },
  } as any;
}

describe("/api/accuracy/research POST", () => {
  beforeEach(() => {
    runAccuracyResearchMock.mockReset();
    getConfigMock.mockReset();
  });

  it("requires saved config", async () => {
    getConfigMock.mockReturnValue(null);

    const { POST } = await import("@/app/api/accuracy/research/route");
    const request = new NextRequest("http://localhost:3000/api/accuracy/research", {
      method: "POST",
      body: JSON.stringify({ topic: "雷电" }),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "尚未保存配置" });
  });

  it("requires a topic", async () => {
    getConfigMock.mockReturnValue(makeConfig());

    const { POST } = await import("@/app/api/accuracy/research/route");
    const request = new NextRequest("http://localhost:3000/api/accuracy/research", {
      method: "POST",
      body: JSON.stringify({}),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "缺少 topic" });
    expect(runAccuracyResearchMock).not.toHaveBeenCalled();
  });

  it("passes request payload through to the research runner", async () => {
    getConfigMock.mockReturnValue(makeConfig());
    runAccuracyResearchMock.mockResolvedValue({
      summary: "雷电由电荷差引发",
      facts: ["闪电先于雷声被看到"],
    });

    const { POST } = await import("@/app/api/accuracy/research/route");
    const request = new NextRequest("http://localhost:3000/api/accuracy/research", {
      method: "POST",
      body: JSON.stringify({
        topic: "雷电",
        contentType: "science",
        wikipediaContent: { title: "雷电" },
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      summary: "雷电由电荷差引发",
      facts: ["闪电先于雷声被看到"],
    });
    expect(runAccuracyResearchMock).toHaveBeenCalledWith({
      topic: "雷电",
      contentType: "science",
      wikipediaContent: { title: "雷电" },
      accuracyConfig: makeConfig().accuracyConfig,
    });
  });

  it("returns 500 when research throws", async () => {
    getConfigMock.mockReturnValue(makeConfig());
    runAccuracyResearchMock.mockRejectedValue(new Error("research failed"));

    const { POST } = await import("@/app/api/accuracy/research/route");
    const request = new NextRequest("http://localhost:3000/api/accuracy/research", {
      method: "POST",
      body: JSON.stringify({ topic: "雷电" }),
    });

    const response = await POST(request);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "research failed" });
  });
});
