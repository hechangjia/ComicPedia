import { ComicPanel } from "../types";
import { getValidPanels, imageToBlob, triggerBlobDownload, dateSuffix } from "./shared";

// ============================================================
// Markdown + 图片打包导出
// ============================================================

/** 生成 Markdown 内容 */
export function generateMarkdownContent(panels: ComicPanel[], title: string): string {
  const lines: string[] = [
    `# ${title}`,
    "",
    `> 生成时间：${new Date().toLocaleString("zh-CN")}`,
    `> 面板数量：${panels.length}`,
    "",
    "---",
    "",
  ];

  panels.forEach((panel, index) => {
    const panelNum = String(index + 1).padStart(2, "0");
    lines.push(
      `## 第 ${index + 1} 格`,
      "",
      `![第${index + 1}格](images/panel_${panelNum}.png)`,
      "",
      `**对话/旁白：** ${panel.dialogue}`,
      "",
      `**场景描述：** ${panel.scene}`,
      "",
      `<details>`,
      `<summary>图片提示词</summary>`,
      "",
      "```",
      panel.imagePrompt,
      "```",
      `</details>`,
      "",
      "---",
      ""
    );
  });

  return lines.join("\n");
}

/** 导出 Markdown + 图片打包为 ZIP */
export async function downloadMarkdownWithImages(
  panels: ComicPanel[],
  title: string
): Promise<void> {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  const validPanels = getValidPanels(panels);
  if (validPanels.length === 0) throw new Error("没有可用的图片");

  const imagesFolder = zip.folder("images");
  if (!imagesFolder) throw new Error("创建 images 文件夹失败");

  for (let i = 0; i < validPanels.length; i++) {
    const panel = validPanels[i];
    if (!panel.imageUrl) continue;
    const blob = await imageToBlob(panel.imageUrl);
    if (blob) {
      imagesFolder.file(`panel_${String(i + 1).padStart(2, "0")}.png`, blob);
    }
  }

  zip.file("README.md", generateMarkdownContent(validPanels, title));

  const content = await zip.generateAsync({ type: "blob" });
  triggerBlobDownload(content, `${title}_完整版_${dateSuffix()}.zip`);
}
