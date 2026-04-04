"use client";

import React from "react";
import type { RelationType } from "@/lib/types";

const TYPE_COLORS: Record<RelationType, string> = {
  friend: "#3b82f6",
  rival: "#ef4444",
  mentor: "#eab308",
  lover: "#ec4899",
  family: "#22c55e",
  ally: "#14b8a6",
  enemy: "#991b1b",
};

const TYPE_LABELS: Record<RelationType, string> = {
  friend: "朋友",
  rival: "对手",
  mentor: "导师",
  lover: "恋人",
  family: "家人",
  ally: "盟友",
  enemy: "敌人",
};

interface RelationEdgeProps {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  type: RelationType;
  label?: string;
  strength: number;
  highlighted: boolean;
  dimmed: boolean;
  onClick?: () => void;
}

export function RelationEdge({
  x1,
  y1,
  x2,
  y2,
  type,
  label,
  strength,
  highlighted,
  dimmed,
  onClick,
}: RelationEdgeProps) {
  const color = TYPE_COLORS[type] ?? "#6b7280";
  const width = 1 + strength * 4;
  const opacity = dimmed ? 0.12 : highlighted ? 1 : 0.7;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const displayLabel = label || TYPE_LABELS[type] || type;

  return (
    <g
      style={{ cursor: "pointer", transition: "opacity 0.2s" }}
      onClick={onClick}
    >
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={color}
        strokeWidth={highlighted ? width + 2 : width}
        strokeOpacity={opacity}
        strokeLinecap="round"
      />
      {/* Invisible wider line for easier click target */}
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke="transparent"
        strokeWidth={Math.max(width + 10, 16)}
      />
      {/* Midpoint label */}
      <rect
        x={mx - displayLabel.length * 6}
        y={my - 10}
        width={displayLabel.length * 12}
        height={20}
        rx={4}
        fill="#1f2937"
        fillOpacity={dimmed ? 0.3 : 0.85}
      />
      <text
        x={mx}
        y={my}
        textAnchor="middle"
        dominantBaseline="central"
        fill={color}
        fontSize={11}
        fontWeight={600}
        style={{ pointerEvents: "none", userSelect: "none", opacity }}
      >
        {displayLabel}
      </text>
    </g>
  );
}

export { TYPE_COLORS, TYPE_LABELS };
