"use client";

import { ErrorSeverity } from "@/lib/errors";
import { X } from "lucide-react";

interface ErrorAlertProps {
  /** 消息内容 */
  message: string;
  /** 严重级别 */
  severity?: ErrorSeverity;
  /** 关闭回调（提供则显示关闭按钮） */
  onClose?: () => void;
  /** 重试回调（提供则显示重试按钮） */
  onRetry?: () => void;
  /** 额外 className */
  className?: string;
}

const SEVERITY_STYLES: Record<ErrorSeverity, string> = {
  error: "bg-error/5 text-error bg-error/10 text-error",
  warning: "bg-warning/5 text-warning",
  info: "bg-info/5 text-info bg-info/10 text-info",
};

/**
 * 统一错误/警告/信息提示组件。
 * 替代各 Form 和页面中的内联 error div。
 */
export function ErrorAlert({
  message,
  severity = "error",
  onClose,
  onRetry,
  className = "",
}: ErrorAlertProps) {
  if (!message) return null;

  return (
    <div className={`p-3 rounded-lg text-sm flex items-start gap-2 ${SEVERITY_STYLES[severity]} ${className}`}>
      <span className="flex-1">{message}</span>
      {onRetry && (
        <button
          onClick={onRetry}
          className="shrink-0 underline underline-offset-2 hover:opacity-70 transition-opacity text-xs font-medium"
        >
          重试
        </button>
      )}
      {onClose && (
        <button
          onClick={onClose}
          className="shrink-0 hover:opacity-70 transition-opacity"
          aria-label="关闭"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
