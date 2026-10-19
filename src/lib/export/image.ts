import { buildExportPlan, checkedCanvasSize, defaultExportOptions, safeExportFilename, type ExportOptions } from "./options";
import { ComicPanel } from "../types";
import { buildComicImageLayout, type ComicTextBlock } from "./comicLayout";
import {
  getWatermarkText,
  loadImage,
  triggerBlobDownload,
  canvasToBlob,
  dateSuffix,
} from "./shared";

// ============================================================
// 下载单张图片
// ============================================================

/** 下载单张图片 */
export async function downloadSingleImage(imageUrl: string, filename: string): Promise<void> {
  try {
    if (imageUrl.startsWith("data:")) {
      const link = document.createElement("a");
      link.href = imageUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return;
    }

    const response = await fetch(imageUrl);
    const blob = await response.blob();
    triggerBlobDownload(blob, filename);
  } catch (error) {
    console.error("Download failed:", error);
    throw error;
  }
}

// ============================================================
// 合成漫画大图 — 动态文字区高度
// ============================================================

/** 合成漫画为单张图片（含说明文字） */
export async function renderComicCanvas(panels: ComicPanel[], title: string, options: ExportOptions = defaultExportOptions("png")): Promise<HTMLCanvasElement> {
  const plan = buildExportPlan(panels, { ...options, format: "png" });
  // Load first: source dimensions determine the same center crop used by ComicReader.
  await document.fonts?.ready;
  const images: HTMLImageElement[] = [];
  for (const entry of plan.entries) {
    try {
      images.push(await loadImage(entry.panel.imageUrl!));
    } catch (error) {
      throw new Error(`第 ${entry.number} 格图片读取失败：${error instanceof Error ? error.message : "请检查图片"}`);
    }
  }
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("浏览器无法创建导出画布");
  const layout = buildComicImageLayout(plan.entries.map((entry, index) => ({
    number: entry.number,
    width: images[index].naturalWidth || images[index].width,
    height: images[index].naturalHeight || images[index].height,
    dialogue: entry.panel.dialogue,
    scene: entry.panel.scene,
  })), title, options.png.columns, options.attribution, ctx);
  checkedCanvasSize(layout.width * options.png.scale, layout.height * options.png.scale);
  canvas.width = layout.width * options.png.scale;
  canvas.height = layout.height * options.png.scale;
  ctx.scale(options.png.scale, options.png.scale);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, layout.width, layout.height);

  const drawText = (block: ComicTextBlock, align: CanvasTextAlign) => {
    ctx.font = block.font;
    ctx.fillStyle = block.color;
    ctx.textAlign = align;
    ctx.textBaseline = "top";
    block.lines.forEach((line, index) => ctx.fillText(line, block.x, block.y + index * block.lineHeight));
  };
  drawText(layout.title, "center");
  layout.cells.forEach((cell, index) => {
    const image = cell.image;
    ctx.drawImage(
      images[index], image.sourceX, image.sourceY, image.sourceWidth, image.sourceHeight,
      image.x, image.y, image.width, image.height,
    );
    ctx.strokeStyle = "#dddddd";
    ctx.lineWidth = 1;
    ctx.strokeRect(cell.x, cell.y, cell.width, cell.height);
    // Number badges sit on their own artwork, never in a detached white band.
    ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
    ctx.beginPath();
    ctx.arc(image.x + 22, image.y + 22, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = "bold 14px sans-serif";
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(cell.number), image.x + 22, image.y + 22);
    cell.caption.forEach(block => drawText(block, "left"));
  });
  if (layout.footer) drawText(layout.footer, "right");
  return canvas;
}

export async function downloadComicAsImage(panels: ComicPanel[], title: string, options: ExportOptions = defaultExportOptions("png")): Promise<void> {
  const canvas = await renderComicCanvas(panels, title, options);
  const blob = await canvasToBlob(canvas);
  canvas.width = 0; canvas.height = 0;
  if (!blob) throw new Error("PNG 编码失败，请减少分镜或分辨率。");
  triggerBlobDownload(blob, `${safeExportFilename(title)}_${dateSuffix()}.png`);
}

// ============================================================
// 分享功能
// ============================================================

/** 合成漫画长图并返回 Blob（不触发下载） */
export async function generateComicImageBlob(panels: ComicPanel[], title: string): Promise<Blob> {
  const options = { ...defaultExportOptions("png"), includeScene: false, attribution: getWatermarkText() };
  const canvas = await renderComicCanvas(panels, title, options);
  const blob = await canvasToBlob(canvas);
  canvas.width = 0; canvas.height = 0;
  if (!blob) throw new Error("生成图片失败");
  return blob;
}

/** 复制漫画长图到剪贴板 */
export async function copyComicImageToClipboard(panels: ComicPanel[], title: string): Promise<void> {
  const blob = await generateComicImageBlob(panels, title);
  await navigator.clipboard.write([
    new ClipboardItem({ "image/png": blob }),
  ]);
}

/** 使用 Web Share API 分享漫画 */
export async function shareComic(panels: ComicPanel[], title: string): Promise<void> {
  const blob = await generateComicImageBlob(panels, title);
  const file = new File([blob], `${title}.png`, { type: "image/png" });

  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    await navigator.share({
      title,
      text: `${title} - AI 漫画`,
      files: [file],
    });
  } else {
    throw new Error("当前浏览器不支持分享功能");
  }
}
