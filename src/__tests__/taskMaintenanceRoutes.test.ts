import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const scanTaskHealthMock = vi.fn();
const lookupTaskRecordsMock = vi.fn();

vi.mock("@/lib/server/taskMaintenance", () => ({
  scanTaskHealth: scanTaskHealthMock,
  lookupTaskRecords: lookupTaskRecordsMock,
}));

describe("task maintenance routes", () => {
  it("returns grouped scan candidates", async () => {
    scanTaskHealthMock.mockReturnValue({
      autoDelete: [{ id: "arc_test_1", reason: "id matches arc_test_* fixture", snapshotToken: "arc_test_1|completed|2026-04-09T00:00:00.000Z|test" }],
      manualReview: [],
    });

    const { POST } = await import("@/app/api/admin/task-health/scan/route");
    const response = await POST(new NextRequest("http://localhost:3000/api/admin/task-health/scan", { method: "POST" }));
    const body = await response.json();

    expect(body.autoDelete).toHaveLength(1);
    expect(body.autoDelete[0].id).toBe("arc_test_1");
  });

  it("returns lookup matches for id/title/topic search", async () => {
    lookupTaskRecordsMock.mockReturnValue({
      active: [{ id: "real-1", title: "神农尝百草", invisibilityReason: "default_visible" }],
      trash: [],
    });

    const { GET } = await import("@/app/api/admin/task-lookup/route");
    const request = new NextRequest("http://localhost:3000/api/admin/task-lookup?q=%E7%A5%9E%E5%86%9C");
    const response = await GET(request);
    const body = await response.json();

    expect(body.active[0].id).toBe("real-1");
  });
});
