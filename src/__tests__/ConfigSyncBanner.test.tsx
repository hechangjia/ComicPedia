import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ConfigSyncBanner } from "@/components/settings/ConfigSyncBanner";
describe("config save status banner", () => {
  it("announces pending state without claiming server persistence", () => {
    const html = renderToStaticMarkup(<ConfigSyncBanner status="saving" onRetry={() => {}} onReload={() => {}} />);
    expect(html).toContain('role="status"');
    expect(html).toContain("正在保存到服务器");
    expect(html).not.toContain("已保存到服务器");
  });
  it("shows recovery actions for failed saves and conflicts", () => {
    const html = renderToStaticMarkup(<ConfigSyncBanner status="conflict" error="版本冲突" onRetry={() => {}} onReload={() => {}} />);
    expect(html).toContain("版本冲突");
    expect(html).toContain("读取服务器版本");
    expect(html).not.toContain("重试保存");
  });
  it("does not hide local cache failure behind a server success", () => {
    const html = renderToStaticMarkup(<ConfigSyncBanner status="saved" storageError="缓存写入失败" onRetry={() => {}} onReload={() => {}} />);
    expect(html).toContain("已保存到服务器");
    expect(html).toContain("缓存写入失败");
  });
});
