"use client";

export const DIMENSION_LABELS: Record<string, string> = {
  knowledge: "知识准确性",
  visualConsistency: "视觉一致性",
  narrativeCoherence: "叙事连贯性",
  compositionDiversity: "构图多样性",
};

export const VISUAL_DIMENSION_LABELS: Record<string, string> = {
  textImageAlignment: "图文匹配度",
  styleAdherence: "风格一致性",
  artifactScore: "画面完整度",
  compositionQuality: "构图质量",
};

export function avg(values: number[]): number {
  if (values.length === 0) return 5;
  return Math.round(values.reduce((s, v) => s + v, 0) / values.length * 10) / 10;
}
