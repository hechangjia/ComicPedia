import { UserImageConfig } from "@/lib/types";
import { TestResult } from "@/lib/api/connectionTest";

interface ImageConfigCardProps {
  config: UserImageConfig;
  isActive: boolean;
  testResult?: TestResult;
  onSetActive: (id: string) => void;
  onTest: (config: UserImageConfig) => void;
  onEdit: (config: UserImageConfig) => void;
  onDelete: (id: string) => void;
  onExport?: (config: UserImageConfig) => void;
}

export function ImageConfigCard({
  config: c,
  isActive,
  testResult: test,
  onSetActive,
  onTest,
  onEdit,
  onDelete,
  onExport,
}: ImageConfigCardProps) {
  return (
    <div
      className={`p-4 rounded-lg border transition-all ${
        isActive ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "hover:border-muted-foreground/30"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm truncate">{c.name}</span>
            {isActive && (
              <span className="shrink-0 text-xs px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                默认
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {c.provider} · {c.model} · {c.endpointType} · {c.size}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {!isActive && (
            <button
              onClick={() => onSetActive(c.id)}
              className="px-2 py-1 text-xs rounded border hover:bg-muted transition-colors"
              title="设为默认"
            >
              设为默认
            </button>
          )}
          <button
            onClick={() => onTest(c)}
            disabled={test?.status === "testing"}
            className="px-2 py-1 text-xs rounded border hover:bg-muted transition-colors disabled:opacity-50"
          >
            {test?.status === "testing" ? "测试中..." : "测试"}
          </button>
          <button
            onClick={() => onEdit(c)}
            className="px-2 py-1 text-xs rounded border hover:bg-muted transition-colors"
          >
            编辑
          </button>
          {onExport && (
            <button
              onClick={() => onExport(c)}
              className="px-2 py-1 text-xs rounded border hover:bg-muted transition-colors"
              title="导出此配置"
            >
              导出
            </button>
          )}
          <button
            onClick={() => {
              if (confirm(`确定删除配置「${c.name}」？`)) onDelete(c.id);
            }}
            className="px-2 py-1 text-xs rounded border border-error/20 text-error hover:bg-error/5 transition-colors"
          >
            删除
          </button>
        </div>
      </div>

      {/* 测试结果 */}
      {test && test.status !== "idle" && test.status !== "testing" && (
        <div
          className={`mt-2 p-2 rounded text-xs ${
            test.status === "success"
              ? "bg-success/5 text-success border border-success/20"
              : "bg-error/5 text-error border border-error/20"
          }`}
        >
          <div className="font-medium">{test.message}</div>
          {test.detail && <div className="mt-0.5 opacity-80 break-all">{test.detail}</div>}
        </div>
      )}
    </div>
  );
}
