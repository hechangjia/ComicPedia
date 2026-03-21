"use client";

import { ErrorSeverity } from "@/lib/errors";

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
  error: "bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400",
  warning: "bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400",
  info: "bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400",
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
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}
