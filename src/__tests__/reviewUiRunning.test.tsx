import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { QualityScorePanel } from "@/components/result/QualityScorePanel";
vi.mock("@/hooks/useAPIConfig",()=>({getStoredConfigs:()=>({llmConfigs:[],vlmConfigs:[],imageConfigs:[]})}));

describe("review UI follows durable running state",()=>{
 it("keeps the initial VLM button disabled after the start request has returned",()=>{
  const html=renderToStaticMarkup(React.createElement(QualityScorePanel,{
   script:{title:"test",topic:"test",style:"flat",panels:[]},cachedVisualDiagnosisState:"running",
  }));
  expect(html).toContain("VLM 视觉评分中...");
  expect(html).toMatch(/<button[^>]*disabled=""[^>]*>[\s\S]*VLM 视觉评分中/);
 });
});
