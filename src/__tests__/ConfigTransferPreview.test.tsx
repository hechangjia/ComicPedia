import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ConfigTransferPreview } from "@/components/settings/ConfigTransferPreview";
import { createEmptyUserConfig } from "@/lib/config/userConfig";
import { mergeConfigArchive } from "@/lib/config/configTransfer";
describe("configuration import preview", () => {
  it("shows all roles, skip counts, credential consent and never renders key values", () => {
    const c = createEmptyUserConfig(); c.vlmConfigs = [{ id: "v", name: "Vision", provider: "custom", apiUrl: "http://localhost:8317", model: "luna", protocolType: "openai-compatible", apiKey: "never-render-this" }]; c.activeVLMId = "v";
    const plan = mergeConfigArchive(createEmptyUserConfig(), c, { createId: () => "fresh" });
    const html = renderToStaticMarkup(<ConfigTransferPreview parsed={{ config: c, credentialCount: 1, workflowCount: 0 }} plan={plan} includeCredentials={false} onCredentialsChange={() => {}} />);
    expect(html).toContain("视觉复审"); expect(html).toContain("检索服务"); expect(html).toContain("现有默认模型");
    expect(html).toContain('type="checkbox"'); expect(html).not.toContain("never-render-this"); expect(html).not.toContain("checked=");
  });
});
