"use client";

import React, { useRef, useEffect, useState, useCallback, useMemo } from "react";
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from "d3-force";
import { select } from "d3-selection";
import { zoom, zoomIdentity, type ZoomTransform } from "d3-zoom";
import type { Character, CharacterRelation, RelationType } from "@/lib/types";
import { CharacterNode } from "./CharacterNode";
import { RelationEdge, TYPE_COLORS, TYPE_LABELS } from "./RelationEdge";
import { RelationDetailPanel } from "./RelationDetailPanel";
import {
  RelationTimelineSlider,
  filterRelationsAtEpisode,
} from "./RelationTimelineSlider";

// ---- Types ----

interface GraphNode extends SimulationNodeDatum {
  id: string;
  character: Character;
}

interface GraphLink extends SimulationLinkDatum<GraphNode> {
  relation: CharacterRelation;
}

interface RelationGraphProps {
  characters: Character[];
  relations: CharacterRelation[];
  onAddRelation: (rel: Partial<CharacterRelation>) => Promise<CharacterRelation>;
  onDeleteRelation: (id: string) => Promise<void>;
  onUpdateRelation: (id: string, patch: Partial<CharacterRelation>) => Promise<CharacterRelation>;
}

const ALL_TYPES: RelationType[] = ["friend", "rival", "mentor", "lover", "family", "ally", "enemy"];
const NODE_RADIUS = 40;

export function RelationGraph({
  characters,
  relations,
  onAddRelation,
  onDeleteRelation,
  onUpdateRelation,
}: RelationGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const simRef = useRef<ReturnType<typeof forceSimulation<GraphNode>> | null>(null);

  const [transform, setTransform] = useState<ZoomTransform>(zoomIdentity);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedRelation, setSelectedRelation] = useState<CharacterRelation | null>(null);
  const [enabledTypes, setEnabledTypes] = useState<Set<RelationType>>(new Set(ALL_TYPES));
  const [addMode, setAddMode] = useState(false);
  const [addFirst, setAddFirst] = useState<string | null>(null);
  const [currentEpisode, setCurrentEpisode] = useState(1);

  // Compute max episode from all relation evolution events
  const maxEpisode = Math.max(
    1,
    ...relations.flatMap((r) => r.evolution.map((e) => e.episodeNumber)),
  );

  // Keep currentEpisode in sync when maxEpisode changes
  useEffect(() => {
    setCurrentEpisode(maxEpisode);
  }, [maxEpisode]);

  // Apply timeline filter (M3: memoized)
  const timelineRelations = useMemo(
    () => filterRelationsAtEpisode(relations, currentEpisode),
    [relations, currentEpisode],
  );

  // Use refs for nodes/links to avoid recreating simulation on every change
  const nodesRef = useRef<GraphNode[]>([]);
  const linksRef = useRef<GraphLink[]>([]);
  const [, forceRender] = useState(0);
  const rafRef = useRef<number | null>(null);

  const scheduleRender = useCallback(() => {
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      forceRender((v) => v + 1);
    });
  }, []);

  // Expose current nodes/links for rendering via refs
  const nodes = nodesRef.current;
  const links = linksRef.current;

  // Build nodes & links when data changes — update in-place
  useEffect(() => {
    const prevMap = new Map<string, GraphNode>();
    for (const n of nodesRef.current) prevMap.set(n.id, n);

    const nodeMap = new Map<string, GraphNode>();
    characters.forEach((c) => {
      const prev = prevMap.get(c.id);
      nodeMap.set(c.id, prev
        ? Object.assign(prev, { character: c })
        : { id: c.id, character: c, x: undefined, y: undefined, vx: undefined, vy: undefined }
      );
    });

    const graphNodes = Array.from(nodeMap.values());
    const graphLinks: GraphLink[] = timelineRelations
      .filter((r) => nodeMap.has(r.fromId) && nodeMap.has(r.toId))
      .map((r) => ({
        source: nodeMap.get(r.fromId)!,
        target: nodeMap.get(r.toId)!,
        relation: r,
      }));

    nodesRef.current = graphNodes;
    linksRef.current = graphLinks;

    // Update existing simulation in-place if possible
    const sim = simRef.current;
    if (sim && graphNodes.length > 0) {
      sim.nodes(graphNodes);
      const linkForce = sim.force("link") as ReturnType<typeof forceLink<GraphNode, GraphLink>> | undefined;
      if (linkForce) linkForce.links(graphLinks);
      sim.alpha(0.3).restart();
    }

    scheduleRender();
  }, [characters, timelineRelations, scheduleRender]);

  // Setup simulation once
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const { width, height } = svg.getBoundingClientRect();

    const sim = forceSimulation<GraphNode>(nodesRef.current)
      .force(
        "link",
        forceLink<GraphNode, GraphLink>(linksRef.current)
          .id((d) => d.id)
          .distance(180),
      )
      .force("charge", forceManyBody().strength(-300))
      .force("center", forceCenter(width / 2, height / 2))
      .force("collide", forceCollide(NODE_RADIUS + 20))
      .alphaDecay(0.02)
      .on("tick", scheduleRender);

    simRef.current = sim;
    return () => {
      sim.stop();
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheduleRender]);

  // Setup zoom
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const zoomBehavior = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 4])
      .on("zoom", (event) => setTransform(event.transform));

    select(svg).call(zoomBehavior);

    return () => { select(svg).on(".zoom", null); };
  }, []);

  // Node drag — single stable handler (H3: no closure per node per render)
  const dragNode = useRef<GraphNode | null>(null);
  const handleNodeMouseDown = useCallback(
    (e: React.MouseEvent, nodeId: string) => {
      e.stopPropagation();
      const node = nodesRef.current.find((n) => n.id === nodeId);
      if (!node) return;

      if (addMode) {
        if (!addFirst) {
          setAddFirst(nodeId);
        } else if (addFirst !== nodeId) {
          onAddRelation({ fromId: addFirst, toId: nodeId, type: "friend" });
          setAddFirst(null);
          setAddMode(false);
        }
        return;
      }

      // Toggle selection
      setSelectedNodeId((prev) => (prev === nodeId ? null : nodeId));
      setSelectedRelation(null);

      // Start drag
      dragNode.current = node;
      node.fx = node.x;
      node.fy = node.y;
      simRef.current?.alphaTarget(0.3).restart();

      const onMove = (ev: MouseEvent) => {
        if (!dragNode.current) return;
        dragNode.current.fx = (ev.clientX - transform.x) / transform.k;
        dragNode.current.fy = (ev.clientY - transform.y) / transform.k;
      };
      const onUp = () => {
        if (dragNode.current) {
          dragNode.current.fx = null;
          dragNode.current.fy = null;
          dragNode.current = null;
          simRef.current?.alphaTarget(0);
        }
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [addMode, addFirst, onAddRelation, transform],
  );

  // Filter links by enabled types
  const visibleLinks = links.filter((l) => enabledTypes.has(l.relation.type));

  // Determine highlight/dim
  const connectedIds = new Set<string>();
  if (selectedNodeId) {
    visibleLinks.forEach((l) => {
      const sId = typeof l.source === "object" ? (l.source as GraphNode).id : l.source;
      const tId = typeof l.target === "object" ? (l.target as GraphNode).id : l.target;
      if (sId === selectedNodeId || tId === selectedNodeId) {
        connectedIds.add(sId as string);
        connectedIds.add(tId as string);
      }
    });
  }

  const isEdgeHighlighted = (l: GraphLink) => {
    if (!selectedNodeId) return false;
    const sId = typeof l.source === "object" ? (l.source as GraphNode).id : l.source;
    const tId = typeof l.target === "object" ? (l.target as GraphNode).id : l.target;
    return sId === selectedNodeId || tId === selectedNodeId;
  };

  const handleEdgeClick = (rel: CharacterRelation) => {
    setSelectedRelation(rel);
    setSelectedNodeId(null);
  };

  const handleSaveRelation = async (patch: Partial<CharacterRelation>) => {
    if (!selectedRelation) return;
    await onUpdateRelation(selectedRelation.id, patch);
    setSelectedRelation(null);
  };

  const handleDeleteRelation = async () => {
    if (!selectedRelation) return;
    if (!confirm("确定删除该关系？")) return;
    await onDeleteRelation(selectedRelation.id);
    setSelectedRelation(null);
  };

  return (
    <div className="relative w-full h-full">
      {/* Top filter bar */}
      <div className="absolute top-3 left-3 right-3 z-10 flex flex-wrap items-center gap-2 pointer-events-none">
        <div className="flex flex-wrap gap-1.5 pointer-events-auto bg-card/80 backdrop-blur rounded-lg p-2 border shadow-sm">
          {ALL_TYPES.map((t) => {
            const active = enabledTypes.has(t);
            return (
              <button
                key={t}
                onClick={() => {
                  setEnabledTypes((prev) => {
                    const next = new Set(prev);
                    if (next.has(t)) next.delete(t);
                    else next.add(t);
                    return next;
                  });
                }}
                className="px-2 py-1 text-xs rounded-md border transition-all"
                style={{
                  borderColor: active ? TYPE_COLORS[t] : "transparent",
                  color: active ? TYPE_COLORS[t] : "#9ca3af",
                  backgroundColor: active ? `${TYPE_COLORS[t]}15` : "transparent",
                }}
              >
                {TYPE_LABELS[t]}
              </button>
            );
          })}
        </div>

        <button
          onClick={() => { setAddMode(!addMode); setAddFirst(null); }}
          className={`pointer-events-auto px-3 py-1.5 text-xs rounded-lg border transition-all flex items-center gap-1 ${
            addMode
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-card/80 backdrop-blur hover:bg-accent border shadow-sm"
          }`}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {addMode
            ? addFirst
              ? "点击第二个角色"
              : "点击第一个角色"
            : "添加关系"}
        </button>
      </div>

      {/* SVG canvas */}
      <svg
        ref={svgRef}
        className="w-full h-full bg-background"
        style={{ cursor: addMode ? "crosshair" : "default" }}
        onClick={() => {
          if (!addMode) {
            setSelectedNodeId(null);
            setSelectedRelation(null);
          }
        }}
      >
        <g transform={`translate(${transform.x},${transform.y}) scale(${transform.k})`}>
          {/* Edges */}
          {visibleLinks.map((l) => {
            const s = l.source as GraphNode;
            const t = l.target as GraphNode;
            if (s.x == null || s.y == null || t.x == null || t.y == null) return null;
            const hl = isEdgeHighlighted(l);
            return (
              <RelationEdge
                key={l.relation.id}
                x1={s.x}
                y1={s.y}
                x2={t.x}
                y2={t.y}
                type={l.relation.type}
                label={l.relation.label}
                strength={l.relation.strength}
                highlighted={hl}
                dimmed={!!selectedNodeId && !hl}
                onClick={() => handleEdgeClick(l.relation)}
              />
            );
          })}

          {/* Nodes */}
          {nodes.map((node) => {
            const isConnected = connectedIds.has(node.id);
            const isSelected = node.id === selectedNodeId;
            const dimmed = !!selectedNodeId && !isSelected && !isConnected;
            return (
              <g
                key={node.id}
                transform={`translate(${node.x ?? 0},${node.y ?? 0})`}
              >
                <CharacterNode
                  name={node.character.name}
                  avatarUrl={node.character.avatarUrl}
                  highlighted={isSelected || (addMode && addFirst === node.id)}
                  dimmed={dimmed}
                  onMouseDown={(e: React.MouseEvent) => handleNodeMouseDown(e, node.id)}
                />
              </g>
            );
          })}
        </g>
      </svg>

      {/* Timeline slider */}
      <div className="absolute bottom-16 left-3 right-3 z-10">
        <RelationTimelineSlider
          maxEpisode={maxEpisode}
          currentEpisode={currentEpisode}
          onChange={setCurrentEpisode}
        />
      </div>

      {/* Detail panel */}
      {selectedRelation && (
        <RelationDetailPanel
          relation={selectedRelation}
          characters={characters}
          onSave={handleSaveRelation}
          onDelete={handleDeleteRelation}
          onClose={() => setSelectedRelation(null)}
        />
      )}

      {/* Empty state */}
      {characters.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center space-y-2">
            <p className="text-muted-foreground">角色库为空</p>
            <p className="text-sm text-muted-foreground">请先创建角色</p>
          </div>
        </div>
      )}

      {characters.length > 0 && relations.length === 0 && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-card/90 backdrop-blur rounded-lg px-4 py-2 border shadow-sm text-sm text-muted-foreground">
          点击「添加关系」按钮，然后依次点击两个角色节点来建立关系
        </div>
      )}
    </div>
  );
}
