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
// 小红书导出
// ============================================================

const XHS_WIDTH = 1080;
const XHS_HEIGHT = 1440;
const XHS_PADDING = 40;
const XHS_TITLE_HEIGHT = 80;

export type XHSExportMode = "single" | "pages";

/** 小红书单图拼接模式 — 动态文字区高度 */
export async function downloadForXiaohongshuSingle(
  panels: ComicPanel[],
  title: string
): Promise<void> {
  const validPanels = getValidPanels(panels);
  if (validPanels.length === 0) throw new Error("没有可用的图片");

  const panelWidth = XHS_WIDTH - XHS_PADDING * 2;
  const panelHeight = panelWidth;
  const fontSize = 24;
  const lineHeight = 32;
  const gapBetweenPanels = 30;
  const textPaddingY = 15;

  // 预计算每个面板文字区高度
  const tempCanvas = document.createElement("canvas");
  const tempCtx = tempCanvas.getContext("2d")!;
  tempCtx.font = `bold ${fontSize}px 'Microsoft YaHei', 'PingFang SC', sans-serif`;

  const textHeights = validPanels.map((panel) => {
    if (!panel.dialogue) return textPaddingY * 2;
    const lines = measureTextLines(tempCtx, panel.dialogue, panelWidth);
    return lines * lineHeight + textPaddingY * 2;
  });

  const totalHeight =
    XHS_TITLE_HEIGHT +
    validPanels.length * panelHeight +
    textHeights.reduce((sum, h) => sum + h, 0) +
    (validPanels.length - 1) * gapBetweenPanels +
    XHS_PADDING * 2;

  const { canvas, ctx } = createHiDPICanvas(XHS_WIDTH, totalHeight);

  // 白色背景
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, XHS_WIDTH, totalHeight);

  // 标题
  ctx.fillStyle = "#333333";
  ctx.font = "bold 36px 'Microsoft YaHei', 'PingFang SC', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(title, XHS_WIDTH / 2, XHS_TITLE_HEIGHT - 20);

  // 分隔线
  ctx.strokeStyle = "#e0e0e0";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(XHS_PADDING, XHS_TITLE_HEIGHT);
  ctx.lineTo(XHS_WIDTH - XHS_PADDING, XHS_TITLE_HEIGHT);
  ctx.stroke();

  // 绘制每个面板
  let currentY = XHS_TITLE_HEIGHT + XHS_PADDING;

  for (let i = 0; i < validPanels.length; i++) {
    const panel = validPanels[i];
    if (!panel.imageUrl) continue;

    try {
      const img = await loadImage(panel.imageUrl);

      ctx.save();
      ctx.strokeStyle = "#e0e0e0";
      ctx.lineWidth = 2;
      ctx.strokeRect(XHS_PADDING - 1, currentY - 1, panelWidth + 2, panelHeight + 2);
      ctx.drawImage(img, XHS_PADDING, currentY, panelWidth, panelHeight);
      ctx.restore();

      // 面板编号
      ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
      ctx.beginPath();
      ctx.arc(XHS_PADDING + 25, currentY + 25, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 16px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(String(i + 1), XHS_PADDING + 25, currentY + 31);

      // 对话文字 — 无 maxLines 限制
      if (panel.dialogue) {
        const textY = currentY + panelHeight + textPaddingY;
        ctx.textAlign = "left";
        ctx.fillStyle = "#333333";
        ctx.font = `bold ${fontSize}px 'Microsoft YaHei', 'PingFang SC', sans-serif`;
        wrapText(ctx, panel.dialogue, XHS_PADDING, textY + 5, panelWidth, lineHeight);
      }

      currentY += panelHeight + textHeights[i] + gapBetweenPanels;
    } catch (e) {
      console.warn(`Failed to load panel ${i + 1}:`, e);
    }
  }

  downloadCanvas(canvas, `${title}_小红书_${dateSuffix()}.png`);
}

/** 小红书分页模式 — 动态底部文字区 */
export async function downloadForXiaohongshuPages(
  panels: ComicPanel[],
  title: string
): Promise<void> {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  const folder = zip.folder(`${title}_小红书`);
  if (!folder) throw new Error("创建文件夹失败");

  const validPanels = getValidPanels(panels);
  if (validPanels.length === 0) throw new Error("没有可用的图片");

  const fontSize = 28;
  const lineHeight = 36;
  const textPaddingY = 40;
  const bottomReserved = 50; // 水印区域

  for (let i = 0; i < validPanels.length; i++) {
    const panel = validPanels[i];
    if (!panel.imageUrl) continue;

    try {
      const img = await loadImage(panel.imageUrl);

      // 预计算文字行数来决定文字区高度
      const tempCanvas = document.createElement("canvas");
      const tempCtx = tempCanvas.getContext("2d")!;
      tempCtx.font = `bold ${fontSize}px 'Microsoft YaHei', 'PingFang SC', sans-serif`;

      const textContentWidth = XHS_WIDTH - XHS_PADDING * 2;
      const textLines = panel.dialogue
        ? measureTextLines(tempCtx, panel.dialogue, textContentWidth)
        : 0;
      const textAreaHeight = textLines > 0
        ? textLines * lineHeight + textPaddingY * 2
        : 0;

      // 动态画布高度：确保文字不被截断，但不低于标准 3:4
      const minHeight = XHS_HEIGHT;
      const neededHeight = (XHS_HEIGHT - 200) + textAreaHeight + bottomReserved;
      const canvasHeight = Math.max(minHeight, neededHeight);
      const imageAreaHeight = canvasHeight - textAreaHeight - bottomReserved;

      const { canvas, ctx } = createHiDPICanvas(XHS_WIDTH, canvasHeight);

      // 白色背景
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, XHS_WIDTH, canvasHeight);

      // 图片区域（保持比例，居中裁剪填充）
      const imgRatio = img.width / img.height;
      const targetRatio = XHS_WIDTH / imageAreaHeight;

      let drawWidth = XHS_WIDTH;
      let drawHeight = imageAreaHeight;
      let offsetX = 0;
      let offsetY = 0;

      if (imgRatio > targetRatio) {
        drawHeight = imageAreaHeight;
        drawWidth = drawHeight * imgRatio;
        offsetX = (XHS_WIDTH - drawWidth) / 2;
      } else {
        drawWidth = XHS_WIDTH;
        drawHeight = drawWidth / imgRatio;
        offsetY = (imageAreaHeight - drawHeight) / 2;
      }

      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, XHS_WIDTH, imageAreaHeight);
      ctx.clip();
      ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
      ctx.restore();

      // 页码标签
      ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
      ctx.beginPath();
      ctx.roundRect(XHS_WIDTH - 80, 20, 60, 36, 18);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 18px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(`${i + 1}/${validPanels.length}`, XHS_WIDTH - 50, 44);

      // 底部文字区域背景
      if (textAreaHeight > 0) {
        ctx.fillStyle = "#fafafa";
        ctx.fillRect(0, imageAreaHeight, XHS_WIDTH, textAreaHeight);

        // 分隔线
        ctx.strokeStyle = "#e8e8e8";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, imageAreaHeight);
        ctx.lineTo(XHS_WIDTH, imageAreaHeight);
        ctx.stroke();

        // 对话文字 — 无 maxLines 限制
        ctx.textAlign = "left";
        ctx.fillStyle = "#333333";
        ctx.font = `bold ${fontSize}px 'Microsoft YaHei', 'PingFang SC', sans-serif`;
        wrapText(ctx, panel.dialogue, XHS_PADDING, imageAreaHeight + textPaddingY, textContentWidth, lineHeight);
      }

      // 标题水印
      ctx.fillStyle = "#cccccc";
      ctx.font = "16px 'Microsoft YaHei', 'PingFang SC', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(title, XHS_WIDTH / 2, canvasHeight - 20);

      const blob = await canvasToBlob(canvas);
      if (blob) {
        folder.file(`${String(i + 1).padStart(2, "0")}_${title}.png`, blob);
      }
    } catch (e) {
      console.warn(`Failed to generate page ${i + 1}:`, e);
    }
  }

  const content = await zip.generateAsync({ type: "blob" });
  triggerBlobDownload(content, `${title}_小红书分页_${dateSuffix()}.zip`);
}

/** 小红书导出统一入口 */
export async function downloadForXiaohongshu(
  panels: ComicPanel[],
  title: string,
  mode: XHSExportMode = "single"
): Promise<void> {
  if (mode === "single") {
    await downloadForXiaohongshuSingle(panels, title);
  } else {
    await downloadForXiaohongshuPages(panels, title);
  }
}
