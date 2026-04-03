"use client";

export function ScoreBar({ label, score }: { label: string; score: number }) {
  const pct = score * 10;
  const color = score >= 8 ? "bg-green-500" : score >= 6 ? "bg-yellow-500" : "bg-red-500";

  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{score}/10</span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
