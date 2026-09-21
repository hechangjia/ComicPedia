import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { BackupManager, BackupPreview } from "@/components/settings/BackupManager";
const preview = {revision:"a".repeat(64),counts:{tasks:2,characters:1,series:1,character_relations:0},conflicts:{tasks:["existing"],characters:[],series:[],character_relations:[]},assets:3,assetBytes:1024,exportedAt:"2026-09-21T00:00:00.000Z"};
describe("portable artwork backup UI",()=>{
  it("honestly describes scope, limits and non-restorable legacy JSON",()=>{
    const html=renderToStaticMarkup(<BackupManager />);
    expect(html).toContain("作品归档");expect(html).toContain("ZIP");expect(html).toContain("100 MiB");
    expect(html).toContain("不包含模型配置");expect(html).toContain("回收站");expect(html).toContain("JSON");
    expect(html).not.toContain("Full Backup");expect(html).not.toContain("commit this file to git");
    expect(html).toContain('accept=".zip,application/zip"');expect(html).toContain('type="password"');
  });
  it("cannot restore conflicting IDs without an explicit checkbox",()=>{
    const html=renderToStaticMarkup(<BackupPreview preview={preview} replace={false} busy={false} onReplace={vi.fn()} onRestore={vi.fn()} onCancel={vi.fn()} />);
    expect(html).toContain("1 条同 ID 数据");expect(html).toContain("图片");expect(html).toContain("existing");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>确认恢复作品<\/button>/);
    expect(html).toContain('type="checkbox"');expect(html).toContain("尚未写入");
  });
  it("allows a reviewed nonconflicting archive without requesting replacement",()=>{
    const html=renderToStaticMarkup(<BackupPreview preview={{...preview,conflicts:{tasks:[],characters:[],series:[],character_relations:[]}}} replace={false} busy={false} onReplace={vi.fn()} onRestore={vi.fn()} onCancel={vi.fn()} />);
    expect(html).not.toContain('type="checkbox"');expect(html).toMatch(/<button(?![^>]* disabled="")[^>]*>确认恢复作品<\/button>/);
  });
  it("locks restore and replacement controls during commit",()=>{
    const html=renderToStaticMarkup(<BackupPreview preview={preview} replace busy onReplace={vi.fn()} onRestore={vi.fn()} onCancel={vi.fn()} />);
    expect(html).toMatch(/<input[^>]*disabled=""/);expect(html).toContain("正在恢复");
  });
});

it("uses readable secondary text instead of the low-contrast muted token for backup warnings",()=>{
  const html=renderToStaticMarkup(<BackupManager />);
  expect(html).not.toContain("text-muted-foreground");
  expect(html).toContain("text-secondary-text");
  expect(html).toContain("bg-foreground text-background");
});
