"use client";

import Link from "next/link";
import { useRelations } from "@/hooks/useRelations";
import { RelationGraph } from "@/components/characters/RelationGraph";
import { Spinner } from "@/components/ui/Spinner";
import { ChevronLeft } from "lucide-react";


export default function CharacterRelationsPage() {
  const {
    characters,
    relations,
    loading,
    addRelation,
    updateRelation,
    deleteRelation,
  } = useRelations();

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
          />
        )}
      </div>
    </div>
  );
}
