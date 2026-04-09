import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api/taskMaintenance", () => ({
  scanTaskHealth: vi.fn(),
  lookupTaskRecords: vi.fn(),
  executeTaskHealthCleanup: vi.fn(),
}));

describe("MaintenancePanel", () => {
  it("renders the maintenance actions and lookup UI", async () => {
    const { MaintenancePanel } = await import("@/components/settings/MaintenancePanel");

    const html = renderToStaticMarkup(React.createElement(MaintenancePanel));

    expect(html).toContain("维护与修复");
    expect(html).toContain("扫描任务健康");
    expect(html).toContain("执行自动删除");
    expect(html).toContain("作品找回搜索");
    expect(html).toContain("搜索作品");
  });
});
