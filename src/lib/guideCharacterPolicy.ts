import type { ComicScript } from "@/lib/types";

const GUIDE_CHARACTER_PATTERNS = [
  /\bknowledge explorer\b/i,
  /\bexplorer\b/i,
  /\bguide\b/i,
  /\bnarrator\b/i,
  /\bexplainer\b/i,
  /\bpresenter\b/i,
  /\bhost\b/i,
  /知识探索者/,
  /讲解员/,
  /旁白/,
  /解说员/,
];

function isGuideCharacterText(text: string | undefined): boolean {
  if (!text) return false;
  return GUIDE_CHARACTER_PATTERNS.some((pattern) => pattern.test(text));
}

function stripLeadingGuideTag(prompt: string, characterDescription: string): string {
  let nextPrompt = prompt.trim();
  if (!nextPrompt) return nextPrompt;

  if (characterDescription && nextPrompt.startsWith(characterDescription)) {
    nextPrompt = nextPrompt.slice(characterDescription.length).trimStart();
  }

  const leadingTag = nextPrompt.match(/^\s*\[[^\]]+\]\s*/);
  if (leadingTag && isGuideCharacterText(leadingTag[0])) {
    nextPrompt = nextPrompt.slice(leadingTag[0].length).trimStart();
  }

  return nextPrompt.replace(/^[,\s]+/, "");
}

export function stripDisallowedGuideCharacterFromScript(script: ComicScript): ComicScript {
  const characterDescription = script.characterDescription?.trim() ?? "";
  if (!isGuideCharacterText(characterDescription)) {
    return script;
  }

  return {
    ...script,
    characterDescription: "",
    panels: script.panels.map((panel) => ({
      ...panel,
      imagePrompt: stripLeadingGuideTag(panel.imagePrompt || "", characterDescription),
    })),
  };
}
