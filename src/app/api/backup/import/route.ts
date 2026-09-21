import { authorizeBackup, backupError } from "@/lib/server/backup/http";
/** v1 JSON does not contain filesystem assets and cannot safely replace a live installation. */
export async function POST(request: Request) {
  try {
    authorizeBackup(request);
    return Response.json({error:"旧版 JSON 直接导入已停用，以避免不完整恢复和无确认覆盖。请在原实例导出 ZIP 作品归档后，先预览再恢复；原 JSON 文件请保留。"},{status:410,headers:{"Cache-Control":"no-store"}});
  } catch(error) { return backupError(error); }
}
