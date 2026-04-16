import { ComicPanel } from "../types";
import { getValidPanels, triggerBlobDownload, dateSuffix } from "./shared";

// ============================================================
// ZIP 打包
// ============================================================

/** 打包为 ZIP */
export async function downloadAsZip(panels: ComicPanel[], title: string): Promise<void> {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  const folder = zip.folder(title);
  if (!folder) throw new Error("创建文件夹失败");

  const validPanels = getValidPanels(panels);

  for (let i = 0; i < validPanels.length; i++) {
    const panel = validPanels[i];
    if (!panel.imageUrl) continue;
    try {
      const res = await fetch(panel.imageUrl);
      const blob = await res.blob();
      const ext = blob.type.includes("png") ? "png" : "jpg";
      folder.file(`panel_${String(i + 1).padStart(2, "0")}.${ext}`, blob);
    } catch (e) {
      console.warn(`Failed to add panel ${i + 1} to zip:`, e);
    }
  }

  folder.file("README.md", `# ${title}\n\n生成时间: ${new Date().toLocaleString("zh-CN")}\n面板数量: ${validPanels.length}\n\n## 面板内容\n\n${validPanels.map((p, i) => `### 第 ${i + 1} 格\n- 场景: ${p.scene}\n- 对话: ${p.dialogue}`).join("\n\n")}\n`);

  const content = await zip.generateAsync({ type: "blob" });
  triggerBlobDownload(content, `${title}_${dateSuffix()}.zip`);
}
