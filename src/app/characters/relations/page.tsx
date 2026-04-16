"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useRelations } from "@/hooks/useRelations";
import { Spinner } from "@/components/ui/Spinner";

const RelationGraph = dynamic(() =>
  import("@/components/characters/RelationGraph").then((m) => ({ default: m.RelationGraph })),
  { loading: () => <div className="h-[500px] flex items-center justify-center"><Spinner /></div> }
);
import { EpisodeProposalModal } from "@/components/characters/EpisodeProposalModal";
import { useToast } from "@/components/ui/Toast";
import { getStoredConfigs, getStoredRequestConfigs } from "@/hooks/useAPIConfig";
import { ChevronLeft } from "lucide-react";
import type { CharacterRelation, RelationType, ComicStyle, ContentType } from "@/lib/types";
import { startGeneration } from "@/lib/client/generator";


export default function CharacterRelationsPage() {
  const {
    characters,
    relations,
    loading,
    addRelation,
    updateRelation,
    deleteRelation,
  } = useRelations();

  const router = useRouter();
  const { toast } = useToast();

  // Episode proposal state
  const [proposalData, setProposalData] = useState<{
    relation: CharacterRelation;
    oldType: RelationType;
    newType: RelationType;
  } | null>(null);

  const handleRelationTypeChanged = useCallback(
    (rel: CharacterRelation, oldType: RelationType, newType: RelationType) => {
      setProposalData({ relation: rel, oldType, newType });
    },
    [],
  );

  const handleProposalConfirm = useCallback(
    async (seriesId: string, topic: string, contentType: ContentType, style: ComicStyle) => {
      const characterIds = characters
        .filter(c => c.id === proposalData?.relation.fromId || c.id === proposalData?.relation.toId)
        .map(c => c.id);

      try {
        const storedConfigs = getStoredConfigs();
        const { llmConfig, imageConfig } = getStoredRequestConfigs(
          storedConfigs.activeLLMId ?? undefined,
          storedConfigs.activeImageId ?? undefined,
        );
        if (!llmConfig || !storedConfigs.activeLLMId) {
          throw new Error("请先在设置中配置 LLM");
        }
        const taskId = await startGeneration({
          topic,
          style,
          contentType,
          characterIds,
          seriesId,
          llmConfigId: storedConfigs.activeLLMId,
          imageConfigId: storedConfigs.activeImageId ?? undefined,
          llmConfig,
          imageConfig,
        });
        setProposalData(null);
        toast("success", "剧集生成已启动，正在跳转...");
        router.push(`/result/${taskId}`);
      } catch (err) {
        console.error("Failed to start episode generation:", err);
        toast("error", err instanceof Error ? err.message : "剧集生成启动失败，请稍后重试");
      }
    },
    [characters, proposalData, router, toast],
  );

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-4 px-4 py-3 border-b bg-card/80 backdrop-blur">
        <Link
          href="/characters"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="w-4 h-4" />
          角色库
        </Link>
        <h1 className="text-lg font-bold">角色关系图</h1>
        <span className="text-sm text-muted-foreground">
          {characters.length} 个角色 / {relations.length} 条关系
        </span>
      </div>

      {/* Graph */}
      <div className="flex-1 relative">
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <Spinner size="lg" />
          </div>
        ) : (
          <RelationGraph
            characters={characters}
            relations={relations}
            onAddRelation={addRelation}
            onDeleteRelation={deleteRelation}
            onUpdateRelation={updateRelation}
            onRelationTypeChanged={handleRelationTypeChanged}
          />
        )}
      </div>

      {/* Episode Proposal Modal */}
      {proposalData && (
        <EpisodeProposalModal
          relation={proposalData.relation}
          oldType={proposalData.oldType}
          newType={proposalData.newType}
          characters={characters}
          onConfirm={handleProposalConfirm}
          onClose={() => setProposalData(null)}
        />
      )}
    </div>
  );
}
