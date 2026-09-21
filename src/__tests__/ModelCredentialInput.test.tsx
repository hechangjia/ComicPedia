import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect, vi } from "vitest";
import { ModelCredentialInput } from "@/components/settings/ModelCredentialInput";
vi.mock("react", async (original) => ({ ...await original<typeof import("react")>(), useId: () => "credential-test" }));
describe("model credential editor", () => {
  it("makes keep, replace and clear semantics explicit without revealing a stored key", () => {
    const html = renderToStaticMarkup(<ModelCredentialInput value="" hasApiKey clearApiKey={false} onChange={() => {}} />);
    expect(html).toContain("已保存密钥"); expect(html).toContain("留空保留"); expect(html).toContain("清除已保存密钥");
    expect(html).toContain('type="password"');
  });
  it("warns that unsaved key input must be re-entered after reload", () => {
    const html = renderToStaticMarkup(<ModelCredentialInput value="" apiKeyInputRequired onChange={() => {}} />);
    expect(html).toContain("重新输入");
  });
  it("keeps the reload requirement when toggling clear so canceling clear cannot lose it", () => {
    const onChange = vi.fn();
    const tree = ModelCredentialInput({ value: "", apiKeyInputRequired: true, onChange });
    const checkboxLabel = tree.props.children[3];
    checkboxLabel.props.children[0].props.onChange({ target: { checked: true } });
    expect(onChange.mock.calls[0][0].apiKeyInputRequired).not.toBe(false);
  });

});
