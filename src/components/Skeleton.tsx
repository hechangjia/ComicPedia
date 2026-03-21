interface SkeletonProps {
  className?: string;
}

/** 基础骨架屏组件 */
export function Skeleton({ className = "" }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse bg-muted rounded ${className}`}
    />
  );
}

/** 漫画面板骨架屏 */
export function PanelSkeleton() {
  return (
    <div className="rounded-xl border overflow-hidden bg-card">
      {/* 图片区域 */}
      <div className="aspect-square bg-muted relative">
        <Skeleton className="absolute inset-0 rounded-none" />
        {/* 面板编号占位 */}
        <div className="absolute top-2 left-2 w-6 h-6 rounded-full bg-muted-foreground/20" />
      </div>
      {/* 文字区域 */}
      <div className="p-3 space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </div>
  );
}

/** 漫画网格骨架屏 */
export function ComicGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <PanelSkeleton key={i} />
      ))}
    </div>
  );
}

/** 历史卡片骨架屏 */
export function HistoryCardSkeleton() {
  return (
    <div className="rounded-xl border overflow-hidden bg-card">
      <div className="aspect-video bg-muted">
        <Skeleton className="w-full h-full rounded-none" />
      </div>
      <div className="p-3 space-y-2">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <div className="flex justify-between">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-12" />
        </div>
      </div>
    </div>
  );
}

/** 结果页标题骨架屏 */
export function TitleSkeleton() {
  return (
    <div className="text-center space-y-2">
      <Skeleton className="h-8 w-1/2 mx-auto" />
      <Skeleton className="h-4 w-1/3 mx-auto" />
    </div>
  );
}
