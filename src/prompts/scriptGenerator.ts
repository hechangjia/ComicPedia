import { Character, ComicScript, ComicStyle } from "../lib/types";
import { getStyleGuidanceForLLM } from "../lib/config/styles";

/** 分镜脚本生成 Prompt 模板 */
export function buildScriptPrompt(
  topic: string,
  style: ComicStyle,
  panelCount?: number,
  character?: Character
): string {
  const panelGuidance = panelCount && panelCount > 0
    ? `优先规划${panelCount}格，如为保证知识讲清可在±2格范围内微调。`
    : "自行选择最合适的分镜数量（通常6-10格），以把所有关键知识点逐步讲清楚为最高优先。宁可多几格把知识拆细，也不要压缩跳跃导致读者跟不上。";

  // 构造角色约束（用户主动指定角色时生效）
  let characterConstraint = "";
  if (character) {
    const isNonHuman = !!character.appearance.species;

    // Build appearance description: context-aware for human vs non-human characters
    const appearanceParts: string[] = [];
    if (isNonHuman) {
      appearanceParts.push(character.appearance.species!);
      if (character.appearance.age) appearanceParts.push(character.appearance.age);
      // For non-human characters, use field values as-is (no "hair"/"wearing" suffix)
      if (character.appearance.hair) appearanceParts.push(character.appearance.hair);
      if (character.appearance.eyes) appearanceParts.push(character.appearance.eyes);
      if (character.appearance.clothing) appearanceParts.push(character.appearance.clothing);
    } else {
      if (character.appearance.gender) appearanceParts.push(character.appearance.gender);
      if (character.appearance.age) appearanceParts.push(character.appearance.age);
      if (character.appearance.hair) appearanceParts.push(`${character.appearance.hair} hair`);
      if (character.appearance.eyes) appearanceParts.push(`${character.appearance.eyes} eyes`);
      if (character.appearance.clothing) appearanceParts.push(`wearing ${character.appearance.clothing}`);
    }
    if (character.description) appearanceParts.push(character.description);
    const appearance = appearanceParts.join(", ");

    characterConstraint = `
## 强制性角色约束（用户已指定，必须使用）
用户已指定主角，**跳过叙事策略选择**，直接使用以下角色：
- **Name**: ${character.name}
- **Type**: ${isNonHuman ? `Non-human mascot (${character.appearance.species})` : "Human character"}
- **Appearance**: ${appearance}

在 characterDescription 中使用上述外观描述，每格 imagePrompt 以完整描述开头。
`;
  }

  return `你是一位专业的科普漫画编剧，擅长把复杂概念拆解为可视化的分镜叙事。请根据以下科普主题创作分镜脚本。

## 主题
${topic}

## 风格要求
${getStyleGuidanceForLLM(style)}

## 分镜数量
${panelGuidance}

## ⚠️ 内容深度要求（极其重要！）

你是在创作**硬核科普**，不是泛泛而谈。请务必遵守：

1. **概念拆解**：将复杂概念拆分为多个递进步骤，每格只讲一个子概念或知识点
2. **先具象后抽象**：第1-2格用生活化类比或历史背景引入，后续格逐步深入技术本质
3. **禁止空洞**：每格的 dialogue 都必须传递**实质性知识点**，严禁使用以下空泛表述：
   - ❌ "这很神奇/这很重要/让我们来看看"
   - ❌ "科学真奇妙/知识改变世界"
   - ✅ "Query 就像你心中的问题，Key 就像每道菜的标签，两者越匹配，注意力分数越高"
4. **关键机制必讲**：如果主题涉及核心公式或流程（如 Q/K/V、softmax），必须用至少2-3格**逐步图示化**讲清楚，不能一笔带过
5. **逻辑递进**：分镜之间必须有清晰的知识递进关系

${characterConstraint}

## 叙事策略选择（根据主题自动判断）

${character ? "（已跳过——用户指定了角色）" : `请根据主题特征选择**最合适的一种**叙事策略：

### 策略 A：历史人物引入（优先考虑！）
**适用条件**：该知识/技术有明确的提出者、发明者或关键人物。
**示例主题**：Transformer/注意力机制 → Ashish Vaswani 等人（2017年 Google Brain）；相对论 → 爱因斯坦；进化论 → 达尔文

执行方式：
- 前1-2格：用**真实历史人物**引出背景（谁、何时、面对什么问题、为什么提出）
- 角色外观基于**真实形象**设计（如 Vaswani: young Indian-American researcher, dark skin, short black hair, wearing casual tech company attire）
- 后续格转入概念本身的深度讲解，人物可以退场或作为旁观者
- **禁止使用"李教授""王博士"等虚构教授角色**

### 策略 B：概念驱动（无角色）
**适用条件**：纯抽象概念、机制原理，不需要人物引导。
**示例主题**：量子纠缠的数学本质、TCP/IP 四层模型、光合作用的化学反应

执行方式：
- 不设计人物角色，characterDescription 留空（设为 ""）
- 画面完全聚焦于**可视化图示**：流程图、对比图、粒子效果、拟人化概念体
- 每格用视觉隐喻 + 旁白讲解知识点

### 策略 C：拟人化叙事
**适用条件**：微观世界、生物机制等适合拟人化的主题。
**示例主题**：免疫系统如何工作、DNA 复制、神经元信号传导

执行方式：
- 将概念体设计为有趣的拟人化角色（如：白细胞战士、神经元信使）
- 角色服务于知识表达，而非为了有角色而有角色
- characterDescription 描述拟人化概念体的外观`}

## ⚠️ 语言限制（必须严格遵守）

1. **imagePrompt 必须是纯英文**，禁止任何非 ASCII 字符
2. **即使选择"manga"或"anime"风格，也不能输出日文/韩文**
3. 对话(dialogue)和场景(scene)使用**简体中文**

## ⚠️ imagePrompt 绝对禁止包含任何文字相关元素（极其重要！）

imagePrompt 描述的是**纯视觉画面**，文生图模型会把任何文字相关描述渲染为乱码。以下词汇**绝对禁止**出现在 imagePrompt 中：

- ❌ speech bubble, dialogue bubble, text bubble, thought bubble
- ❌ caption, label, subtitle, title, sign, banner, placard
- ❌ writing, handwriting, calligraphy, blackboard text, whiteboard text
- ❌ narration, narration box, text overlay, annotation
- ❌ "saying...", "text reading...", "words..."

正确做法：用**纯视觉元素**表达概念：
- ✅ glowing arrows, floating diagram, holographic flowchart, color-coded pathways
- ✅ split-screen comparison, magnifying glass revealing inner structure
- ✅ particle effects, energy beams, translucent overlay showing mechanism

## 角色一致性规则（如果使用了角色）

如果选择了策略 A 或 C（有角色），必须遵守：

1. 将角色的**完整外观描述**写入 characterDescription 字段，格式：
   "[角色名: 30-50词详细英文外观描述，包含年龄、体型、发型、服装、显著特征]"

2. 每格 imagePrompt 以**完整的 characterDescription 开头**（一字不差地复制）

3. 如果选择策略 B（无角色），characterDescription 设为空字符串 ""

## imagePrompt 写作规范

每格的 imagePrompt 必须采用**标签式格式**，包含以下要素：

1. **角色描述**：完整的 characterDescription（如有，放开头）
2. **动作/姿态**：具体描述（如 pointing at, examining, holding）
3. **场景环境**：具体描述（如 modern laboratory, cosmic background, abstract data space）
4. **视觉化概念**：用图示/光效/粒子等**纯视觉元素**表达知识点
5. **镜头构图**：必须指定，交替使用：wide shot / medium shot / close-up / bird's eye view / over-the-shoulder shot
6. **光照氛围**：bright lighting / dramatic rim lighting / warm golden light / cool blue tones

### 示例（策略 A：历史人物引入）
Panel 1: "[Vaswani: young Indian-American researcher in his early 30s, dark skin, short black hair, neat beard, wearing Google branded t-shirt and jeans, confident focused expression] standing in front of whiteboard in Google Brain office, surrounded by scattered research papers, thoughtful expression looking at complex diagram, medium shot, warm office lighting, 2017 setting"
Panel 5:（概念深入格，人物退场）"abstract visualization of attention mechanism, three parallel streams of glowing particles labeled by color: blue stream for Query, green stream for Key, red stream for Value, particles connecting through luminous bridges, dark cosmic background, wide shot, dramatic lighting"

## 输出格式
请严格按以下 JSON 格式输出，不要添加任何其他内容：
{
  "title": "漫画标题（简短有趣，中文）",
  "topic": "${topic}",
  "style": "${style}",
  "characterDescription": "角色外观描述（英文）或空字符串（策略B无角色时）",
  "seed": ${Math.floor(Math.random() * 1000000)},
  "panels": [
    {
      "id": 1,
      "scene": "场景描述（简短，简体中文）",
      "dialogue": "对话或旁白（简体中文，必须包含实质性知识点，口语化）",
      "imagePrompt": "（如有角色）完整 characterDescription + 动作 + 场景 + 视觉化概念 + 镜头构图 + 光照"
    }
  ]
}

## 创作原则
1. **知识密度**：每格都必须传递实质性知识，禁止空洞填充
2. **科学准确**：确保科普内容正确、关键概念解释清楚
3. **先具象后抽象**：用历史背景/生活类比引入，逐步深入核心机制
4. **叙事合理**：选择最适合主题的叙事策略，不要强行塞角色
5. **构图多样**：交替使用远景、中景、特写等不同镜头
6. **纯视觉表达**：imagePrompt 只描述画面，绝不包含文字/旁白/对话框元素

请开始创作：`;
}

/** 解析 LLM 返回的脚本 */
export function parseScriptResponse(response: string): ComicScript | null {
  try {
    // 尝试提取 JSON 部分
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const script = JSON.parse(jsonMatch[0]) as ComicScript & {
      characterDescription?: string;
      seed?: number;
    };

    // 验证必要字段
    if (!script.title || !script.panels || !Array.isArray(script.panels)) {
      return null;
    }

    // 为每个 panel 设置初始状态，并确保角色描述一致性
    const characterDesc = script.characterDescription || "";

    script.panels = script.panels.map((panel, index) => {
      let imagePrompt = panel.imagePrompt || "";
      let dialogue = panel.dialogue || "";

      // === 质量修复 A1：空 dialogue 填充 ===
      if (!dialogue.trim()) {
        dialogue = panel.scene || script.title || "";
      }

      // === 质量修复 A2：过短 imagePrompt 自动扩展 ===
      if (imagePrompt.length < 40 && panel.scene) {
        // 从 scene 描述生成补充内容
        const sceneExpansion = panel.scene
          .replace(/[，。！？、]/g, ", ")
          .replace(/[\u4e00-\u9fff]/g, ""); // 移除中文
        imagePrompt = `${imagePrompt}, ${sceneExpansion}, detailed illustration, high quality`.replace(/^,\s*/, "");
      }

      // 强制注入角色描述到开头（不依赖 LLM 遵守规则）
      if (characterDesc) {
        const cleanPrompt = imagePrompt.replace(/^\[.*?\]\s*/g, "");
        imagePrompt = `${characterDesc} ${cleanPrompt}`;
      }

      // 确保末尾有无文字标记
      if (!imagePrompt.includes("text-free")) {
        imagePrompt = imagePrompt.replace(/,?\s*$/, ", text-free image, no watermark");
      }

      // 清理可能的非英文字符
      imagePrompt = cleanNonEnglishFromPrompt(imagePrompt);

      return {
        ...panel,
        id: panel.id || index + 1,
        dialogue,
        imagePrompt,
        status: "pending" as const,
      };
    });

    // === 质量修复 A3：检测面板多样性 ===
    // 如果超过一半的面板 scene 完全相同，追加序号区分
    if (script.panels.length > 3) {
      const sceneCounts = new Map<string, number>();
      for (const p of script.panels) {
        const s = p.scene?.trim() || "";
        sceneCounts.set(s, (sceneCounts.get(s) || 0) + 1);
      }
      for (const [scene, count] of sceneCounts) {
        if (count > script.panels.length / 2 && scene) {
          let seq = 1;
          for (const p of script.panels) {
            if (p.scene?.trim() === scene) {
              p.scene = `${scene}（${seq}）`;
              seq++;
            }
          }
        }
      }
    }

    return script;
  } catch {
    return null;
  }
}

/** 清理 imagePrompt 中的非英文字符（保留基本 ASCII 和常见标点） */
function cleanNonEnglishFromPrompt(prompt: string): string {
  // 移除日文假名（\u3040-\u309F \u30A0-\u30FF）、韩文（\uAC00-\uD7AF）
  // 移除 CJK 统一汉字（\u4E00-\u9FFF）——imagePrompt 应为纯英文
  // 保留 ASCII（\x00-\x7F）和 Latin Extended（\u00C0-\u024F）用于拼音等
  return prompt
    .replace(/[\u3040-\u309F\u30A0-\u30FF\uAC00-\uD7AF\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** 验证角色描述一致性 */
export function validateCharacterConsistency(script: ComicScript): {
  isConsistent: boolean;
  issues: string[];
} {
  const issues: string[] = [];
  const characterDesc = script.characterDescription;

  // 概念驱动模式（无角色）：跳过一致性检查
  if (!characterDesc) {
    return { isConsistent: true, issues: [] };
  }

  // 提取角色名称
  const characterNames = characterDesc.match(/\[([^\]:]+):/g)?.map(m => m.slice(1, -1)) || [];

  if (characterNames.length === 0) {
    issues.push("characterDescription 格式不正确，应使用 [角色名: 描述] 格式");
    return { isConsistent: false, issues };
  }

  // 检查每个 panel 是否包含角色描述
  script.panels.forEach((panel, index) => {
    const prompt = panel.imagePrompt.toLowerCase();
    const hasCharacterDesc = characterNames.some(name =>
      prompt.includes(name.toLowerCase()) || prompt.includes("[")
    );

    if (!hasCharacterDesc) {
      issues.push(`第 ${index + 1} 格缺少角色描述`);
    }
  });

  return {
    isConsistent: issues.length === 0,
    issues,
  };
}
