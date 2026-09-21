export type ModelOperation = "chat" | "images" | "models" | "messages";
const suffixes: Record<ModelOperation, string> = {
  chat: "/chat/completions", images: "/images/generations", models: "/models", messages: "/messages",
};

/** Accept a server root, versioned base or full endpoint without duplicating paths. */
export function modelEndpoint(input: string, operation: ModelOperation): string {
  const url = new URL(input.trim());
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error("API 地址必须是无内嵌凭据、查询参数或片段的 HTTP(S) 地址");
  }
  let base = url.pathname.replace(/\/+$/, "");
  let explicitEndpoint = false;
  for (const suffix of Object.values(suffixes)) {
    if (base.endsWith(suffix)) { base = base.slice(0, -suffix.length); explicitEndpoint = true; break; }
  }
  url.pathname = `${base || (explicitEndpoint ? "" : "/v1")}${suffixes[operation]}`;
  return url.toString();
}
