"use client";

import { useState } from "react";
import { ComicScript } from "@/lib/types";
import { downloadShareCard, copyShareCardToClipboard, shareCardViaWebShare } from "@/lib/shareCard";
import { Spinner } from "@/components/ui/Spinner";

interface ShareCardButtonProps {
  script: ComicScript;
}

type ActionStatus = "idle" | "loading" | "success" | "error";

export function ShareCardButton({ script }: ShareCardButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [status, setStatus] = useState<ActionStatus>("idle");
  const [statusMsg, setStatusMsg] = useState("");
  const canShare = typeof navigator !== "undefined" && !!navigator.share;

  const handleAction = async (action: () => Promise<void>, successMsg: string) => {
    setStatus("loading");
    try {
      await action();
      setStatus("success");
      setStatusMsg(successMsg);
      setTimeout(() => { setStatus("idle"); setIsOpen(false); }, 1500);
    } catch (err) {
      setStatus("error");
      setStatusMsg(err instanceof Error ? err.message : "操作失败");
      setTimeout(() => setStatus("idle"), 3000);
    }
  };

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="px-3 py-2 text-sm border rounded-lg hover:bg-accent transition-colors flex items-center gap-1.5 min-h-[40px]"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        分享卡片
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-1 bg-card border rounded-lg shadow-lg p-1 min-w-[160px] z-20">
          {status === "loading" ? (
            <div className="px-3 py-2 flex items-center gap-2 text-sm">
              <Spinner size="sm" /> 生成中...
            </div>
          ) : status === "success" || status === "error" ? (
            <div className={`px-3 py-2 text-sm ${status === "success" ? "text-green-600" : "text-red-500"}`}>
              {statusMsg}
            </div>
          ) : (
            <>
              <button
                onClick={() => handleAction(() => downloadShareCard(script), "已保存")}
                className="w-full text-left px-3 py-2 text-sm hover:bg-accent rounded cursor-pointer flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                保存图片
              </button>
              <button
                onClick={() => handleAction(() => copyShareCardToClipboard(script), "已复制")}
                className="w-full text-left px-3 py-2 text-sm hover:bg-accent rounded cursor-pointer flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                </svg>
                复制到剪贴板
              </button>
              {canShare && (
                <button
                  onClick={() => handleAction(() => shareCardViaWebShare(script), "已分享")}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-accent rounded cursor-pointer flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                  </svg>
                  分享
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
