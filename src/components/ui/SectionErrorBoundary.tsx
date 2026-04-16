"use client";

import React from "react";
import { AlertTriangle } from "lucide-react";

interface SectionErrorBoundaryProps {
  children: React.ReactNode;
  /** 区域名称，显示在错误提示中 */
  name?: string;
}

interface SectionErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

/**
 * 局部 ErrorBoundary — 用于页面内独立区域（如面板网格、质量评分、灯箱等），
 * 防止单个区域的渲染错误导致整页白屏。
 */
export class SectionErrorBoundary extends React.Component<
  SectionErrorBoundaryProps,
  SectionErrorBoundaryState
> {
  constructor(props: SectionErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): SectionErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[SectionErrorBoundary${this.props.name ? `: ${this.props.name}` : ""}]`, error, info.componentStack);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-xl border border-error/20 bg-error/5 p-6 text-center space-y-3">
          <div className="flex items-center justify-center gap-2 text-error">
            <AlertTriangle className="w-4 h-4" />
            <span className="text-sm font-medium">
              {this.props.name ? `${this.props.name}加载失败` : "此区域加载失败"}
            </span>
          </div>
          {this.state.error && (
            <p className="text-xs text-muted-foreground truncate max-w-md mx-auto">
              {this.state.error.message}
            </p>
          )}
          <button
            onClick={this.handleRetry}
            className="px-3 py-1.5 text-xs border rounded-lg hover:bg-accent transition-colors"
          >
            重试
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
