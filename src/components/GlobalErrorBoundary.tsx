"use client";

import React from "react";
import { AlertTriangle } from "lucide-react";

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

export class GlobalErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary] Uncaught error:", error, info.componentStack);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = "/";
  };

  handleDismiss = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[60vh] flex items-center justify-center p-8">
          <div className="max-w-md w-full space-y-6 text-center">
            <div className="w-16 h-16 mx-auto rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
              <AlertTriangle className="w-8 h-8 text-red-600 dark:text-red-400" />
            </div>

            <div className="space-y-2">
              <h2 className="text-lg font-semibold">页面出现异常</h2>
              <p className="text-sm text-muted-foreground">
                应用遇到了一个意外错误。你的数据已自动保存，不会丢失。
              </p>
            </div>

            {this.state.error && (
              <details className="text-left p-3 rounded-lg bg-muted/50 text-xs">
                <summary className="cursor-pointer text-muted-foreground font-medium">
                  错误详情
                </summary>
                <pre className="mt-2 whitespace-pre-wrap break-all text-muted-foreground">
                  {this.state.error.message}
                  {this.state.error.stack && (
                    <>
                      {"\n\n"}
                      {this.state.error.stack.split("\n").slice(0, 5).join("\n")}
                    </>
                  )}
                </pre>
              </details>
            )}

            <div className="flex gap-3 justify-center">
              <button
                onClick={this.handleDismiss}
                className="px-4 py-2 text-sm border rounded-lg hover:bg-accent transition-colors min-h-[40px]"
              >
                尝试恢复
              </button>
              <button
                onClick={this.handleReload}
                className="px-4 py-2 text-sm border rounded-lg hover:bg-accent transition-colors min-h-[40px]"
              >
                刷新页面
              </button>
              <button
                onClick={this.handleGoHome}
                className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity min-h-[40px]"
              >
                返回首页
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
