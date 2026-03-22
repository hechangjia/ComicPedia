import { ComicScript, ComicPanel } from "./types";
import { STYLE_META } from "./config/styles";

/** 加载图片为 HTMLImageElement */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("图片加载失败"));
    img.src = src;
  });
}

/** 生成分享卡片 Blob (1200x630) */
export async function generateShareCardBlob(script: ComicScript): Promise<Blob> {
  const W = 1200, H = 630;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // 背景渐变
  const gradient = ctx.createLinearGradient(0, 0, W, H);
  gradient.addColorStop(0, "#1e1b4b");
  gradient.addColorStop(1, "#312e81");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, W, H);

  // 封面图（首张完成面板）
  const validPanels = script.panels.filter(
    (p) => p.status === "completed" && p.imageUrl && !p.imageUrl.startsWith("data:text/plain"),
  );

  if (validPanels.length > 0) {
    try {
      const coverImg = await loadImage(validPanels[0].imageUrl!);
      const coverSize = 380;
      const coverX = 40, coverY = (H - coverSize) / 2;
      // 圆角裁切
      ctx.save();
      roundRect(ctx, coverX, coverY, coverSize, coverSize, 16);
      ctx.clip();
      ctx.drawImage(coverImg, coverX, coverY, coverSize, coverSize);
      ctx.restore();
      // 边框
      ctx.strokeStyle = "rgba(255,255,255,0.2)";
      ctx.lineWidth = 2;
      roundRect(ctx, coverX, coverY, coverSize, coverSize, 16);
      ctx.stroke();
    } catch { /* ignore load errors */ }
  }

  // 右侧信息区
  const textX = 460;

  // 标题
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 32px sans-serif";
  const title = script.title.length > 20 ? script.title.slice(0, 20) + "..." : script.title;
  ctx.fillText(title, textX, 120);

  // 风格标签
  const styleMeta = STYLE_META[script.style];
  ctx.font = "16px sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.fillText(`${styleMeta?.icon || "🎨"} ${styleMeta?.label || script.style} · ${script.panels.length} 格漫画`, textX, 160);

  // 主题
  ctx.font = "14px sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  const topic = script.topic.length > 40 ? script.topic.slice(0, 40) + "..." : script.topic;
  ctx.fillText(topic, textX, 195);

  // 缩略图行
  const thumbY = 250;
  const thumbSize = 80;
  const thumbGap = 10;
  for (let i = 0; i < Math.min(validPanels.length, 7); i++) {
    try {
      const img = await loadImage(validPanels[i].imageUrl!);
      const tx = textX + i * (thumbSize + thumbGap);
      ctx.save();
      roundRect(ctx, tx, thumbY, thumbSize, thumbSize, 8);
      ctx.clip();
      ctx.drawImage(img, tx, thumbY, thumbSize, thumbSize);
      ctx.restore();
      // 编号
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.beginPath();
      ctx.arc(tx + 14, thumbY + 14, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = "bold 10px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(String(i + 1), tx + 14, thumbY + 18);
      ctx.textAlign = "left";
    } catch { /* skip */ }
  }

  // 品牌水印
  ctx.fillStyle = "rgba(255,255,255,0.3)";
  ctx.font = "14px sans-serif";
  ctx.fillText("ComicPedia · AI 生成科普漫画", textX, H - 50);

  // 分隔线
  ctx.strokeStyle = "rgba(255,255,255,0.1)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(textX, H - 70);
  ctx.lineTo(W - 40, H - 70);
  ctx.stroke();

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("生成分享图失败"));
    }, "image/png");
  });
}

/** 下载分享卡片 */
export async function downloadShareCard(script: ComicScript): Promise<void> {
  const blob = await generateShareCardBlob(script);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${script.title}-分享卡片.png`;
  a.click();
  URL.revokeObjectURL(url);
}

/** 复制分享卡片到剪贴板 */
export async function copyShareCardToClipboard(script: ComicScript): Promise<void> {
  const blob = await generateShareCardBlob(script);
  await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
}

/** Web Share API 分享卡片 */
export async function shareCardViaWebShare(script: ComicScript): Promise<void> {
  const blob = await generateShareCardBlob(script);
  const file = new File([blob], `${script.title}.png`, { type: "image/png" });
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    await navigator.share({ title: script.title, text: `${script.title} - AI 漫画`, files: [file] });
  } else {
    throw new Error("当前浏览器不支持分享功能");
  }
}

/** Canvas 圆角矩形辅助 */
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
