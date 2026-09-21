import { ComicPanel } from "../types";
import { triggerBlobDownload, dateSuffix } from "./shared";
import { buildPublicationArchive } from "./zip";
import { defaultExportOptions, safeExportFilename, type ExportOptions } from "./options";

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
  panels: ComicPanel[], title: string, options: ExportOptions = defaultExportOptions("markdown"),
): Promise<void> {
  const blob = await buildPublicationArchive(panels, title, { ...options, format: "markdown" });
  triggerBlobDownload(blob, `${safeExportFilename(title)}_完整版_${dateSuffix()}.zip`);
}
