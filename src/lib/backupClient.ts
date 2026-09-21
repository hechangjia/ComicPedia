/** Validate the artifact before the UI can announce a successful download. */
export async function readArchiveDownload(response: Response): Promise<Blob> {
  if (response.status !== 200 || response.headers.get("content-type")?.split(";")[0] !== "application/zip") throw new Error("服务器未返回 ZIP 归档，下载未完成，请重试。");
  const blob = await response.blob();
  if (blob.size < 22 || blob.size > 100*1024*1024) throw new Error("归档为空或超过大小限制，下载未完成。");
  const signature = new Uint8Array(await blob.slice(0,4).arrayBuffer());
  if (signature[0] !== 80 || signature[1] !== 75 || signature[2] !== 3 || signature[3] !== 4) throw new Error("响应不是有效 ZIP 文件，下载已中止。");
  return blob;
}
