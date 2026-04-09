import { describe, expect, it } from "vitest";

describe("/api/health GET", () => {
  it("returns basic liveness metadata", async () => {
    const { GET } = await import("@/app/api/health/route");
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      status: "ok",
      uptime: expect.any(Number),
      timestamp: expect.any(String),
    });
  });
});
