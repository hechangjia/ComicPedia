import { ComicPanel, ComicScript } from "../types";
import { imageToBlob, triggerBlobDownload, dateSuffix } from "./shared";

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
