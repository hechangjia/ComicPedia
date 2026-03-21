import { ComicPanel, ComicScript } from "./types";

// ============================================================
// 公共辅助函数 (DRY)
// ============================================================

/** 过滤出有效的已完成面板 */
function getValidPanels(panels: ComicPanel[]): ComicPanel[] {
  return panels.filter(
    (p) => p.status === "completed" && p.imageUrl && !p.imageUrl.startsWith("data:text/plain")
  );
}

/** 将图片 URL/base64 转换为 Blob */
async function imageToBlob(imageUrl: string): Promise<Blob | null> {
  try {
    const res = await fetch(imageUrl);
    return await res.blob();
  } catch (e) {
    console.warn("Failed to convert image to blob:", e);
    return null;
  }
}

/** 将图片 URL 转换为 Image 对象 */
async function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

/** 触发浏览器下载 Blob */
function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/** 触发 Canvas 转 Blob 下载 */
function downloadCanvas(canvas: HTMLCanvasElement, filename: string): void {
  canvas.toBlob((blob) => {
    if (!blob) return;
    triggerBlobDownload(blob, filename);
  }, "image/png");
}

/** Canvas 转 Blob (Promise 版) */
function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

/** 生成带日期的文件名后缀 */
function dateSuffix(): string {
  return new Date().toISOString().slice(0, 10);
}

/** 高 DPI 缩放因子 — 2x 渲染让文字在高分屏上清晰 */
const SCALE = 2;

/** 创建高 DPI Canvas，返回 { canvas, ctx }，所有坐标按逻辑尺寸使用 */
function createHiDPICanvas(
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
function measureTextLines(
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
function wrapText(
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

// ============================================================
// Markdown + 图片打包导出
// ============================================================

/** 生成 Markdown 内容 */
function generateMarkdownContent(panels: ComicPanel[], title: string): string {
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

// ============================================================
// Seedance / AI 视频脚本导出
// ============================================================

export interface SeedanceSegment {
  id: number;
  prompt: string;
  duration: number;
  narration: string;
  scene: string;
  camera: string;
  /** Suggested camera motion for video generation */
  motion: string;
  /** Scene mood/atmosphere tag */
  mood: string;
  /** Transition to next segment */
  transition: string;
  referenceImage?: string;
}

export interface SeedanceExportData {
  title: string;
  style: string;
  totalDuration: number;
  /** Suggested aspect ratio for video output */
  aspectRatio: string;
  /** Total segment count */
  segmentCount: number;
  segments: SeedanceSegment[];
  exportedAt: string;
}

/** Estimate video duration from dialogue length + scene complexity */
function estimateDuration(panel: ComicPanel): number {
  const dialogueLen = panel.dialogue?.length ?? 0;
  // Base duration from dialogue: ~3 chars/second for narration
  const dialogueDuration = Math.ceil(dialogueLen / 3);
  // Scene complexity bonus: longer prompts imply more visual detail
  const promptLen = panel.imagePrompt?.length ?? 0;
  const complexityBonus = promptLen > 200 ? 1.5 : promptLen > 100 ? 1 : 0;
  // Clamp to 3-10 seconds
  return Math.max(3, Math.min(10, dialogueDuration + complexityBonus));
}

/** Camera shot type keywords → shot type mapping */
const CAMERA_RULES: [RegExp, string][] = [
  [/\b(extreme\s+)?close[\s-]?up\b/i, "extreme close-up"],
  [/\bclose[\s-]?up\b/i, "close-up"],
  [/\bmedium\s+close[\s-]?up\b/i, "medium close-up"],
  [/\b(bust|shoulder)\s+shot\b/i, "medium close-up"],
  [/\bmedium\s+shot\b/i, "medium shot"],
  [/\b(cowboy|american)\s+shot\b/i, "medium shot"],
  [/\bfull[\s-]?(body\s+)?shot\b/i, "full shot"],
  [/\bwide\s+(shot|angle)\b/i, "wide shot"],
  [/\b(extreme|ultra)\s+wide\b/i, "extreme wide shot"],
  [/\bestab(lishing)?\s+shot\b/i, "establishing shot"],
  [/\b(bird['s]?\s*eye|aerial|overhead|top[\s-]?down)\b/i, "aerial view"],
  [/\b(worm['s]?\s*eye|low\s+angle)\b/i, "low angle"],
  [/\bhigh\s+angle\b/i, "high angle"],
  [/\b(dutch|tilted?)\s+(angle|shot)\b/i, "dutch angle"],
  [/\b(pov|point[\s-]?of[\s-]?view|first[\s-]?person)\b/i, "POV"],
  [/\bover[\s-]?the[\s-]?shoulder\b/i, "over-the-shoulder"],
  [/\b(profile|side)\s+(view|shot)\b/i, "profile shot"],
  [/\bportrait\b/i, "portrait"],
  [/\bpanoram(a|ic)\b/i, "panoramic"],
];

/** Infer camera shot type from imagePrompt */
function inferCamera(prompt: string): string {
  for (const [pattern, shot] of CAMERA_RULES) {
    if (pattern.test(prompt)) return shot;
  }
  return "medium shot";
}

/** Infer camera motion suggestion from prompt */
function inferMotion(prompt: string): string {
  const lower = prompt.toLowerCase();
  if (/\b(running|chase|flying|falling|rushing)\b/.test(lower)) return "tracking shot";
  if (/\b(walk|stroll|wander)\b/.test(lower)) return "slow dolly forward";
  if (/\b(panoram|landscape|cityscape|horizon)\b/.test(lower)) return "slow pan";
  if (/\b(reveal|appear|emerge)\b/.test(lower)) return "push in";
  if (/\b(depart|leave|farewell|away)\b/.test(lower)) return "pull out";
  if (/\b(battle|fight|explosion|action)\b/.test(lower)) return "handheld shake";
  if (/\b(calm|serene|peaceful|still|quiet)\b/.test(lower)) return "static";
  if (/\b(zoom|focus)\b/.test(lower)) return "zoom in";
  return "slow push in";
}

/** Infer mood/atmosphere from prompt and dialogue */
function inferMood(prompt: string, dialogue: string): string {
  const text = (prompt + " " + dialogue).toLowerCase();
  if (/\b(dark|shadow|gloomy|horror|fear|dread)\b/.test(text)) return "dark";
  if (/\b(bright|happy|joy|cheerful|laugh|smile|sunny)\b/.test(text)) return "cheerful";
  if (/\b(sad|cry|tear|melanchol|sorrow|grief)\b/.test(text)) return "melancholic";
  if (/\b(epic|grand|hero|battle|war|glory)\b/.test(text)) return "epic";
  if (/\b(mysterious|secret|enigma|fog|mist)\b/.test(text)) return "mysterious";
  if (/\b(romantic|love|heart|tender|gentle)\b/.test(text)) return "romantic";
  if (/\b(tense|suspense|danger|threat|urgent)\b/.test(text)) return "tense";
  if (/\b(funny|humor|comic|absurd|silly)\b/.test(text)) return "humorous";
  if (/\b(calm|serene|peace|quiet|tranquil)\b/.test(text)) return "serene";
  return "neutral";
}

/** Suggest transition based on consecutive segment context */
function inferTransition(
  current: ComicPanel,
  next: ComicPanel | undefined,
): string {
  if (!next) return "fade out";
  const curScene = current.scene.toLowerCase();
  const nextScene = next.scene.toLowerCase();
  // Same location → simple cut
  if (curScene === nextScene) return "cut";
  // Time skip hints
  if (/\b(later|next day|years|after|morning|evening|night)\b/.test(nextScene)) return "dissolve";
  // Dramatic shift
  if (/\b(suddenly|crash|boom|shock|surprise)\b/.test(nextScene)) return "smash cut";
  // Location change
  return "cross dissolve";
}

/** Build Seedance export data */
export function buildSeedanceData(script: ComicScript): SeedanceExportData {
  const segments: SeedanceSegment[] = script.panels.map((panel, index) => ({
    id: index + 1,
    prompt: panel.imagePrompt,
    duration: estimateDuration(panel),
    narration: panel.dialogue,
    scene: panel.scene,
    camera: inferCamera(panel.imagePrompt),
    motion: inferMotion(panel.imagePrompt),
    mood: inferMood(panel.imagePrompt, panel.dialogue),
    transition: inferTransition(panel, script.panels[index + 1]),
    referenceImage: panel.imageUrl?.startsWith("data:image") ? panel.imageUrl : undefined,
  }));

  return {
    title: script.title,
    style: script.style,
    aspectRatio: "16:9",
    segmentCount: segments.length,
    totalDuration: segments.reduce((sum, s) => sum + s.duration, 0),
    segments,
    exportedAt: new Date().toISOString(),
  };
}

/** Strip referenceImage from segments to reduce file size */
function stripReferenceImages(data: SeedanceExportData) {
  return {
    ...data,
    segments: data.segments.map(({ referenceImage, ...rest }) => rest),
  };
}

/** Generate Seedance plain-text content (Markdown-structured) */
function buildSeedanceText(data: SeedanceExportData): string {
  const lines: string[] = [
    `# ${data.title} — Video Script`,
    "",
    `| Property | Value |`,
    `|----------|-------|`,
    `| Style | ${data.style} |`,
    `| Aspect Ratio | ${data.aspectRatio} |`,
    `| Segments | ${data.segmentCount} |`,
    `| Total Duration | ~${data.totalDuration}s |`,
    `| Exported | ${data.exportedAt} |`,
    "",
    "---",
    "",
  ];

  data.segments.forEach((seg, idx) => {
    lines.push(
      `## Segment ${seg.id} — ${seg.scene}`,
      "",
      `- **Duration:** ${seg.duration}s`,
      `- **Camera:** ${seg.camera}`,
      `- **Motion:** ${seg.motion}`,
      `- **Mood:** ${seg.mood}`,
      `- **Transition:** ${seg.transition}`,
      "",
      `> **Narration:** ${seg.narration}`,
      "",
      "```",
      seg.prompt,
      "```",
      "",
    );

    if (idx < data.segments.length - 1) {
      lines.push(`*→ ${seg.transition} to next segment*`, "", "---", "");
    }
  });

  return lines.join("\n");
}

/** Export Seedance JSON */
export function downloadForSeedanceJSON(script: ComicScript): void {
  const data = buildSeedanceData(script);
  const json = JSON.stringify(stripReferenceImages(data), null, 2);
  const blob = new Blob([json], { type: "application/json;charset=utf-8" });
  triggerBlobDownload(blob, `${script.title}_seedance_${dateSuffix()}.json`);
}

/** Export Seedance plain text */
export function downloadForSeedanceText(script: ComicScript): void {
  const data = buildSeedanceData(script);
  const text = buildSeedanceText(data);
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  triggerBlobDownload(blob, `${script.title}_seedance_${dateSuffix()}.txt`);
}

/** Seedance ZIP (JSON + TXT + reference images) */
export async function downloadForSeedanceZip(script: ComicScript): Promise<void> {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  const data = buildSeedanceData(script);

  zip.file("script.json", JSON.stringify(stripReferenceImages(data), null, 2));
  zip.file("script.txt", buildSeedanceText(data));

  const refFolder = zip.folder("references");
  if (refFolder) {
    for (const seg of data.segments) {
      if (seg.referenceImage) {
        const blob = await imageToBlob(seg.referenceImage);
        if (blob) {
          refFolder.file(`segment_${String(seg.id).padStart(2, "0")}.png`, blob);
        }
      }
    }
  }

  const content = await zip.generateAsync({ type: "blob" });
  triggerBlobDownload(content, `${script.title}_seedance_${dateSuffix()}.zip`);
}

// ============================================================
// PDF 导出 — Canvas 渲染 + jsPDF 分页 (200 DPI, dynamic text)
// ============================================================

/**
 * A4 dimensions at 200 DPI — good quality/size balance.
 * 150 DPI produced noticeable artifacts on text; 300 DPI too heavy.
 */
const PDF_DPI = 200;
const PDF_MM_TO_PX = PDF_DPI / 25.4;
const PDF_A4_W_MM = 210;
const PDF_A4_H_MM = 297;
const PDF_PAGE_W = Math.round(PDF_A4_W_MM * PDF_MM_TO_PX); // ~1654px
const PDF_PAGE_H = Math.round(PDF_A4_H_MM * PDF_MM_TO_PX); // ~2339px
const PDF_FONT_FAMILY = "'Microsoft YaHei', 'PingFang SC', 'Noto Sans SC', sans-serif";

/** Render a cover page with title, style, and panel count */
async function renderPdfCoverPage(
  title: string,
  style: string,
  panelCount: number,
  coverImage: HTMLImageElement | null,
): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  canvas.width = PDF_PAGE_W;
  canvas.height = PDF_PAGE_H;
  const ctx = canvas.getContext("2d")!;

  // Background gradient (light gray → white)
  const gradient = ctx.createLinearGradient(0, 0, 0, PDF_PAGE_H);
  gradient.addColorStop(0, "#f5f5f5");
  gradient.addColorStop(0.4, "#ffffff");
  gradient.addColorStop(1, "#f8f8f8");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, PDF_PAGE_W, PDF_PAGE_H);

  const centerX = PDF_PAGE_W / 2;
  const margin = Math.round(PDF_PAGE_W * 0.08);

  // Cover image (if available) — large, centered, rounded
  if (coverImage) {
    const imgAreaW = PDF_PAGE_W - margin * 2;
    const imgAreaH = Math.round(PDF_PAGE_H * 0.45);
    const imgY = Math.round(PDF_PAGE_H * 0.12);

    ctx.save();
    const radius = 16;
    ctx.beginPath();
    ctx.roundRect(margin, imgY, imgAreaW, imgAreaH, radius);
    ctx.clip();

    // Cover-fit
    const srcA = coverImage.width / coverImage.height;
    const dstA = imgAreaW / imgAreaH;
    let dw: number, dh: number, dx: number, dy: number;
    if (srcA > dstA) {
      dh = imgAreaH;
      dw = dh * srcA;
      dx = margin + (imgAreaW - dw) / 2;
      dy = imgY;
    } else {
      dw = imgAreaW;
      dh = dw / srcA;
      dx = margin;
      dy = imgY + (imgAreaH - dh) / 2;
    }
    ctx.drawImage(coverImage, dx, dy, dw, dh);
    ctx.restore();

    // Subtle border
    ctx.strokeStyle = "#e0e0e0";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(margin, imgY, imgAreaW, imgAreaH, radius);
    ctx.stroke();
  }

  // Title
  const titleY = coverImage ? Math.round(PDF_PAGE_H * 0.64) : Math.round(PDF_PAGE_H * 0.38);
  const titleFontSize = Math.round(PDF_PAGE_W * 0.04);
  ctx.fillStyle = "#1a1a1a";
  ctx.font = `bold ${titleFontSize}px ${PDF_FONT_FAMILY}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(title, centerX, titleY, PDF_PAGE_W - margin * 2);

  // Decorative line under title
  const lineY = titleY + Math.round(titleFontSize * 1.2);
  const lineW = Math.round(PDF_PAGE_W * 0.2);
  ctx.strokeStyle = "#6366f1";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(centerX - lineW / 2, lineY);
  ctx.lineTo(centerX + lineW / 2, lineY);
  ctx.stroke();

  // Metadata
  const metaY = lineY + Math.round(PDF_PAGE_H * 0.04);
  const metaFontSize = Math.round(PDF_PAGE_W * 0.016);
  ctx.fillStyle = "#666";
  ctx.font = `${metaFontSize}px ${PDF_FONT_FAMILY}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`${style}  ·  ${panelCount} panels  ·  ${dateSuffix()}`, centerX, metaY);

  // Footer
  const footerFontSize = Math.round(PDF_PAGE_W * 0.01);
  ctx.fillStyle = "#bbb";
  ctx.font = `${footerFontSize}px ${PDF_FONT_FAMILY}`;
  ctx.fillText("Generated by Comicpedia", centerX, PDF_PAGE_H - Math.round(PDF_PAGE_H * 0.04));

  return canvas;
}

/** Measure per-cell text height, returning the computed image/text split */
function computeCellLayout(
  panels: ComicPanel[],
  cols: number,
  rows: number,
  gridW: number,
  gridH: number,
  gap: number,
): { cellW: number; rowImgH: number[]; rowTextH: number[] } {
  const cellW = Math.floor((gridW - gap * (cols - 1)) / cols);
  const textFontSize = Math.round(cellW * 0.028);
  const textLineHeight = Math.round(textFontSize * 1.45);
  const textPadding = Math.round(cellW * 0.06);

  // Temp canvas for text measurement
  const tmpCanvas = document.createElement("canvas");
  const tmpCtx = tmpCanvas.getContext("2d")!;
  tmpCtx.font = `bold ${textFontSize}px ${PDF_FONT_FAMILY}`;

  const maxTextW = cellW - textPadding * 2;
  // Min text height (1 line + padding)
  const minTextH = textLineHeight + Math.round(textPadding * 1.2);

  // Scene uses a smaller font — measure with that
  const sceneFontSize = Math.round(textFontSize * 0.85);
  const sceneLineHeight = Math.round(sceneFontSize * 1.4);

  // Per-panel text heights (dialogue + scene)
  const panelTextHeights = panels.map((p) => {
    let totalH = Math.round(textPadding * 0.6); // top padding
    if (p.dialogue) {
      const lines = measureTextLines(tmpCtx, p.dialogue, maxTextW);
      totalH += lines * textLineHeight;
    }
    if (p.scene && p.scene !== p.dialogue) {
      tmpCtx.font = `${sceneFontSize}px ${PDF_FONT_FAMILY}`;
      const sceneLines = measureTextLines(tmpCtx, p.scene, maxTextW);
      totalH += Math.round(textLineHeight * 0.3); // gap between dialogue and scene
      totalH += sceneLines * sceneLineHeight;
      tmpCtx.font = `bold ${textFontSize}px ${PDF_FONT_FAMILY}`; // restore
    }
    totalH += Math.round(textPadding * 0.6); // bottom padding
    return Math.max(minTextH, totalH);
  });

  // Per-row: max text height in that row; image height = remaining
  const totalRowH = Math.floor((gridH - gap * (rows - 1)) / rows);
  const rowTextH: number[] = [];
  const rowImgH: number[] = [];

  for (let r = 0; r < rows; r++) {
    let maxTH = minTextH;
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      if (idx < panelTextHeights.length) {
        maxTH = Math.max(maxTH, panelTextHeights[idx]);
      }
    }
    // Cap text to 30% of cell height to keep image dominant
    const cappedTH = Math.min(maxTH, Math.round(totalRowH * 0.3));
    rowTextH.push(cappedTH);
    rowImgH.push(totalRowH - cappedTH);
  }

  return { cellW, rowImgH, rowTextH };
}

/** Render a single content page with 2x2 panel grid */
async function renderPdfPage(
  panels: ComicPanel[],
  pageIndex: number,
  totalPages: number,
  title: string,
  firstContentPage: boolean,
  panelOffset: number,
): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  canvas.width = PDF_PAGE_W;
  canvas.height = PDF_PAGE_H;
  const ctx = canvas.getContext("2d")!;

  const margin = Math.round(PDF_PAGE_W * 0.045);
  const gap = Math.round(PDF_PAGE_W * 0.012);
  const cols = 2;
  const rows = 2;
  const headerH = Math.round(PDF_PAGE_H * 0.035);
  const pageNumH = Math.round(PDF_PAGE_H * 0.022);

  // White background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, PDF_PAGE_W, PDF_PAGE_H);

  // Page header — title + divider
  let curY = margin;
  const headerFontSize = Math.round(PDF_PAGE_W * 0.015);
  ctx.fillStyle = "#888";
  ctx.font = `${headerFontSize}px ${PDF_FONT_FAMILY}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(title, margin, curY + headerH * 0.5, PDF_PAGE_W * 0.6);

  // Page number in header (right side)
  ctx.textAlign = "right";
  ctx.fillText(`${pageIndex + 1} / ${totalPages}`, PDF_PAGE_W - margin, curY + headerH * 0.5);

  // Divider
  curY += headerH;
  ctx.strokeStyle = "#e5e5e5";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(margin, curY);
  ctx.lineTo(PDF_PAGE_W - margin, curY);
  ctx.stroke();
  curY += gap;

  // Grid dimensions
  const gridW = PDF_PAGE_W - margin * 2;
  const gridH = PDF_PAGE_H - curY - margin - pageNumH;
  const { cellW, rowImgH, rowTextH } = computeCellLayout(panels, cols, rows, gridW, gridH, gap);
  const totalRowH = Math.floor((gridH - gap * (rows - 1)) / rows);

  const textFontSize = Math.round(cellW * 0.028);
  const textLineHeight = Math.round(textFontSize * 1.45);
  const numFontSize = Math.round(cellW * 0.032);
  const badgeR = Math.round(cellW * 0.025);

  for (let i = 0; i < panels.length; i++) {
    const panel = panels[i];
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = margin + col * (cellW + gap);
    const y = curY + row * (totalRowH + gap);
    const imgH = rowImgH[row];
    const textH = rowTextH[row];

    // Cell background + border
    ctx.fillStyle = "#fafafa";
    ctx.fillRect(x, y, cellW, imgH + textH);
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, cellW, imgH + textH);

    // Image area
    if (panel.imageUrl) {
      try {
        const img = await loadImage(panel.imageUrl);
        ctx.save();
        ctx.beginPath();
        ctx.rect(x + 1, y + 1, cellW - 2, imgH - 1);
        ctx.clip();

        const srcAspect = img.width / img.height;
        const dstAspect = cellW / imgH;
        let drawW: number, drawH: number, drawX: number, drawY: number;
        if (srcAspect > dstAspect) {
          drawH = imgH;
          drawW = imgH * srcAspect;
          drawX = x + (cellW - drawW) / 2;
          drawY = y;
        } else {
          drawW = cellW;
          drawH = cellW / srcAspect;
          drawX = x;
          drawY = y + (imgH - drawH) / 2;
        }
        ctx.drawImage(img, drawX, drawY, drawW, drawH);
        ctx.restore();
      } catch {
        ctx.fillStyle = "#f0f0f0";
        ctx.fillRect(x + 1, y + 1, cellW - 2, imgH - 1);
        ctx.fillStyle = "#999";
        ctx.font = `${textFontSize}px ${PDF_FONT_FAMILY}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("Image unavailable", x + cellW / 2, y + imgH / 2);
      }
    }

    // Panel number badge
    const badgeCx = x + badgeR + 8;
    const badgeCy = y + badgeR + 8;
    // Shadow
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.arc(badgeCx + 1, badgeCy + 1, badgeR, 0, Math.PI * 2);
    ctx.fill();
    // Badge body
    ctx.fillStyle = "#1a1a1a";
    ctx.beginPath();
    ctx.arc(badgeCx, badgeCy, badgeR, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(badgeCx, badgeCy, badgeR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.font = `bold ${numFontSize}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(panelOffset + i + 1), badgeCx, badgeCy);

    // Divider between image and text
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y + imgH);
    ctx.lineTo(x + cellW, y + imgH);
    ctx.stroke();

    // Text area
    ctx.fillStyle = "#fff";
    ctx.fillRect(x + 1, y + imgH + 1, cellW - 2, textH - 2);

    if (panel.dialogue || (panel.scene && panel.scene !== panel.dialogue)) {
      const textPad = Math.round(cellW * 0.03);
      const textX = x + textPad;
      let textY = y + imgH + Math.round(textH * 0.1);
      const textMaxW = cellW - textPad * 2;

      // Left accent bar
      ctx.fillStyle = "#6366f1";
      ctx.fillRect(x + 5, y + imgH + 5, 3, textH - 10);

      // Dialogue (bold, primary)
      if (panel.dialogue) {
        const maxDialogueLines = Math.max(1, Math.floor((textH * 0.55) / textLineHeight));
        ctx.fillStyle = "#1a1a1a";
        ctx.font = `bold ${textFontSize}px ${PDF_FONT_FAMILY}`;
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        const dialogueH = wrapText(ctx, panel.dialogue, textX + 8, textY, textMaxW - 8, textLineHeight, maxDialogueLines);
        textY += dialogueH + Math.round(textLineHeight * 0.2);
      }

      // Scene description (lighter, smaller — below dialogue)
      if (panel.scene && panel.scene !== panel.dialogue) {
        const sceneFontSize = Math.round(textFontSize * 0.85);
        const sceneLineHeight = Math.round(sceneFontSize * 1.4);
        const remainingH = (y + imgH + textH) - textY - Math.round(textH * 0.08);
        const maxSceneLines = Math.max(1, Math.floor(remainingH / sceneLineHeight));
        ctx.fillStyle = "#666";
        ctx.font = `${sceneFontSize}px ${PDF_FONT_FAMILY}`;
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        wrapText(ctx, panel.scene, textX + 8, textY, textMaxW - 8, sceneLineHeight, maxSceneLines);
      }
    }
  }

  return canvas;
}

/**
 * Generate a multi-page PDF with comic panels.
 * 200 DPI, dynamic text height per row, cover page, PNG rendering.
 */
export async function downloadAsPdf(panels: ComicPanel[], title: string): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const validPanels = getValidPanels(panels);
  if (validPanels.length === 0) throw new Error("No valid images to export");

  const panelsPerPage = 4; // 2x2 grid
  const contentPages = Math.ceil(validPanels.length / panelsPerPage);
  const totalPages = contentPages + 1; // +1 for cover

  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  // Cover page
  let coverImg: HTMLImageElement | null = null;
  if (validPanels[0]?.imageUrl) {
    try {
      coverImg = await loadImage(validPanels[0].imageUrl);
    } catch { /* proceed without cover image */ }
  }
  const coverCanvas = await renderPdfCoverPage(title, "Comic", validPanels.length, coverImg);
  pdf.addImage(coverCanvas.toDataURL("image/png"), "PNG", 0, 0, PDF_A4_W_MM, PDF_A4_H_MM);

  // Content pages
  for (let page = 0; page < contentPages; page++) {
    pdf.addPage("a4", "portrait");

    const startIdx = page * panelsPerPage;
    const pagePanels = validPanels.slice(startIdx, startIdx + panelsPerPage);

    const canvas = await renderPdfPage(
      pagePanels,
      page + 1,      // page 1-based (cover is page 0)
      totalPages,
      title,
      page === 0,
      startIdx,       // panel offset for numbering
    );

    // PNG for lossless text quality (compressed by jsPDF internally)
    pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, PDF_A4_W_MM, PDF_A4_H_MM);
  }

  pdf.save(`${title}_${dateSuffix()}.pdf`);
}

// ============================================================
// 文件下载辅助（供外部使用，如 result page 的 Markdown 导出）
// ============================================================

/** 触发文本内容下载 */
export function downloadTextFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  triggerBlobDownload(blob, filename);
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
