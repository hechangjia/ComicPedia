import { ComicPanel } from "../types";
import {
  getValidPanels,
  loadImage,
  triggerBlobDownload,
  downloadCanvas,
  canvasToBlob,
  dateSuffix,
  createHiDPICanvas,
  measureTextLines,
  wrapText,
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
export async function downloadComicAsImage(panels: ComicPanel[], title: string): Promise<void> {
  const validPanels = getValidPanels(panels);
  if (validPanels.length === 0) throw new Error("没有可用的图片");

  const cols = 2;
  const rows = Math.ceil(validPanels.length / cols);
  const panelSize = 512;
  const padding = 20;
  const titleHeight = 60;
  const fontSize = 14;
  const lineHeight = 18;
  const textPaddingY = 10;

  // 预计算每个面板的文字行数，确定动态文字区高度
  const tempCanvas = document.createElement("canvas");
  const tempCtx = tempCanvas.getContext("2d")!;
  tempCtx.font = `bold ${fontSize}px 'Microsoft YaHei', 'PingFang SC', sans-serif`;

  const textHeights = validPanels.map((panel) => {
    if (!panel.dialogue) return textPaddingY * 2;
    const lines = measureTextLines(tempCtx, panel.dialogue, panelSize - 10);
    return lines * lineHeight + textPaddingY * 2;
  });

  // 每行取该行中最高的文字区
  const rowTextHeights: number[] = [];
  for (let r = 0; r < rows; r++) {
    let maxH = 0;
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      if (idx < textHeights.length) {
        maxH = Math.max(maxH, textHeights[idx]);
      }
    }
    rowTextHeights.push(maxH);
  }

  const canvasWidth = cols * panelSize + (cols + 1) * padding;
  const canvasHeight = rowTextHeights.reduce((sum, h) => sum + panelSize + h, 0)
    + (rows + 1) * padding + titleHeight;

  const { canvas, ctx } = createHiDPICanvas(canvasWidth, canvasHeight);

  // 白色背景
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // 绘制标题
  ctx.fillStyle = "#333333";
  ctx.font = "bold 28px 'Microsoft YaHei', 'PingFang SC', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(title, canvasWidth / 2, 40);

  // 绘制每个面板
  let accumulatedY = titleHeight + padding;
  for (let i = 0; i < validPanels.length; i++) {
    const panel = validPanels[i];
    if (!panel.imageUrl) continue;

    try {
      const img = await loadImage(panel.imageUrl);
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = padding + col * (panelSize + padding);

      // 在每行第一列时更新 accumulatedY（跳过第 0 行）
      if (col === 0 && row > 0) {
        accumulatedY += panelSize + rowTextHeights[row - 1] + padding;
      }
      const panelY = accumulatedY;

      // 绘制边框
      ctx.strokeStyle = "#e0e0e0";
      ctx.lineWidth = 2;
      ctx.strokeRect(x - 1, panelY - 1, panelSize + 2, panelSize + 2);

      // 绘制图片
      ctx.drawImage(img, x, panelY, panelSize, panelSize);

      // 绘制面板编号
      ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
      ctx.beginPath();
      ctx.arc(x + 20, panelY + 20, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 14px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(String(i + 1), x + 20, panelY + 25);

      // 图片下方完整对话文字
      if (panel.dialogue) {
        const textY = panelY + panelSize + textPaddingY;
        ctx.textAlign = "left";
        ctx.fillStyle = "#333333";
        ctx.font = `bold ${fontSize}px 'Microsoft YaHei', 'PingFang SC', sans-serif`;
        wrapText(ctx, panel.dialogue, x + 5, textY + 5, panelSize - 10, lineHeight);
      }
    } catch (e) {
      console.warn(`Failed to load panel ${i + 1}:`, e);
    }
  }

  downloadCanvas(canvas, `${title}_${dateSuffix()}.png`);
}

// ============================================================
// 分享功能
// ============================================================

/** 合成漫画长图并返回 Blob（不触发下载） */
export async function generateComicImageBlob(panels: ComicPanel[], title: string): Promise<Blob> {
  const validPanels = getValidPanels(panels);
  if (validPanels.length === 0) throw new Error("没有可用的图片");

  const cols = 2;
  const rows = Math.ceil(validPanels.length / cols);
  const panelSize = 512;
  const padding = 20;
  const titleHeight = 60;
  const fontSize = 14;
  const lineHeight = 18;
  const textPaddingY = 10;

  const tempCanvas = document.createElement("canvas");
  const tempCtx = tempCanvas.getContext("2d")!;
  tempCtx.font = `bold ${fontSize}px 'Microsoft YaHei', 'PingFang SC', sans-serif`;

  const textHeights = validPanels.map((panel) => {
    if (!panel.dialogue) return textPaddingY * 2;
    const lines = measureTextLines(tempCtx, panel.dialogue, panelSize - 10);
    return lines * lineHeight + textPaddingY * 2;
  });

  const rowTextHeights: number[] = [];
  for (let r = 0; r < rows; r++) {
    let maxH = 0;
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      if (idx < textHeights.length) maxH = Math.max(maxH, textHeights[idx]);
    }
    rowTextHeights.push(maxH);
  }

  const canvasWidth = cols * panelSize + (cols + 1) * padding;
  const canvasHeight = rowTextHeights.reduce((sum, h) => sum + panelSize + h, 0)
    + (rows + 1) * padding + titleHeight;

  const { canvas, ctx } = createHiDPICanvas(canvasWidth, canvasHeight);

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  ctx.fillStyle = "#333333";
  ctx.font = "bold 28px 'Microsoft YaHei', 'PingFang SC', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(title, canvasWidth / 2, 40);

  let accumulatedY = titleHeight + padding;
  for (let i = 0; i < validPanels.length; i++) {
    const panel = validPanels[i];
    if (!panel.imageUrl) continue;

    try {
      const img = await loadImage(panel.imageUrl);
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = padding + col * (panelSize + padding);

      if (col === 0 && row > 0) {
        accumulatedY += panelSize + rowTextHeights[row - 1] + padding;
      }
      const panelY = accumulatedY;

      ctx.strokeStyle = "#e0e0e0";
      ctx.lineWidth = 2;
      ctx.strokeRect(x - 1, panelY - 1, panelSize + 2, panelSize + 2);
      ctx.drawImage(img, x, panelY, panelSize, panelSize);

      ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
      ctx.beginPath();
      ctx.arc(x + 20, panelY + 20, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 14px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(String(i + 1), x + 20, panelY + 25);

      if (panel.dialogue) {
        const textY = panelY + panelSize + textPaddingY;
        ctx.textAlign = "left";
        ctx.fillStyle = "#333333";
        ctx.font = `bold ${fontSize}px 'Microsoft YaHei', 'PingFang SC', sans-serif`;
        wrapText(ctx, panel.dialogue, x + 5, textY + 5, panelSize - 10, lineHeight);
      }
    } catch (e) {
      console.warn(`Failed to load panel ${i + 1}:`, e);
    }
  }

  const blob = await canvasToBlob(canvas);
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
