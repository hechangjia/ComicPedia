import { CharacterArc, CharacterPersonality, ComicStyle, ContentType } from "./types";

// ============================================================
// 连载模式数据模型
// 一个 Series 包含多个有序的 Episode（每个 Episode 对应一个 GenerateTask）
// ============================================================

/** 连载系列 */
export interface Series {
  id: string;
  /** 系列标题 */
  title: string;
  /** 系列描述 */
  description: string;
  /** 内容类型 */
  contentType: ContentType;
  /** 画面风格（系列级统一） */
  style: ComicStyle;
  /** 角色描述（跨集保持一致） */
  characterDescription?: string;
  /** 角色 ID 列表（跨集复用） */
  characterIds?: string[];
  /** 随机种子（跨集保持一致，确保画面风格统一） */
  seed?: number;
  /** 集数列表（有序，taskId 引用） */
  episodes: SeriesEpisode[];
  /** 封面图（取第一集第一格） */
  coverUrl?: string;
  createdAt: string;
  updatedAt: string;
}

/** 连载中的单集 */
export interface SeriesEpisode {
  /** 对应的 GenerateTask ID */
  taskId: string;
  /** 集标题 */
  title: string;
  /** 集序号（从 1 开始） */
  episodeNumber: number;
  /** 状态 */
  status: "draft" | "completed";
}

/** 创建新连载系列 */
export function createSeries(
  title: string,
  contentType: ContentType,
  style: ComicStyle,
  description: string = "",
): Series {
  const now = new Date().toISOString();
  return {
    id: `series_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    title,
    description,
    contentType,
    style,
    seed: Math.floor(Math.random() * 2147483647),
    episodes: [],
    createdAt: now,
    updatedAt: now,
  };
}

/** 向连载中添加一集 */
export function addEpisode(
  series: Series,
  taskId: string,
  title: string,
): Series {
  return {
    ...series,
    episodes: [
      ...series.episodes,
      {
        taskId,
        title,
        episodeNumber: series.episodes.length + 1,
        status: "draft",
      },
    ],
    updatedAt: new Date().toISOString(),
  };
}

/** 更新系列封面（使用第一集第一格的图片） */
export function updateSeriesCover(series: Series, coverUrl: string): Series {
  return {
    ...series,
    coverUrl,
    updatedAt: new Date().toISOString(),
  };
}

/** 获取连载上下文，用于新集的 prompt 构建（自动续写） */
export function getSeriesContinuationContext(series: Series, previousEnding?: string): string {
  const parts: string[] = [];
  parts.push(`This is episode ${series.episodes.length + 1} of the series "${series.title}".`);
  if (series.description) {
    parts.push(`Series overview: ${series.description}`);
  }
  if (series.characterDescription) {
    parts.push(`Recurring characters: ${series.characterDescription}`);
  }
  if (previousEnding) {
    parts.push(`Previous episode ended with: ${previousEnding}`);
    parts.push("Continue the story naturally from this point.");
  }
  return parts.join("\n");
}

/** Update a character's arc after a story event in a series episode */
export function updateCharacterArc(
  personality: CharacterPersonality,
  seriesId: string,
  episodeNumber: number,
  event: string,
  stateAfter: string,
): CharacterPersonality {
  const arc: CharacterArc = personality.arc ?? {
    seriesId,
    startState: personality.emotionalState?.primary ?? "neutral",
    turningPoints: [],
  };
  return {
    ...personality,
    arc: {
      ...arc,
      currentState: stateAfter,
      turningPoints: [...arc.turningPoints, { episodeNumber, event, stateAfter }],
    },
  };
}

/** Produce a human-readable summary of a character arc */
export function getArcSummary(arc: CharacterArc): string {
  const parts = [`Started as "${arc.startState}"`];
  for (const tp of arc.turningPoints) {
    parts.push(`Episode ${tp.episodeNumber}: ${tp.event} → "${tp.stateAfter}"`);
  }
  if (arc.currentState) parts.push(`Currently: "${arc.currentState}"`);
  return parts.join(". ");
}
