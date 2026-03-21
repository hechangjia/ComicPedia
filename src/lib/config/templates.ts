import { ComicStyle, ContentType } from "@/lib/types";

/** 漫画模板定义 */
export interface ComicTemplate {
  id: string;
  name: string;
  description: string;
  contentType: ContentType;
  topic: string;
  style: ComicStyle;
  panelCount?: number;
  tags: string[];
  isBuiltIn: boolean;
}

/** 内置模板库 */
export const BUILT_IN_TEMPLATES: ComicTemplate[] = [
  // 科普类
  {
    id: "tpl_photosynthesis",
    name: "光合作用",
    description: "植物如何将阳光转化为能量",
    contentType: "science",
    topic: "光合作用是如何进行的？从阳光照射到叶片开始，详细解释整个过程",
    style: "flat",
    panelCount: 6,
    tags: ["生物", "植物"],
    isBuiltIn: true,
  },
  {
    id: "tpl_blackhole",
    name: "黑洞探秘",
    description: "了解宇宙中最神秘的天体",
    contentType: "science",
    topic: "黑洞是如何形成的？它的引力为什么连光都无法逃脱？",
    style: "flat",
    panelCount: 8,
    tags: ["天文", "物理"],
    isBuiltIn: true,
  },
  {
    id: "tpl_ai_learning",
    name: "AI 如何学习",
    description: "人工智能的学习原理",
    contentType: "science",
    topic: "人工智能是怎么学习的？用简单的例子解释机器学习的基本原理",
    style: "infographic",
    panelCount: 6,
    tags: ["科技", "AI"],
    isBuiltIn: true,
  },
  // 诗词类
  {
    id: "tpl_jingyesi",
    name: "静夜思",
    description: "李白的经典思乡诗",
    contentType: "poetry",
    topic: "床前明月光，疑是地上霜。举头望明月，低头思故乡。",
    style: "inkwash",
    panelCount: 4,
    tags: ["唐诗", "李白"],
    isBuiltIn: true,
  },
  {
    id: "tpl_qiusi",
    name: "天净沙·秋思",
    description: "马致远的秋日羁旅之叹",
    contentType: "poetry",
    topic: "枯藤老树昏鸦，小桥流水人家，古道西风瘦马。夕阳西下，断肠人在天涯。",
    style: "inkwash",
    panelCount: 5,
    tags: ["元曲", "马致远"],
    isBuiltIn: true,
  },
  // 小说类
  {
    id: "tpl_daiyuzanghua",
    name: "红楼梦·黛玉葬花",
    description: "林黛玉葬花的经典场景",
    contentType: "novel",
    topic: "林黛玉手把花锄，从芳径一直到沁芳桥那边去。忽听山坡上也传来悲声，却是宝玉。黛玉听了，不觉点头叹息。",
    style: "manga",
    panelCount: 6,
    tags: ["古典名著", "曹雪芹"],
    isBuiltIn: true,
  },
  {
    id: "tpl_xiaoqiangzhijiao",
    name: "天龙八部·萧峰聚贤庄",
    description: "萧峰在聚贤庄以一敌百",
    contentType: "novel",
    topic: "萧峰仰天长笑，声若惊雷。他左手一挥，一掌击出，正是降龙十八掌中的亢龙有悔。",
    style: "manga",
    panelCount: 8,
    tags: ["武侠", "金庸"],
    isBuiltIn: true,
  },
  // 小红书类
  {
    id: "tpl_camping",
    name: "新手露营指南",
    description: "露营必备装备清单",
    contentType: "xiaohongshu",
    topic: "新手露营必备装备清单：帐篷、睡袋、防潮垫、头灯、炊具五大类，附选购建议",
    style: "infographic",
    panelCount: 6,
    tags: ["生活", "户外"],
    isBuiltIn: true,
  },
  // 百科类 (Wikipedia)
  {
    id: "tpl_wiki_photosynthesis",
    name: "光合作用百科",
    description: "从 Wikipedia 权威内容生成光合作用科普漫画",
    contentType: "wikipedia",
    topic: "光合作用",
    style: "flat",
    panelCount: 8,
    tags: ["生物", "百科"],
    isBuiltIn: true,
  },
  {
    id: "tpl_wiki_dna",
    name: "DNA 百科漫画",
    description: "用漫画解读 DNA 的结构与功能",
    contentType: "wikipedia",
    topic: "DNA",
    style: "infographic",
    panelCount: 8,
    tags: ["生物", "分子"],
    isBuiltIn: true,
  },
  {
    id: "tpl_wiki_solarsystem",
    name: "太阳系探秘",
    description: "八大行星的百科漫画之旅",
    contentType: "wikipedia",
    topic: "太阳系",
    style: "cartoon",
    panelCount: 10,
    tags: ["天文", "百科"],
    isBuiltIn: true,
  },
  {
    id: "tpl_wiki_dinosaur",
    name: "恐龙时代",
    description: "从 Wikipedia 了解恐龙的兴衰",
    contentType: "wikipedia",
    topic: "恐龙",
    style: "cartoon",
    panelCount: 8,
    tags: ["古生物", "百科"],
    isBuiltIn: true,
  },
];

/**
 * 根据内容类型筛选模板（内置 + 自定义）。
 * contentType 为空时返回全部模板。
 */
export function getTemplatesByType(contentType?: ContentType): ComicTemplate[] {
  const custom = getCustomTemplates();
  const all = [...BUILT_IN_TEMPLATES, ...custom];
  if (!contentType) return all;
  return all.filter((t) => t.contentType === contentType);
}

// ============================================================
// 自定义模板（localStorage 持久化）
// ============================================================

const CUSTOM_TEMPLATES_KEY = "comicpedia-custom-templates";

/** 读取用户自定义模板 */
export function getCustomTemplates(): ComicTemplate[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(CUSTOM_TEMPLATES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/** 保存自定义模板 */
export function saveCustomTemplate(template: Omit<ComicTemplate, "id" | "isBuiltIn">): ComicTemplate {
  const newTemplate: ComicTemplate = {
    ...template,
    id: `custom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    isBuiltIn: false,
  };
  const existing = getCustomTemplates();
  existing.push(newTemplate);
  localStorage.setItem(CUSTOM_TEMPLATES_KEY, JSON.stringify(existing));
  return newTemplate;
}

/** 删除自定义模板 */
export function deleteCustomTemplate(id: string): void {
  const existing = getCustomTemplates().filter((t) => t.id !== id);
  localStorage.setItem(CUSTOM_TEMPLATES_KEY, JSON.stringify(existing));
}

/** 导出模板包（JSON） */
export function exportTemplatePack(templates: ComicTemplate[]): string {
  return JSON.stringify({
    version: 1,
    exportedAt: new Date().toISOString(),
    templates: templates.map(({ isBuiltIn, ...rest }) => rest),
  }, null, 2);
}

/** 导入模板包（JSON） */
export function importTemplatePack(json: string): ComicTemplate[] {
  const data = JSON.parse(json);
  if (!data.templates || !Array.isArray(data.templates)) {
    throw new Error("无效的模板包格式");
  }
  const existing = getCustomTemplates();
  const existingIds = new Set(existing.map((t) => t.id));
  const imported: ComicTemplate[] = [];

  for (const tpl of data.templates) {
    const newTemplate: ComicTemplate = {
      ...tpl,
      id: existingIds.has(tpl.id)
        ? `custom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
        : tpl.id,
      isBuiltIn: false,
    };
    imported.push(newTemplate);
    existing.push(newTemplate);
  }

  localStorage.setItem(CUSTOM_TEMPLATES_KEY, JSON.stringify(existing));
  return imported;
}
