import type { UserAPIConfigV2, UserImageConfig, UserLLMConfig } from "@/lib/types";
import { modelEndpoint } from "@/lib/providers/endpoints";

type Role = "llm" | "vlm" | "image";
type Body = Record<string, unknown>;
const object = (value: unknown): value is Body => !!value && typeof value === "object" && !Array.isArray(value);
export class ModelReferenceError extends Error {
  constructor(message: string, public status: number) { super(message); this.name = "ModelReferenceError"; }
}
function findModel(config: UserAPIConfigV2 | null, ref: unknown, roles: Role[]): { role: Role; model: UserLLMConfig | UserImageConfig } {
  if (!object(ref) || typeof ref.id !== "string" || !ref.id || !roles.includes(ref.role as Role)) throw new ModelReferenceError("模型引用格式或角色无效", 400);
  const list = ref.role === "llm" ? config?.llmConfigs : ref.role === "vlm" ? config?.vlmConfigs : config?.imageConfigs;
  const model = list?.find(model => model.id === ref.id);
  if (!model) throw new ModelReferenceError("模型配置不存在或已删除，请重新选择", 404);
  return { role: ref.role as Role, model };
}

/** Server-owned endpoint/model/credentials. Client transport fields never override the saved connection. */
export function resolveSavedModelRequest(config: UserAPIConfigV2 | null, body: Body, roles: Role[]) {
  const { role, model } = findModel(config, body.modelRef, roles);
  if (!object(body.payload)) throw new ModelReferenceError("模型请求 payload 必须是对象", 400);
  const image = role === "image" ? model as UserImageConfig : undefined;
  if (image?.endpointType === "comfyui") throw new ModelReferenceError("此配置需要使用 ComfyUI 工作流接口", 409);
  const anthropic = !image && (model as UserLLMConfig).protocolType === "anthropic";
  const chatImage = image && (image.endpointType === "chat" || (image.endpointType === "auto" && image.apiUrl.includes("/chat/completions")));
  let targetUrl: string;
  try { targetUrl = modelEndpoint(model.apiUrl, image ? chatImage ? "chat" : "images" : anthropic ? "messages" : "chat"); }
  catch { throw new ModelReferenceError("已保存的模型地址无效，请在设置中修正", 400); }
  const headers: Record<string, string> = {};
  if (anthropic) { headers["anthropic-version"] = "2023-06-01"; if (model.apiKey) headers["x-api-key"] = model.apiKey; }
  else if (model.apiKey) headers.Authorization = `Bearer ${model.apiKey}`;
  return { targetUrl, headers, payload: { ...body.payload, model: model.model } };
}

export function resolveSavedComfyRequest(config: UserAPIConfigV2 | null, body: Body) {
  const { model } = findModel(config, body.modelRef, ["image"]);
  const image = model as UserImageConfig;
  if (image.endpointType !== "comfyui") throw new ModelReferenceError("此配置不是 ComfyUI 工作流", 409);
  if (body.ping) return { comfyuiUrl: image.apiUrl, ping: true };
  let workflow: unknown;
  try { workflow = JSON.parse(image.comfyuiWorkflow || ""); } catch { throw new ModelReferenceError("已保存的 ComfyUI 工作流无效或未配置", 400); }
  if (!object(workflow)) throw new ModelReferenceError("工作流必须是 JSON 对象", 400);
  const [width, height] = image.size.split("x").map(Number);
  return { prompt: body.prompt, seed: body.seed, negativePrompt: body.negativePrompt, referenceImage: body.referenceImage,
    width: body.width ?? width, height: body.height ?? height, comfyuiUrl: image.apiUrl, workflow };
}

/** Load persisted secrets only when a saved reference is explicitly present. */
export async function resolveProxyModelBody(body: unknown, roles: Role[], comfy = false): Promise<Record<string, any>> {
  if (!object(body)) throw new ModelReferenceError("请求必须是 JSON 对象", 400);
  if (!Object.prototype.hasOwnProperty.call(body, "modelRef")) return body;
  const { getConfig } = await import("@/lib/server/db");
  return comfy ? resolveSavedComfyRequest(getConfig(), body) : resolveSavedModelRequest(getConfig(), body, roles);
}

/** Draft discovery may reuse a saved key only at its unchanged saved connection. */
export async function resolveModelDiscoveryBody(body: unknown): Promise<{ apiUrl: string; apiKey?: string; protocolType?: string }> {
  if (!object(body)) throw new ModelReferenceError("请求必须是 JSON 对象", 400);
  if (!Object.prototype.hasOwnProperty.call(body, "modelRef")) return body as { apiUrl: string; apiKey?: string; protocolType?: string };
  const { getConfig } = await import("@/lib/server/db");
  const { model } = findModel(getConfig(), body.modelRef, ["llm", "vlm", "image"]);
  const protocolType = "protocolType" in model ? model.protocolType : "openai-compatible";
  if ((body.apiUrl !== undefined && body.apiUrl !== model.apiUrl) || (body.protocolType !== undefined && body.protocolType !== protocolType)) {
    throw new ModelReferenceError("地址或协议已改变，请先保存新凭据后再获取模型", 409);
  }
  return { apiUrl: model.apiUrl, apiKey: model.apiKey, protocolType };
}
