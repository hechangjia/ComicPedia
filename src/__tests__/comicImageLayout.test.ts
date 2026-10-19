import { describe, expect, it } from "vitest";
import { buildComicImageLayout, splitComicText, COMIC_IMAGE_STYLE } from "@/lib/export/comicLayout";

const measure = { font: "", measureText: (text: string) => ({ width: Array.from(text).length * 10 }) };
const panel = (number: number, width = 1536, height = 1024) => ({ number, width, height, dialogue: `旁白：第${number}格。`, scene: "" });

describe("comic image layout", () => {
  it("matches the reader's square center-crop and anchors captions directly below", () => {
    const layout = buildComicImageLayout([panel(1, 1312, 1199), panel(2)], "乔布斯", 2, "", measure);
    expect(layout.cells[0].image).toMatchObject({ width: 512, height: 512, sourceX: 56.5, sourceY: 0, sourceWidth: 1199, sourceHeight: 1199 });
    expect(layout.cells[1].image).toMatchObject({ width: 512, height: 512, sourceX: 256, sourceY: 0, sourceWidth: 1024, sourceHeight: 1024 });
    for (const cell of layout.cells) {
      expect(cell.image.y).toBe(cell.y);
      expect(cell.caption[0].y - (cell.image.y + cell.image.height)).toBe(COMIC_IMAGE_STYLE.textPadding);
      expect(cell.caption[0].y + cell.caption[0].lines.length * cell.caption[0].lineHeight).toBeLessThanOrEqual(cell.y + cell.height);
    }
    expect(layout.cells[0].height).toBe(layout.cells[1].height);
  });

  it("keeps mixed image ratios and long multi-paragraph captions inside their own row", () => {
    const first = { ...panel(1), dialogue: "乔布斯：" + "技术需要服务普通人。".repeat(35) + "\n旁白：下一段不能与上一段挤在同一行。", scene: "场景说明" };
    const layout = buildComicImageLayout([first, panel(2, 600, 900), panel(3)], "长标题".repeat(50), 2, "署名".repeat(100), measure);
    const [left, right, next] = layout.cells;
    expect(right.image.height).toBe(COMIC_IMAGE_STYLE.panelWidth);
    expect(right.image.sourceY).toBe(150);
    expect(right.image.sourceHeight).toBe(600);
    expect(left.height).toBe(right.height);
    expect(next.y).toBeGreaterThanOrEqual(Math.max(left.y + left.height, right.y + right.height) + COMIC_IMAGE_STYLE.gap);
    expect(layout.title.lines.length).toBeGreaterThan(1);
    expect(left.y).toBeGreaterThanOrEqual(layout.title.y + layout.title.lines.length * layout.title.lineHeight);
    expect(layout.footer!.y).toBeGreaterThan(next.y + next.height);
    expect(layout.height).toBeGreaterThanOrEqual(layout.footer!.y + layout.footer!.lines.length * layout.footer!.lineHeight);
    for (const cell of layout.cells) for (const block of cell.caption) {
      expect(block.y + block.lines.length * block.lineHeight).toBeLessThanOrEqual(cell.y + cell.height);
      for (const line of block.lines) expect(measure.measureText(line).width).toBeLessThanOrEqual(cell.image.width - COMIC_IMAGE_STYLE.textPadding * 2);
    }
  });

  it("omits disabled text without leaving a caption band and preserves selected panel numbering", () => {
    const layout = buildComicImageLayout([{ ...panel(8), dialogue: "", scene: "" }], "", 1, "", measure);
    expect(layout.cells[0].number).toBe(8);
    expect(layout.cells[0].caption).toEqual([]);
    expect(layout.cells[0].height).toBe(layout.cells[0].image.height);
  });

  it("respects explicit newlines, blank paragraphs and whole Unicode characters", () => {
    expect(splitComicText(measure, "你好\n\n世界\r\n🙂🙂", 20)).toEqual(["你好", "", "世界", "🙂🙂"]);
    expect(splitComicText(measure, "🙂🙂🙂", 20)).toEqual(["🙂🙂", "🙂"]);
  });
});
