'use client';

export default function PageSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="page-container max-w-6xl animate-pulse">
      <div className="mb-8">
        <div className="h-8 w-48 bg-bezamint-muted rounded-lg" />
        <div className="h-4 w-64 bg-bezamint-muted/50 rounded mt-2" />
      </div>
      <div className="space-y-4">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="card">
            <div className="h-4 w-3/4 bg-bezamint-muted/30 rounded" />
            <div className="h-4 w-1/2 bg-bezamint-muted/20 rounded mt-2" />
          </div>
        ))}
      </div>
    </div>
  );
}
