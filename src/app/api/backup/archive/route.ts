import { ArtworkArchiveError } from "@/lib/server/backup/archive";
import { authorizeBackup, backupError, readArchiveBody } from "@/lib/server/backup/http";
import { exportArtworkArchive, previewArtworkArchive, restoreArtworkArchive } from "@/lib/server/backup/service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    authorizeBackup(request);
    const bytes = await exportArtworkArchive();
    return new Response(new Uint8Array(bytes), { headers:{"Content-Type":"application/zip","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"} });
  } catch (error) { return backupError(error); }
}
export async function POST(request: Request): Promise<Response> {
  try {
    authorizeBackup(request);
    if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/zip") throw new ArtworkArchiveError("请上传作品 ZIP 归档，不支持旧版 JSON 直接恢复",415);
    if (request.headers.get("x-comicpedia-archive") !== "2") throw new ArtworkArchiveError("缺少归档协议版本");
    const action = new URL(request.url).searchParams.get("action");
    if (action !== "preview" && action !== "restore") throw new ArtworkArchiveError("无效归档操作");
    const revision = request.headers.get("x-archive-revision") ?? "";
    if (action === "restore" && !/^[a-f0-9]{64}$/.test(revision)) throw new ArtworkArchiveError("请先预览归档再确认恢复");
    const replace = request.headers.get("x-archive-replace");
    if (replace && !["true","false"].includes(replace)) throw new ArtworkArchiveError("无效替换选项");
    const bytes = await readArchiveBody(request);
    const result = action === "preview" ? await previewArtworkArchive(bytes) : await restoreArtworkArchive(bytes,revision,replace === "true");
    return Response.json(result,{headers:{"Cache-Control":"no-store"}});
  } catch (error) { return backupError(error); }
}
