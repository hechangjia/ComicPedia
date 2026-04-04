"use client";

import { useState } from "react";
import { ComicScript } from "@/lib/types";
import { downloadShareCard, copyShareCardToClipboard, shareCardViaWebShare } from "@/lib/shareCard";
import { Spinner } from "@/components/ui/Spinner";
import { Camera, ClipboardCopy, Download, Share2 } from "lucide-react";


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
        <Camera className="w-4 h-4" />
        分享卡片
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-1 bg-card border rounded-lg shadow-lg p-1 min-w-[160px] z-20">
          {status === "loading" ? (
            <div className="px-3 py-2 flex items-center gap-2 text-sm">
              <Spinner size="sm" /> 生成中...
            </div>
          ) : status === "success" || status === "error" ? (
            <div className={`px-3 py-2 text-sm ${status === "success" ? "text-success" : "text-error"}`}>
              {statusMsg}
            </div>
          ) : (
            <>
              <button
                onClick={() => handleAction(() => downloadShareCard(script), "已保存")}
                className="w-full text-left px-3 py-2 text-sm hover:bg-accent rounded cursor-pointer flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                保存图片
              </button>
              <button
                onClick={() => handleAction(() => copyShareCardToClipboard(script), "已复制")}
                className="w-full text-left px-3 py-2 text-sm hover:bg-accent rounded cursor-pointer flex items-center gap-2"
              >
                <ClipboardCopy className="w-4 h-4" />
                复制到剪贴板
              </button>
              {canShare && (
                <button
                  onClick={() => handleAction(() => shareCardViaWebShare(script), "已分享")}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-accent rounded cursor-pointer flex items-center gap-2"
                >
                  <Share2 className="w-4 h-4" />
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
