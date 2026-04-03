import { ComicPanel } from "../types";

// ============================================================
// 公共辅助函数 (DRY)
// ============================================================

/** 获取用户自定义水印/署名文字（存储在 localStorage） */
export function getWatermarkText(): string {
  try {
    return localStorage.getItem("comicpedia_watermark") || "";
  } catch { return ""; }
}

/** 设置水印/署名文字 */
export function setWatermarkText(text: string): void {
  try {
    if (text) {
      localStorage.setItem("comicpedia_watermark", text);
    } else {
      localStorage.removeItem("comicpedia_watermark");
    }
  } catch { /* noop */ }
}

/** 在 canvas 底部绘制水印/署名（如果已配置） */
export function drawWatermark(ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number): void {
  const text = getWatermarkText();
  if (!text) return;

  ctx.save();
  ctx.fillStyle = "rgba(150, 150, 150, 0.6)";
  ctx.font = "12px 'Microsoft YaHei', 'PingFang SC', sans-serif";
  ctx.textAlign = "right";
  ctx.fillText(text, canvasWidth - 12, canvasHeight - 8);
  ctx.restore();
}

/** 过滤出有效的已完成面板 */
export function getValidPanels(panels: ComicPanel[]): ComicPanel[] {
  return panels.filter(
    (p) => p.status === "completed" && p.imageUrl && !p.imageUrl.startsWith("data:text/plain")
  );
}

/** 将图片 URL/base64 转换为 Blob */
export async function imageToBlob(imageUrl: string): Promise<Blob | null> {
  try {
    const res = await fetch(imageUrl);
    return await res.blob();
  } catch (e) {
    console.warn("Failed to convert image to blob:", e);
    return null;
  }
}

/** 将图片 URL 转换为 Image 对象 */
export async function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

/** 触发浏览器下载 Blob */
export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/** 触发 Canvas 转 Blob 下载（自动添加水印） */
export function downloadCanvas(canvas: HTMLCanvasElement, filename: string): void {
  const ctx = canvas.getContext("2d");
  if (ctx) drawWatermark(ctx, canvas.width, canvas.height);
  canvas.toBlob((blob) => {
    if (!blob) return;
    triggerBlobDownload(blob, filename);
  }, "image/png");
}

/** Canvas 转 Blob (Promise 版) */
export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

/** 生成带日期的文件名后缀 */
export function dateSuffix(): string {
  return new Date().toISOString().slice(0, 10);
}

/** 高 DPI 缩放因子 — 2x 渲染让文字在高分屏上清晰 */
const SCALE = 2;

/** 创建高 DPI Canvas，返回 { canvas, ctx }，所有坐标按逻辑尺寸使用 */
export function createHiDPICanvas(
  logicalWidth: number,
  logicalHeight: number
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement("canvas");
  canvas.width = logicalWidth * SCALE;
  canvas.height = logicalHeight * SCALE;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(SCALE, SCALE);
  return { canvas, ctx };
}

// ============================================================
// 文字自动换行 — 支持动态行高计算
// ============================================================

/** 测量文字需要的行数（不绘制） */
export function measureTextLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): number {
  const chars = text.split("");
  let line = "";
  let lineCount = 0;

  for (let i = 0; i < chars.length; i++) {
    const testLine = line + chars[i];
    if (ctx.measureText(testLine).width > maxWidth && line !== "") {
      lineCount++;
      line = chars[i];
    } else {
      line = testLine;
    }
  }
  return lineCount + 1;
}

/** 文字自动换行绘制，返回实际占用的像素高度 */
export function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines?: number
): number {
  const chars = text.split("");
  let line = "";
  let lineCount = 0;

  for (let i = 0; i < chars.length; i++) {
    const testLine = line + chars[i];
    if (ctx.measureText(testLine).width > maxWidth && line !== "") {
      if (maxLines && lineCount >= maxLines - 1) {
        ctx.fillText(line + "...", x, y + lineCount * lineHeight);
        return (lineCount + 1) * lineHeight;
      }
      ctx.fillText(line, x, y + lineCount * lineHeight);
      line = chars[i];
      lineCount++;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, x, y + lineCount * lineHeight);
  return (lineCount + 1) * lineHeight;
}

/** 触发文本内容下载 */
export function downloadTextFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  triggerBlobDownload(blob, filename);
}
