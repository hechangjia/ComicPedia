"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Globe, FlaskConical, ScrollText, BookOpen, Smartphone, ArrowRight, Sparkles } from "lucide-react";
import { getAllComics } from "@/lib/client/db";
import { GenerateTask, ComicPanel, ComicStyle } from "@/lib/types";
import { STYLE_DESCRIPTIONS } from "@/lib/config/styles";
import { formatDate } from "@/lib/utils";

const CONTENT_TYPES = [
  { href: "/create?mode=wikipedia", icon: Globe, label: "百科漫画", desc: "Wikipedia 优质科普", color: "text-[#3d8b84]", bg: "bg-[#e8f4f2] dark:bg-[#3d8b84]/10" },
  { href: "/create?mode=science", icon: FlaskConical, label: "科普漫画", desc: "自定义科学主题", color: "text-[#8b7eb5]", bg: "bg-[#f3f1f8] dark:bg-[#8b7eb5]/10" },
  { href: "/create?mode=poetry", icon: ScrollText, label: "诗词漫画", desc: "古诗词意境转化", color: "text-[#5b95b8]", bg: "bg-[#edf4f8] dark:bg-[#5b95b8]/10" },
  { href: "/create?mode=novel", icon: BookOpen, label: "小说漫画", desc: "经典场景分镜化", color: "text-[#b8943e]", bg: "bg-[#faf6ea] dark:bg-[#b8943e]/10" },
  { href: "/create?mode=xiaohongshu", icon: Smartphone, label: "小红书", desc: "图文内容生成", color: "text-[#c4756a]", bg: "bg-[#faf0ee] dark:bg-[#c4756a]/10" },
];

const styleNames: Record<string, string> = Object.fromEntries(
  (Object.keys(STYLE_DESCRIPTIONS) as ComicStyle[]).map((key) => [
    key,
    STYLE_DESCRIPTIONS[key].split("，")[0].replace(/风格$/, ""),
  ])
);

export default function HomePage() {
  const router = useRouter();
  const isShowcaseMode = process.env.NEXT_PUBLIC_SHOWCASE_MODE === "true";
  const [tasks, setTasks] = useState<GenerateTask[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isShowcaseMode) {
      router.replace("/gallery");
      return;
    }
    getAllComics(1, 20).then((result) => {
      setTasks(result.items);
      setLoading(false);
    }).catch((e) => {
      console.error("Failed to load comics:", e);
      setLoading(false);
    });
  }, [isShowcaseMode, router]);

  const completedTasks = useMemo(() =>
    tasks.filter((t) => t.status === "completed" && t.script?.panels.some(
      (p) => p.status === "completed" && p.imageUrl && !p.imageUrl.startsWith("data:text/plain")
    )),
    [tasks]
  );

  const recentWorks = completedTasks.slice(0, 3);

  const stats = useMemo(() => {
    const totalPanels = completedTasks.reduce((sum, t) =>
      sum + (t.script?.panels.filter(p => p.status === "completed" && p.imageUrl).length ?? 0), 0
    );
    const styleCounts: Record<string, number> = {};
    completedTasks.forEach((t) => {
      const s = t.script?.style;
      if (s) styleCounts[s] = (styleCounts[s] || 0) + 1;
    });
    const topStyle = Object.entries(styleCounts).sort((a, b) => b[1] - a[1])[0];
    return { total: completedTasks.length, panels: totalPanels, topStyle: topStyle ? (styleNames[topStyle[0]] || topStyle[0]) : null };
  }, [completedTasks]);

  if (isShowcaseMode) return null;

  const getValidPanels = (task: GenerateTask): ComicPanel[] =>
    task.script?.panels.filter(p => p.status === "completed" && p.imageUrl && !p.imageUrl.startsWith("data:text/plain")) ?? [];

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Hero */}
      <div className="relative rounded-[20px] p-8 sm:p-10 overflow-hidden border border-[#ece8e0] dark:border-[#302d29]">
        <div className="dark:hidden absolute inset-0" style={{
          background: "radial-gradient(ellipse at 20% 80%, #e8f4f2 0%, transparent 60%), radial-gradient(ellipse at 80% 20%, #faf0ee 0%, transparent 60%), radial-gradient(ellipse at 50% 50%, #faf6ea 0%, transparent 70%), #fdfcf9",
        }} />
        <div className="hidden dark:block absolute inset-0" style={{
          background: "radial-gradient(ellipse at 20% 80%, rgba(61,139,132,0.08) 0%, transparent 60%), radial-gradient(ellipse at 80% 20%, rgba(196,117,106,0.06) 0%, transparent 60%), radial-gradient(ellipse at 50% 50%, rgba(184,148,62,0.05) 0%, transparent 70%), #1e1b18",
        }} />
        <div className="relative">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mb-2">
            把知识变成<span className="text-[#3d8b84] dark:text-[#5cb8ae]">漫画</span>
          </h1>
          <p className="text-[#6b6560] dark:text-[#9e9890] text-sm sm:text-base mb-5 max-w-lg">
            输入科普主题、古诗词或小说片段，AI 帮你生成分镜漫画。支持 12 种画面风格。
          </p>
          <div className="flex gap-3">
            <Link href="/create" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-[10px] bg-[#3d8b84] hover:bg-[#2d7069] text-white text-sm font-semibold shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
              <Sparkles className="w-4 h-4" />
              开始创作
            </Link>
            <Link href="/gallery" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-[10px] bg-white dark:bg-[#221f1c] border border-[#e2ddd4] dark:border-[#3a3632] text-sm font-semibold shadow-sm hover:bg-[#f5f3f0] dark:hover:bg-[#2a2724] transition-all">
              浏览作品库
            </Link>
          </div>
        </div>
      </div>

      {/* Quick create */}
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-[#a09a93] mb-3">选择创作方向</h2>
        <div className="flex gap-3 overflow-x-auto pb-1">
          {CONTENT_TYPES.map((ct) => (
            <Link key={ct.href} href={ct.href}
              className="flex-shrink-0 w-[140px] flex flex-col gap-2 p-4 bg-white dark:bg-[#221f1c] border border-[#ece8e0] dark:border-[#302d29] rounded-[14px] shadow-sm hover:border-[#3d8b84] hover:shadow-md hover:-translate-y-0.5 transition-all"
            >
              <div className={`w-9 h-9 rounded-[10px] ${ct.bg} ${ct.color} flex items-center justify-center`}>
                <ct.icon className="w-[18px] h-[18px]" />
              </div>
              <div className="font-semibold text-[13px]">{ct.label}</div>
              <div className="text-[10.5px] text-[#a09a93] leading-snug">{ct.desc}</div>
            </Link>
          ))}
        </div>
      </div>

      {/* Stats */}
      {stats.total > 0 && (
        <div className="flex gap-6 px-5 py-3.5 bg-white dark:bg-[#221f1c] border border-[#ece8e0] dark:border-[#302d29] rounded-[14px] shadow-sm">
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl font-bold tabular-nums text-[#3d8b84] dark:text-[#5cb8ae]">{stats.total}</span>
            <span className="text-[11.5px] text-[#a09a93]">部作品</span>
          </div>
          <div className="w-px bg-[#e2ddd4] dark:bg-[#3a3632]" />
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl font-bold tabular-nums">{stats.panels}</span>
            <span className="text-[11.5px] text-[#a09a93]">张面板</span>
          </div>
          {stats.topStyle && (
            <>
              <div className="w-px bg-[#e2ddd4] dark:bg-[#3a3632]" />
              <div className="flex items-baseline gap-1.5">
                <span className="text-xl font-bold">{stats.topStyle}</span>
                <span className="text-[11.5px] text-[#a09a93]">最爱风格</span>
              </div>
            </>
          )}
        </div>
      )}

      {/* Recent works */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[0,1,2].map(i => (
            <div key={i} className="bg-white dark:bg-[#221f1c] rounded-[14px] border border-[#ece8e0] dark:border-[#302d29] overflow-hidden animate-pulse">
              <div className="h-36 bg-[#f0ede5] dark:bg-[#2a2724]" />
              <div className="p-4 space-y-2">
                <div className="h-4 bg-[#f0ede5] dark:bg-[#2a2724] rounded w-2/3" />
                <div className="h-3 bg-[#f0ede5] dark:bg-[#2a2724] rounded w-1/3" />
              </div>
            </div>
          ))}
        </div>
      ) : recentWorks.length > 0 ? (
        <div>
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-[15px] font-semibold">最近作品</h2>
            <Link href="/gallery" className="text-[12px] text-[#3d8b84] dark:text-[#5cb8ae] font-medium hover:underline flex items-center gap-1">
              查看全部 <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {recentWorks.map((task) => {
              const panels = getValidPanels(task);
              const firstPanel = panels[0];
              return (
                <Link key={task.id} href={`/result/${task.id}`}
                  className="group bg-white dark:bg-[#221f1c] rounded-[14px] border border-[#ece8e0] dark:border-[#302d29] overflow-hidden shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 cursor-pointer"
                >
                  <div className="h-36 overflow-hidden bg-[#f0ede5] dark:bg-[#2a2724]">
                    {firstPanel?.imageUrl ? (
                      <img src={firstPanel.imageUrl} alt={task.script?.title || ""} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[#a09a93]">
                        <Sparkles className="w-8 h-8 opacity-30" />
                      </div>
                    )}
                  </div>
                  <div className="p-3.5">
                    <div className="font-semibold text-[14px] truncate mb-1.5">{task.script?.title || "无标题"}</div>
                    <div className="flex items-center gap-2 text-[11.5px] text-[#a09a93]">
                      {task.script?.style && (
                        <span className="px-2 py-0.5 rounded-[6px] bg-[#e8f4f2] dark:bg-[#3d8b84]/10 text-[#3d8b84] dark:text-[#5cb8ae] text-[10px] font-semibold">
                          {styleNames[task.script.style] || task.script.style}
                        </span>
                      )}
                      <span>{panels.length} 格</span>
                      <span>{formatDate(task.createdAt)}</span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="text-center py-16">
          <div className="w-16 h-16 mx-auto rounded-full bg-[#f0ede5] dark:bg-[#2a2724] flex items-center justify-center mb-4">
            <Sparkles className="w-7 h-7 text-[#a09a93]" />
          </div>
          <p className="text-[#6b6560] dark:text-[#9e9890] text-sm mb-4">还没有作品，创作第一个漫画吧</p>
          <Link href="/create" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-[10px] bg-[#3d8b84] hover:bg-[#2d7069] text-white text-sm font-semibold shadow-sm transition-all">
            <Sparkles className="w-4 h-4" />
            开始创作
          </Link>
        </div>
      )}
    </div>
  );
}
