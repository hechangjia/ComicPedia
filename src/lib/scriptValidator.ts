/**
 * 脚本后校验器：在 LLM 生成脚本后、用户审查前自动执行。
 * 纯规则校验，零 LLM 调用，零额外成本。
 * 拦截角色漂移、构图重复、风格矛盾、语言混杂等质量问题。
 */

import { ComicScript, ComicStyle, ContentType, NarrativeOutline } from "./types";
import { STYLE_META } from "./config/styles";

export type WarningSeverity = "critical" | "warning" | "info";

export interface ScriptWarning {
  severity: WarningSeverity;
  dimension: "character" | "composition" | "style" | "language" | "narrative";
  panelIndices: number[];
  message: string;
  suggestion: string;
}

export interface ScriptValidation {
  passed: boolean;
  characterConsistency: boolean;
  compositionVariety: boolean;
  styleAlignment: boolean;
  languagePurity: boolean;
  warnings: ScriptWarning[];
}

export interface ScriptValidationContext {
  contentType?: ContentType;
  narrativeOutline?: NarrativeOutline;
}

// ── 构图关键词族 ──
const COMPOSITION_FAMILIES: Record<string, string[]> = {
  "wide/establishing": ["wide shot", "establishing shot", "panoramic", "landscape", "full scene"],
  "medium": ["medium shot", "mid shot", "waist shot", "cowboy shot"],
  "close-up": ["close-up", "close up", "closeup", "detail shot", "macro"],
  "portrait": ["portrait", "headshot", "face shot", "bust shot"],
  "low angle": ["low angle", "worm's eye", "worms eye", "looking up"],
  "high angle": ["high angle", "bird's eye", "birds eye", "aerial", "overhead", "top-down"],
  "over shoulder": ["over the shoulder", "OTS", "behind"],
  "dynamic": ["dynamic", "action shot", "dutch angle", "tilted"],
};

// ── CJK 字符检测正则 ──
const CJK_REGEX = /[\u3040-\u309F\u30A0-\u30FF\uAC00-\uD7AF\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF]/;
const STRONG_HOOK_SHOT_INTENTS = new Set(["hook-closeup", "contrast"]);
const VALID_ENDING_SHOT_INTENTS = new Set(["reveal", "aftermath"]);
const FLAT_EXPLANATION_PATTERNS = [
  "是一种",
  "是指",
  "通常",
  "主要",
  "一般",
  "解释",
  "定义",
  "介绍",
];
const HOOK_DIALOGUE_PATTERNS = ["为什么", "怎么会", "竟然", "突然", "却", "?", "？"];
const EXPLANATION_IMAGE_PATTERNS = ["teacher explaining", "explaining at", "lecturer", "podium", "blackboard"];
const SCENE_MOTIF_FAMILIES: Array<{ key: string; label: string; keywords: string[] }> = [
  {
    key: "battle",
    label: "战场/交战",
    keywords: ["战场", "交战", "厮杀", "冲锋", "军阵", "两军", "兵戈", "刀兵", "warfare", "battlefield", "armies", "clashing", "soldiers charging"],
  },
  {
    key: "lecture",
    label: "讲解/说理",
    keywords: ["讲解", "解释", "介绍", "课堂", "老师", "黑板", "explaining", "lecture", "classroom", "blackboard"],
  },
  {
    key: "diagram",
    label: "图示/机制",
    keywords: ["示意图", "流程", "机制", "图解", "diagram", "process", "flowchart", "schematic", "mechanism"],
  },
];

/**
 * 校验脚本质量，返回结构化校验结果。
 */
export function validateScript(
  script: ComicScript,
  context: ScriptValidationContext = {},
): ScriptValidation {
  const warnings: ScriptWarning[] = [];

  // ── 1. 角色一致性检查 ──
  const characterConsistency = checkCharacterConsistency(script, warnings);

  // ── 2. 构图多样性检查 ──
  const compositionVariety = checkCompositionVariety(script, warnings);

  // ── 3. 风格一致性检查 ──
  const styleAlignment = checkStyleAlignment(script, warnings);

  // ── 4. 语言纯净度检查 ──
  const languagePurity = checkLanguagePurity(script, warnings);

  // ── 5. 叙事重复检查 ──
  checkNarrativeRepetition(script, warnings);

  // ── 6. science / wikipedia 节奏兑现检查 ──
  checkNarrativeBeatPlanAlignment(script, warnings, context);

  const hasCritical = warnings.some(w => w.severity === "critical");

  return {
    passed: !hasCritical,
    characterConsistency,
    compositionVariety,
    styleAlignment,
    languagePurity,
    warnings,
  };
}

function checkNarrativeBeatPlanAlignment(
  script: ComicScript,
  warnings: ScriptWarning[],
  context: ScriptValidationContext,
): void {
  const { contentType, narrativeOutline } = context;
  if (!narrativeOutline) return;
  if (contentType !== "science" && contentType !== "wikipedia") return;

  const panels = script.panels;
  const outlinePanels = narrativeOutline.panels;
  if (panels.length === 0 || outlinePanels.length === 0) return;

  const openingPanels = panels.slice(0, 2);
  const openingOutline = outlinePanels.slice(0, 2);
  const expectsHook = openingOutline.some((panel) => panel.beatRole === "hook");
  const hasHookDialogue = openingPanels.some((panel) =>
    HOOK_DIALOGUE_PATTERNS.some((token) => panel.dialogue.includes(token))
  );
  const hasStrongHookShot = openingPanels.some((panel) => {
    const prompt = panel.imagePrompt.toLowerCase();
    return prompt.includes("close-up") || prompt.includes("close up") || prompt.includes("contrast");
  });
  const looksLikeFlatExplanation = openingPanels.length > 0 && openingPanels.every((panel) =>
    FLAT_EXPLANATION_PATTERNS.some((token) => panel.dialogue.includes(token)) ||
    EXPLANATION_IMAGE_PATTERNS.some((token) => panel.imagePrompt.toLowerCase().includes(token))
  );

  if (expectsHook && !hasHookDialogue && !hasStrongHookShot && looksLikeFlatExplanation) {
    warnings.push({
      severity: "warning",
      dimension: "narrative",
      panelIndices: openingPanels.map((_, index) => index),
      message: "开场缺少钩子，前两格更像平铺直叙讲解而不是漫画化引入",
      suggestion: "第一格加入反常识现象、冲突问题或强特写镜头，让读者先产生继续看的冲动",
    });
  }

  const repeatedBeatRoleIndices: number[] = [];
  for (let i = 1; i < outlinePanels.length; i++) {
    if (outlinePanels[i - 1].beatRole === outlinePanels[i].beatRole) {
      repeatedBeatRoleIndices.push(i - 1, i);
    }
  }
  if (repeatedBeatRoleIndices.length > 0) {
    warnings.push({
      severity: "warning",
      dimension: "narrative",
      panelIndices: [...new Set(repeatedBeatRoleIndices)],
      message: "叙事职责重复，相邻面板没有形成推进关系",
      suggestion: "相邻面板应分工不同：钩子、推进、揭示、收束要形成明确递进，而不是连续重复同一职责",
    });
  }

  const repeatedShotIntentIndices: number[] = [];
  for (let i = 1; i < outlinePanels.length; i++) {
    if (outlinePanels[i - 1].shotIntent === outlinePanels[i].shotIntent) {
      repeatedShotIntentIndices.push(i - 1, i);
    }
  }
  if (repeatedShotIntentIndices.length > 0) {
    warnings.push({
      severity: "warning",
      dimension: "composition",
      panelIndices: [...new Set(repeatedShotIntentIndices)],
      message: "镜头意图重复，连续面板缺少视觉节奏变化",
      suggestion: "在相邻面板间切换 establish / contrast / reveal / aftermath 等不同镜头意图，避免连续同构图",
    });
  }

  const hasRequiredStrongShot = outlinePanels.some((panel) =>
    STRONG_HOOK_SHOT_INTENTS.has(panel.shotIntent)
  );
  if (!hasRequiredStrongShot) {
    warnings.push({
      severity: "warning",
      dimension: "composition",
      panelIndices: [],
      message: "缺少强镜头变化，整组分镜里没有 hook-closeup 或 contrast",
      suggestion: "至少保留一个强特写或强对照镜头，避免整组分镜都像平顺说明图",
    });
  }

  const lastOutlinePanel = outlinePanels[Math.min(panels.length, outlinePanels.length) - 1];
  if (lastOutlinePanel && !VALID_ENDING_SHOT_INTENTS.has(lastOutlinePanel.shotIntent)) {
    warnings.push({
      severity: "warning",
      dimension: "narrative",
      panelIndices: [Math.min(panels.length, outlinePanels.length) - 1],
      message: "结尾缺少揭示或余波，最后一格仍停留在平铺解释",
      suggestion: "最后一格优先做 reveal 或 aftermath，让结尾形成记忆点，而不是继续主持式讲解",
    });
  }

  const overloadedPanels = panels
    .map((panel, index) => ({
      index,
      dialogueParts: panel.dialogue.split(/[，,；;：:]/).filter(Boolean).length,
      sceneLength: panel.scene.length,
    }))
    .filter(({ dialogueParts, sceneLength }) => dialogueParts >= 4 || sceneLength > 28)
    .map(({ index }) => index);

  if (overloadedPanels.length > 0) {
    warnings.push({
      severity: "warning",
      dimension: "narrative",
      panelIndices: overloadedPanels,
      message: "单格信息堆积，部分面板同时承担了过多概念或结论",
      suggestion: "把单格中过多的概念拆开，让一格只承担一个主要知识推进目标",
    });
  }
}

/**
 * 检查角色描述是否在各面板间保持一致。
 */
function checkCharacterConsistency(script: ComicScript, warnings: ScriptWarning[]): boolean {
  if (!script.characterDescription) return true;

  const panels = script.panels;
  const charTagRegex = /\[([^\]]+):\s*([^\]]+)\]/g;

  // 收集每格的角色标签
  const panelCharTags: Map<number, Map<string, string>> = new Map();
  let anyTagFound = false;

  for (let i = 0; i < panels.length; i++) {
    const tags = new Map<string, string>();
    let match;
    charTagRegex.lastIndex = 0;
    while ((match = charTagRegex.exec(panels[i].imagePrompt)) !== null) {
      tags.set(match[1].trim().toLowerCase(), match[2].trim());
      anyTagFound = true;
    }
    panelCharTags.set(i, tags);
  }

  if (!anyTagFound) return true; // 没有角色标签，由 promptEnhancer 兜底

  // 检查同名角色在不同面板间的描述是否一致
  const charDescriptions: Map<string, { desc: string; panelIdx: number }[]> = new Map();
  for (const [panelIdx, tags] of panelCharTags) {
    for (const [name, desc] of tags) {
      if (!charDescriptions.has(name)) charDescriptions.set(name, []);
      charDescriptions.get(name)!.push({ desc, panelIdx });
    }
  }

  let consistent = true;
  for (const [name, entries] of charDescriptions) {
    if (entries.length < 2) continue;

    const uniqueDescs = new Set(entries.map(e => e.desc.toLowerCase()));
    if (uniqueDescs.size > 1) {
      consistent = false;
      const driftPanels = entries.map(e => e.panelIdx);
      warnings.push({
        severity: "warning",
        dimension: "character",
        panelIndices: driftPanels,
        message: `角色"${name}"在不同面板中描述不一致（${uniqueDescs.size}种变体）`,
        suggestion: `统一"${name}"的外貌描述，确保面部特征、发型、服装在所有面板中完全相同`,
      });
    }
  }

  return consistent;
}

/**
 * 检查构图是否有足够多样性。
 */
function checkCompositionVariety(script: ComicScript, warnings: ScriptWarning[]): boolean {
  const panels = script.panels;
  if (panels.length <= 2) return true;

  // 对每个面板识别构图类型
  const panelCompositions: (string | null)[] = panels.map(p => {
    const promptLower = p.imagePrompt.toLowerCase();
    for (const [family, keywords] of Object.entries(COMPOSITION_FAMILIES)) {
      if (keywords.some(k => promptLower.includes(k))) return family;
    }
    return null;
  });

  // 检查连续面板是否使用相同构图
  const consecutiveSame: number[] = [];
  for (let i = 1; i < panelCompositions.length; i++) {
    const prev = panelCompositions[i - 1];
    const curr = panelCompositions[i];
    if (prev && curr && prev === curr) {
      consecutiveSame.push(i);
    }
  }

  if (consecutiveSame.length > 0) {
    warnings.push({
      severity: "warning",
      dimension: "composition",
      panelIndices: consecutiveSame,
      message: `${consecutiveSame.length}处连续面板使用相同构图（${[...new Set(consecutiveSame.map(i => panelCompositions[i]))].join("、")}）`,
      suggestion: "交替使用不同景别：建立镜头(wide) → 中景(medium) → 特写(close-up) → 低角度(low angle)，制造视觉节奏",
    });
  }

  // 检查构图类型丰富度
  const uniqueCompositions = new Set(panelCompositions.filter(Boolean));
  const minExpectedVariety = Math.min(3, Math.ceil(panels.length / 2));

  if (uniqueCompositions.size < minExpectedVariety) {
    warnings.push({
      severity: "info",
      dimension: "composition",
      panelIndices: [],
      message: `仅使用${uniqueCompositions.size}种构图类型（建议至少${minExpectedVariety}种）`,
      suggestion: "增加构图多样性：尝试俯拍、仰拍、过肩镜头、荷兰角等，丰富视觉叙事层次",
    });
    return false;
  }

  // 检查无构图标记的面板
  const noComposition = panelCompositions
    .map((c, i) => c === null ? i : -1)
    .filter(i => i >= 0);

  if (noComposition.length > panels.length * 0.5) {
    warnings.push({
      severity: "info",
      dimension: "composition",
      panelIndices: noComposition,
      message: `${noComposition.length}/${panels.length}个面板缺少明确构图指令`,
      suggestion: "在 imagePrompt 中添加构图关键词（如 close-up、wide shot），让图片模型更精确地控制画面",
    });
  }

  return consecutiveSame.length === 0;
}

/**
 * 检查 imagePrompt 是否与选定风格矛盾。
 */
function checkStyleAlignment(script: ComicScript, warnings: ScriptWarning[]): boolean {
  const style = script.style;
  const meta = STYLE_META[style];
  if (!meta) return true;

  // 从负面提示词中提取矛盾风格词
  const negTerms = (meta.negativePrompt ?? "")
    .split(",")
    .map(s => s.trim().toLowerCase())
    .filter(s => s.length > 3);

  // 定义风格族间的强矛盾关系
  const styleConflicts: Record<string, string[]> = {
    watercolor: ["neon", "cyberpunk", "digital art", "3d render", "sharp edges", "vector"],
    inkwash: ["neon", "cyberpunk", "vibrant saturated", "3d render", "digital art"],
    sketch: ["vibrant color", "neon", "3d render", "digital", "saturated"],
    realistic: ["chibi", "super deformed", "kawaii", "cel shading"],
    chibi: ["realistic anatomy", "detailed muscles", "photorealistic"],
    pixel: ["smooth gradient", "anti-aliasing", "photorealistic", "high resolution detail"],
    manga: ["full color", "vibrant colors", "watercolor", "pastel"],
  };

  const extraConflicts = styleConflicts[style] || [];
  const allConflicts = [...negTerms, ...extraConflicts];

  let aligned = true;
  for (let i = 0; i < script.panels.length; i++) {
    const promptLower = script.panels[i].imagePrompt.toLowerCase();
    const found: string[] = [];

    for (const term of allConflicts) {
      if (promptLower.includes(term)) {
        found.push(term);
      }
    }

    if (found.length > 0) {
      aligned = false;
      warnings.push({
        severity: "warning",
        dimension: "style",
        panelIndices: [i],
        message: `面板${i + 1}的 imagePrompt 包含与${meta.label}风格矛盾的词：${found.join("、")}`,
        suggestion: `移除矛盾词，或使用与${meta.label}风格兼容的替代表达`,
      });
    }
  }

  return aligned;
}

/**
 * 检查 imagePrompt 是否为纯英文。
 */
function checkLanguagePurity(script: ComicScript, warnings: ScriptWarning[]): boolean {
  let pure = true;
  const impurePanels: number[] = [];

  for (let i = 0; i < script.panels.length; i++) {
    if (CJK_REGEX.test(script.panels[i].imagePrompt)) {
      impurePanels.push(i);
      pure = false;
    }
  }

  if (impurePanels.length > 0) {
    warnings.push({
      severity: "info",
      dimension: "language",
      panelIndices: impurePanels,
      message: `${impurePanels.length}个面板的 imagePrompt 包含中日韩文字（生成时会自动清理，但可能损失语义）`,
      suggestion: "将 imagePrompt 中的非英文内容翻译为英文，以保留完整语义",
    });
  }

  return pure;
}

/**
 * 检查对话和场景是否存在高度重复。
 */
function checkNarrativeRepetition(script: ComicScript, warnings: ScriptWarning[]): void {
  const panels = script.panels;
  if (panels.length <= 2) return;

  // 检查连续面板的对话/场景重复
  for (let i = 1; i < panels.length; i++) {
    const prevDialogue = panels[i - 1].dialogue.trim();
    const currDialogue = panels[i].dialogue.trim();

    if (prevDialogue.length > 10 && currDialogue.length > 10) {
      const similarity = computeSimilarity(prevDialogue, currDialogue);
      if (similarity > 0.7) {
        warnings.push({
          severity: "warning",
          dimension: "narrative",
          panelIndices: [i - 1, i],
          message: `面板${i}和${i + 1}的对话高度相似（${Math.round(similarity * 100)}%）`,
          suggestion: "差异化两格的对话内容：前一格可以提出问题/设置悬念，后一格给出解答/推进情节",
        });
      }
    }
  }

  const motifHits = panels
    .map((panel, index) => ({
      index,
      family: detectSceneMotifFamily(`${panel.scene} ${panel.dialogue} ${panel.imagePrompt}`),
    }))
    .filter((item): item is { index: number; family: { key: string; label: string; keywords: string[] } } => item.family !== null);

  const families = new Map<string, { label: string; indices: number[] }>();
  for (const hit of motifHits) {
    const existing = families.get(hit.family.key);
    if (existing) {
      existing.indices.push(hit.index);
    } else {
      families.set(hit.family.key, {
        label: hit.family.label,
        indices: [hit.index],
      });
    }
  }

  for (const family of families.values()) {
    if (family.indices.length >= Math.ceil(panels.length * 0.6) && panels.length >= 4) {
      warnings.push({
        severity: "warning",
        dimension: "narrative",
        panelIndices: family.indices,
        message: `场景语义重复，超过半数面板停留在同一类场景（${family.label}）`,
        suggestion: "把相邻面板拆成不同功能场景，例如铺垫、谋划、特写、转折、余波，而不是只换镜头继续停留在同一空间里",
      });
      break;
    }
  }
}

/**
 * 简易文本相似度（bigram Jaccard）。
 */
function computeSimilarity(a: string, b: string): number {
  const bigramsA = getBigrams(a);
  const bigramsB = getBigrams(b);
  if (bigramsA.size === 0 && bigramsB.size === 0) return 1;

  let intersection = 0;
  for (const bg of bigramsA) {
    if (bigramsB.has(bg)) intersection++;
  }

  const union = bigramsA.size + bigramsB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function getBigrams(text: string): Set<string> {
  const s = new Set<string>();
  const normalized = text.toLowerCase().replace(/\s+/g, " ");
  for (let i = 0; i < normalized.length - 1; i++) {
    s.add(normalized.slice(i, i + 2));
  }
  return s;
}

function detectSceneMotifFamily(text: string): { key: string; label: string; keywords: string[] } | null {
  const normalized = text.toLowerCase();
  for (const family of SCENE_MOTIF_FAMILIES) {
    if (family.keywords.some((keyword) => normalized.includes(keyword.toLowerCase()))) {
      return family;
    }
  }
  return null;
}

/**
 * 从脚本中提取并标准化 canonical 角色描述。
 * 如果各面板有不同的角色标签变体，统一为最长（最详细）的版本。
 * 返回标准化后的 characterDescription（可回写到 script）。
 */
export function canonicalizeCharacterDescription(script: ComicScript): string | undefined {
  if (!script.characterDescription) return undefined;

  const charTagRegex = /\[([^\]]+):\s*([^\]]+)\]/g;

  // 收集所有面板中同名角色的所有描述变体
  const charVariants: Map<string, string[]> = new Map();

  for (const panel of script.panels) {
    let match;
    charTagRegex.lastIndex = 0;
    while ((match = charTagRegex.exec(panel.imagePrompt)) !== null) {
      const name = match[1].trim().toLowerCase();
      const desc = match[2].trim();
      if (!charVariants.has(name)) charVariants.set(name, []);
      charVariants.get(name)!.push(desc);
    }
  }

  if (charVariants.size === 0) return script.characterDescription;

  // 对每个角色，选择最长的描述作为 canonical 版本
  const canonicalParts: string[] = [];
  for (const [name, variants] of charVariants) {
    const longest = variants.reduce((a, b) => a.length >= b.length ? a : b);
    const displayName = name.charAt(0).toUpperCase() + name.slice(1);
    canonicalParts.push(`[${displayName}: ${longest}]`);
  }

  return canonicalParts.join(" ");
}

/**
 * 将标准化的角色描述回写到每个面板的 imagePrompt 中。
 * 替换各面板中已有的角色标签为 canonical 版本，确保完全一致。
 */
export function applyCanonicalCharacterDesc(script: ComicScript): void {
  const canonical = canonicalizeCharacterDescription(script);
  if (!canonical) return;

  const charTagRegex = /\[([^\]]+):\s*[^\]]+\]/g;

  // 从 canonical 中提取每个角色的标准描述
  const canonicalTags: Map<string, string> = new Map();
  let match;
  charTagRegex.lastIndex = 0;
  while ((match = charTagRegex.exec(canonical)) !== null) {
    canonicalTags.set(match[1].trim().toLowerCase(), match[0]);
  }

  if (canonicalTags.size === 0) return;

  // 替换每个面板中的角色标签，并为无标签面板补充
  for (const panel of script.panels) {
    let prompt = panel.imagePrompt;
    const panelTagRegex = /\[([^\]]+):\s*[^\]]+\]/g;
    let panelMatch;
    panelTagRegex.lastIndex = 0;

    const foundNames = new Set<string>();
    while ((panelMatch = panelTagRegex.exec(prompt)) !== null) {
      const name = panelMatch[1].trim().toLowerCase();
      foundNames.add(name);
      const canonicalTag = canonicalTags.get(name);
      if (canonicalTag && panelMatch[0] !== canonicalTag) {
        prompt = prompt.replace(panelMatch[0], canonicalTag);
      }
    }

    // 如果面板有部分角色标签但缺少某些角色，不强制注入（LLM 可能有意不包含该角色）
    // 如果面板完全没有角色标签，由 promptEnhancer 兜底注入全局 characterDescription
    panel.imagePrompt = prompt;
  }

  // 同步更新 script 级描述
  script.characterDescription = canonical;
}
