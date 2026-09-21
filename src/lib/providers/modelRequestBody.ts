import type { ModelConfigReference } from "@/lib/types";

/** Saved calls carry only a reference and task payload; ad-hoc drafts are explicitly separate. */
export function modelRequestBody(reference: ModelConfigReference | undefined, targetUrl: string, headers: Record<string, string>, payload: unknown) {
  return reference?.configId
    ? { modelRef: { id: reference.configId, role: reference.configRole ?? "llm" }, payload }
    : { targetUrl, headers, payload };
}
