// Re-export hub — all exports preserved for backward compatibility
// Original module split into src/lib/export/*.ts

export { getWatermarkText, setWatermarkText, downloadTextFile } from "./export/shared";
export { downloadSingleImage, downloadComicAsImage, generateComicImageBlob, copyComicImageToClipboard, shareComic } from "./export/image";
export { downloadAsZip } from "./export/zip";
export { downloadAsPdf, renderPdfCoverPage, computeCellLayout, renderPdfPage } from "./export/pdf";
export { downloadForXiaohongshuSingle, downloadForXiaohongshuPages, downloadForXiaohongshu } from "./export/xhs";
export type { XHSExportMode } from "./export/xhs";
export { buildSeedanceData, downloadForSeedanceJSON, downloadForSeedanceText, downloadForSeedanceZip } from "./export/seedance";
export type { SeedanceSegment, SeedanceExportData } from "./export/seedance";
export { generateMarkdownContent, downloadMarkdownWithImages } from "./export/markdown";
