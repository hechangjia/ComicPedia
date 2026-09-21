import React from "react";
import { describe, expect, it, vi } from "vitest";
import { AdvancedGenerationSettings } from "@/components/AdvancedGenerationSettings";
import { buildGenerationSnapshot } from "@/lib/config/generationPresets";
function controls(node: any): any[] {
  if (!node || typeof node !== "object") return [];
  return [...(["select", "input"].includes(node.type) ? [node] : []), ...React.Children.toArray(node.props?.children).flatMap(controls)];
}
describe("advanced generation overrides", () => {
  it("emits only the edited field, so switching presets does not freeze computed values", () => {
    const onChange = vi.fn();
    const tree = AdvancedGenerationSettings({ value: buildGenerationSnapshot("balanced-auto"), onChange });
    controls(tree).find(control => control.type === "select").props.onChange({ target: { value: "off" } });
    expect(onChange).toHaveBeenCalledWith({ lightCheckMode: "off" });
    const next = buildGenerationSnapshot("fast-draft", onChange.mock.calls[0][0]);
    expect(next.pauseAfterScript).toBe(false);
    expect(next.imageConcurrency).toBe(3);
  });
});
