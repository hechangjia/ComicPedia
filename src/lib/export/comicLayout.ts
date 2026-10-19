/** Geometry shared by PNG preview, download and clipboard/share rendering. */
export const COMIC_IMAGE_STYLE = {
  panelWidth: 512,
  margin: 20,
  gap: 24,
  textPadding: 16,
  paragraphGap: 8,
  family: "'Microsoft YaHei', 'PingFang SC', 'Noto Sans SC', sans-serif",
} as const;

interface TextMeasurer {
  font: string;
  measureText(text: string): { width: number };
}
export interface ComicTextBlock {
  x: number;
  y: number;
  lines: string[];
  lineHeight: number;
  font: string;
  color: string;
}
interface ComicLayoutPanel {
  number: number;
  width: number;
  height: number;
  dialogue: string;
  scene: string;
}

/** Preserve paragraph breaks and never split a UTF-16 surrogate pair. */
export function splitComicText(ctx: TextMeasurer, text: string, maxWidth: number): string[] {
  if (!text) return [];
  const lines: string[] = [];
  for (const paragraph of text.replace(/\r\n?/g, "\n").split("\n")) {
    let line = "";
    for (const character of paragraph) {
      if (line && ctx.measureText(line + character).width > maxWidth) {
        lines.push(line);
        line = character;
      } else {
        line += character;
      }
    }
    lines.push(line);
  }
  return lines;
}

export function buildComicImageLayout(
  panels: ComicLayoutPanel[], title: string, columns: number, attribution: string, ctx: TextMeasurer,
) {
  const style = COMIC_IMAGE_STYLE;
  const width = columns * style.panelWidth + (columns - 1) * style.gap + style.margin * 2;
  const block = (text: string, maxWidth: number, font: string, lineHeight: number, color: string): ComicTextBlock => {
    ctx.font = font;
    return { x: 0, y: 0, lines: splitComicText(ctx, text, maxWidth), lineHeight, font, color };
  };
  const heading = block(title.trim(), width - style.margin * 2, `bold 28px ${style.family}`, 38, "#222222");
  heading.x = width / 2;
  heading.y = style.margin;
  let rowY = style.margin + heading.lines.length * heading.lineHeight + (heading.lines.length ? style.gap : 0);
  const cells = panels.map(panel => {
    if (!Number.isFinite(panel.width) || !Number.isFinite(panel.height) || panel.width <= 0 || panel.height <= 0) {
      throw new Error(`第 ${panel.number} 格图片尺寸无效`);
    }
    const image = { x: 0, y: 0, width: style.panelWidth, height: style.panelWidth * panel.height / panel.width };
    const caption: ComicTextBlock[] = [];
    const dialogue = panel.dialogue.trim();
    const scene = panel.scene.trim();
    const maxTextWidth = style.panelWidth - style.textPadding * 2;
    if (dialogue) caption.push(block(dialogue, maxTextWidth, `500 18px ${style.family}`, 27, "#222222"));
    if (scene && scene !== dialogue) caption.push(block(scene, maxTextWidth, `14px ${style.family}`, 22, "#666666"));
    let bottom = image.height + (caption.length ? style.textPadding : 0);
    caption.forEach((item, index) => {
      if (index) bottom += style.paragraphGap;
      item.y = bottom;
      bottom += item.lines.length * item.lineHeight;
    });
    return { number: panel.number, x: 0, y: 0, width: style.panelWidth, height: bottom + (caption.length ? style.textPadding : 0), image, caption };
  });
  for (let start = 0; start < cells.length; start += columns) {
    const row = cells.slice(start, start + columns);
    row.forEach((cell, column) => {
      cell.x = style.margin + column * (style.panelWidth + style.gap);
      cell.y = rowY;
      cell.image.x = cell.x;
      cell.image.y = rowY;
      cell.caption.forEach(item => { item.x = cell.x + style.textPadding; item.y += rowY; });
    });
    rowY += Math.max(...row.map(cell => cell.height)) + style.gap;
  }
  let footer: ComicTextBlock | undefined;
  if (attribution.trim()) {
    footer = block(attribution.trim(), width - style.margin * 2, `12px ${style.family}`, 18, "#666666");
    footer.x = width - style.margin;
    footer.y = rowY;
    rowY += footer.lines.length * footer.lineHeight + style.margin;
  }
  return { width, height: Math.ceil(rowY - (footer ? 0 : style.gap) + style.margin), title: heading, cells, footer };
}
