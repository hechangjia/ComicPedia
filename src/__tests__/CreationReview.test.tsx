import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import { CreationReview } from "@/components/CreationReview";
import { buildCreationPreflight } from "@/lib/creation/preflight";
import { createEmptyUserConfig } from "@/lib/config/userConfig";
import { buildGenerationSnapshot } from "@/lib/config/generationPresets";
describe("creation review", () => {
  it("explains blockers and provides a settings recovery link without claiming capability", () => {
    const plan=buildCreationPreflight({config:createEmptyUserConfig(),syncStatus:'saved',preset:buildGenerationSnapshot('balanced-auto'),panelCount:null,customPanelCount:'',maxPanelCount:30});
    const html=renderToStaticMarkup(<CreationReview plan={plan}/>);
    expect(html).toContain('生成前检查');expect(html).toContain('href="/settings"');expect(html).toContain('分镜');expect(html).toContain('不代表能力已验证');
  });
});
