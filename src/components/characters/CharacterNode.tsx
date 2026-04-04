"use client";

import React from "react";

interface CharacterNodeProps {
  name: string;
  avatarUrl?: string | null;
  highlighted: boolean;
  dimmed: boolean;
  onMouseDown?: (e: React.MouseEvent) => void;
}

const RADIUS = 40;

export function CharacterNode({
  name,
  avatarUrl,
  highlighted,
  dimmed,
  onMouseDown,
}: CharacterNodeProps) {
  const firstLetter = name.charAt(0).toUpperCase();
  const opacity = dimmed ? 0.25 : 1;

  return (
    <g
      style={{ opacity, cursor: "grab", transition: "opacity 0.2s" }}
      onMouseDown={onMouseDown}
    >
      {/* Highlight ring */}
      {highlighted && (
        <circle
          r={RADIUS + 4}
          fill="none"
          stroke="#6366f1"
          strokeWidth={3}
          strokeDasharray="6 3"
        />
      )}
      {/* Background circle */}
      <circle
        r={RADIUS}
        fill={highlighted ? "#4f46e5" : "#374151"}
        stroke={highlighted ? "#818cf8" : "#6b7280"}
        strokeWidth={2}
      />
      {/* Avatar or fallback letter */}
      {avatarUrl ? (
        <clipPath id={`clip-${name}`}>
          <circle r={RADIUS - 2} />
        </clipPath>
      ) : null}
      {avatarUrl ? (
        <image
          href={avatarUrl}
          x={-(RADIUS - 2)}
          y={-(RADIUS - 2)}
          width={(RADIUS - 2) * 2}
          height={(RADIUS - 2) * 2}
          clipPath={`url(#clip-${name})`}
          preserveAspectRatio="xMidYMid slice"
        />
      ) : (
        <text
          textAnchor="middle"
          dominantBaseline="central"
          fill="white"
          fontSize={28}
          fontWeight="bold"
          style={{ pointerEvents: "none", userSelect: "none" }}
        >
          {firstLetter}
        </text>
      )}
      {/* Name label */}
      <text
        y={RADIUS + 18}
        textAnchor="middle"
        fill="#d1d5db"
        fontSize={13}
        fontWeight={500}
        style={{ pointerEvents: "none", userSelect: "none" }}
      >
        {name}
      </text>
    </g>
  );
}

CharacterNode.RADIUS = RADIUS;
