import { GenerateRequest, GenerateTask } from "@/lib/types";
import { generateTopicResearch, buildEnhancedTopicFromResearch } from "@/lib/llm";
import { generateNarrativeOutline } from "@/lib/director";
import { QUALITY_PRESETS } from "@/lib/config/quality";
import { notifyListeners, traceStart, traceEnd, traceSkip } from "./shared";

export interface ResearchResult {
  enhancedTopic: string;
  factPack?: GenerateTask["factPack"];
  researchBrief?: GenerateTask["researchBrief"];
  topicResearch?: GenerateTask["topicResearch"];
  narrativeOutline?: GenerateTask["narrativeOutline"];
}

/**
 * Phase 0 (Topic Research) + Phase 0.5 (Accuracy Research) + Phase 0.7 (Director Outline)
 */
export async function runResearchPhase(task: GenerateTask, request: GenerateRequest): Promise<ResearchResult> {
  let enhancedTopic = request.topic;
  const qualityLevel = request.quality || "standard";

  // ── Phase 0: Topic Research ──
  const canUseTopicResearch =
    (!request.contentType || request.contentType === "science" || request.contentType === "xiaohongshu")
    && !request.wikipediaContent;
  const shouldResearch = qualityLevel === "fine" && canUseTopicResearch;

  if (shouldResearch) {
    try {
      task.streamText = "正在研究主题...（本地模型首次加载可能需要等待）";
      notifyListeners(task);

      const research = await generateTopicResearch(
        request.topic,
        request.llmConfig,
      );

      // ── P3: Wikipedia 自动整合 — 尝试从 Wikipedia 获取权威知识补充 ──
      try {
        const isEnglishTopic = /^[\x00-\x7F]+$/.test(request.topic.trim());
        const wikiLang = isEnglishTopic ? "en" : "zh";
        const wikiRes = await fetch(`/api/wikipedia?q=${encodeURIComponent(request.topic)}&lang=${wikiLang}`);
        if (wikiRes.ok) {
          const wikiData = await wikiRes.json();
          const results = wikiData.results as Array<{ title: string; description?: string }>;
          if (results && results.length > 0) {
            const topResult = results[0];
            const summaryRes = await fetch(`/api/wikipedia?title=${encodeURIComponent(topResult.title)}&lang=${wikiLang}`);
            if (summaryRes.ok) {
              const summary = await summaryRes.json();
              if (summary.extract) {
                const wikiSnippet = summary.extract.slice(0, 500).replace(/\n+/g, " ").trim();
                if (wikiSnippet.length > 50) {
                  research.keyFacts.push(`[Wikipedia] ${wikiSnippet}`);
                  if (summary.sections && research.knowledgeMap) {
                    const wikiSections = (summary.sections as string[]).slice(0, 5);
                    for (const section of wikiSections) {
                      if (!research.knowledgeMap.related.includes(section)) {
                        research.knowledgeMap.related.push(section);
                      }
                    }
                  }
                  console.log(`[Research] Wikipedia enrichment: "${topResult.title}" (${wikiSnippet.length} chars)`);
                }
              }
            }
          }
        }
      } catch (wikiErr) {
        console.warn("[Research] Wikipedia auto-lookup failed (non-fatal):", wikiErr);
      }

      task.topicResearch = {
        expandedDescription: research.expandedDescription,
        keyFacts: research.keyFacts,
        narrativeAngle: research.narrativeAngle,
        narrativeAngles: research.narrativeAngles,
        knowledgeMap: research.knowledgeMap,
      };
      task.progress = 10;
      task.streamText = `[Topic Research]\n${research.expandedDescription}\n\nKey Facts:\n${research.keyFacts.map((f, i) => `${i + 1}. ${f}`).join("\n")}\n\nGenerating script...`;
      notifyListeners(task);

      enhancedTopic = buildEnhancedTopicFromResearch(research);
    } catch (researchErr) {
      console.warn("[Generator] Topic research failed, using original topic:", researchErr);
      task.streamText = undefined;
      notifyListeners(task);
    }
  }

  // ── Phase 0.5: Accuracy Research ──
  const shouldRunAccuracyResearch =
    qualityLevel !== "fast"
    && (request.contentType === "science" || request.contentType === "wikipedia");

  if (shouldRunAccuracyResearch) {
    try {
      task.streamText = "正在构建事实约束...";
      notifyListeners(task);

      const accuracyResearchRes = await fetch("/api/accuracy/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: request.topic,
          contentType: request.contentType,
          wikipediaContent: request.wikipediaContent,
        }),
      });

      if (accuracyResearchRes.ok) {
        const accuracyResearch = await accuracyResearchRes.json();
        task.factPack = accuracyResearch.factPack;
        task.researchBrief = accuracyResearch.researchBrief;
      }
    } catch (accuracyResearchErr) {
      console.warn("[AccuracyResearch] failed (non-fatal):", accuracyResearchErr);
    }
  }

  // ── Phase 0.7: Director Outline ──
  if (qualityLevel === "fine") {
    traceStart(task, "director");
    try {
      task.streamText = "正在规划叙事大纲...";
      notifyListeners(task);

      const outline = await generateNarrativeOutline(
        enhancedTopic,
        request.style,
        request.panelCount ?? undefined,
        request.llmConfig,
        request.contentType,
        task.topicResearch?.expandedDescription,
      );

      if (outline) {
        task.narrativeOutline = outline;
        console.log(`[Director] Outline generated: ${outline.totalPanels} panels, arc: ${outline.narrativeArc}`);
      }
      traceEnd(task, "director");
    } catch (dirErr) {
      traceEnd(task, "director", dirErr instanceof Error ? dirErr.message : "Director failed");
      console.warn("[Director] Outline generation failed (non-fatal):", dirErr);
    }
  } else {
    traceSkip(task, "director");
  }

  return {
    enhancedTopic,
    factPack: task.factPack,
    researchBrief: task.researchBrief,
    topicResearch: task.topicResearch,
    narrativeOutline: task.narrativeOutline,
  };
}
