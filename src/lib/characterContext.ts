import { Character, CharacterRelation } from "./types";
import { getArcSummary } from "./series";

export interface CharacterContextBlock {
  text: string;
  characterNames: string[];
}

/**
 * Build a structured prompt block describing all characters, their relationships,
 * and optional series continuity context for multi-character stories.
 */
export function buildCharacterContext(
  characters: Character[],
  relations: CharacterRelation[],
  seriesContext?: { episodeNumber: number; seriesTitle: string; previousRecap?: string },
): CharacterContextBlock {
  if (characters.length === 0) {
    return { text: "", characterNames: [] };
  }

  const characterNames = characters.map(c => c.name);
  const sections: string[] = [];

  // ── Characters section ──
  sections.push("## CHARACTERS IN THIS STORY");
  for (const char of characters) {
    const parts: string[] = [`- **${char.name}**`];

    // Appearance
    const appearanceParts: string[] = [];
    const isNonHuman = !!char.appearance?.species;
    if (isNonHuman) {
      appearanceParts.push(char.appearance.species!);
      if (char.appearance.age) appearanceParts.push(char.appearance.age);
      if (char.appearance.hair) appearanceParts.push(char.appearance.hair);
      if (char.appearance.eyes) appearanceParts.push(char.appearance.eyes);
      if (char.appearance.clothing) appearanceParts.push(char.appearance.clothing);
    } else {
      if (char.appearance?.gender) appearanceParts.push(char.appearance.gender);
      if (char.appearance?.age) appearanceParts.push(char.appearance.age);
      if (char.appearance?.hair) appearanceParts.push(`${char.appearance.hair} hair`);
      if (char.appearance?.eyes) appearanceParts.push(`${char.appearance.eyes} eyes`);
      if (char.appearance?.clothing) appearanceParts.push(`wearing ${char.appearance.clothing}`);
    }
    if (char.description) appearanceParts.push(char.description);
    if (appearanceParts.length > 0) {
      parts.push(`  Appearance: ${appearanceParts.join(", ")}`);
    }

    // Personality
    if (char.personality) {
      if (char.personality.traits && char.personality.traits.length > 0) {
        const traitLabels = char.personality.traits.map(t =>
          typeof t === "string" ? t : t.label || t.dimension || String(t)
        );
        parts.push(`  Personality: ${traitLabels.join(", ")}`);
      }
      if (char.personality.speechStyle) {
        parts.push(`  Speech style: ${char.personality.speechStyle}`);
      }
      if (char.personality.arc) {
        parts.push(`  Arc: ${getArcSummary(char.personality.arc)}`);
      }
    }

    sections.push(parts.join("\n"));
  }

  // ── Relationships section ──
  if (relations.length > 0) {
    sections.push("");
    sections.push("## CHARACTER RELATIONSHIPS");
    const nameMap = new Map(characters.map(c => [c.id, c.name]));
    for (const rel of relations) {
      const fromName = nameMap.get(rel.fromId) || rel.fromId;
      const toName = nameMap.get(rel.toId) || rel.toId;
      const arrow = rel.bidirectional ? "↔" : "→";
      sections.push(`- ${fromName} ${arrow} ${toName}: ${rel.label} (${rel.type})`);
    }
  }

  // ── Series continuity section ──
  if (seriesContext) {
    sections.push("");
    sections.push("## STORY CONTINUITY");
    sections.push(`- Series: ${seriesContext.seriesTitle}`);
    sections.push(`- Episode: #${seriesContext.episodeNumber}`);
    if (seriesContext.previousRecap) {
      sections.push(`- Previous recap: ${seriesContext.previousRecap}`);
    }
    // Include character arc progressions
    for (const char of characters) {
      if (char.personality?.arc) {
        sections.push(`- ${char.name} arc: ${getArcSummary(char.personality.arc)}`);
      }
    }
  }

  return {
    text: sections.join("\n"),
    characterNames,
  };
}

/**
 * Infer which characters appear in a panel by case-insensitive name matching
 * against the scene description and dialogue text.
 */
export function inferAppearingCharacters(
  scene: string,
  dialogue: string,
  characterNames: string[],
): string[] {
  const combined = `${scene} ${dialogue}`.toLowerCase();
  return characterNames.filter(name => combined.includes(name.toLowerCase()));
}
