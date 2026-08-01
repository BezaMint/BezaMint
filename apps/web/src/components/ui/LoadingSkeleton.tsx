'use client';

interface LoadingSkeletonProps {
  type?: 'card' | 'text' | 'circle' | 'stat' | 'form';
  count?: number;
  className?: string;
}

function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`animate-pulse bg-bezamint-muted/50 rounded-lg ${className}`} />
  );
}

export default function LoadingSkeleton({ type = 'text', count = 1, className = '' }: LoadingSkeletonProps) {
  const items = Array.from({ length: count });

  if (type === 'card') {
    return (
      <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 ${className}`}>
        {items.map((_, i) => (
          <div key={i} className="card">
            <Skeleton className="w-full aspect-square mb-4" />
            <Skeleton className="h-5 w-3/4 mb-2" />
            <Skeleton className="h-4 w-1/2 mb-3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        ))}
      </div>
    );
  }

  if (type === 'stat') {
    return (
      <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 ${className}`}>
        {items.map((_, i) => (
          <div key={i} className="card flex items-start gap-4">
            <Skeleton className="w-12 h-12 rounded-xl" />
            <div className="flex-1">
              <Skeleton className="h-7 w-16 mb-1" />
              <Skeleton className="h-4 w-24" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (type === 'circle') {
    return (
      <div className={`flex items-center gap-4 ${className}`}>
        {items.map((_, i) => (
          <Skeleton key={i} className="w-12 h-12 rounded-full" />
        ))}
      </div>
    );
  }

  if (type === 'form') {
    return (
      <div className={`space-y-5 ${className}`}>
        <Skeleton className="h-6 w-48 mb-4" />
        {items.map((_, i) => (
          <div key={i}>
            <Skeleton className="h-4 w-24 mb-2" />
            <Skeleton className="h-12 w-full" />
          </div>
        ))}
        <div className="flex gap-3 pt-4">
          <Skeleton className="h-12 flex-1" />
          <Skeleton className="h-12 flex-1" />
        </div>
      </div>
    );
  }

  // text
  return (
    <div className={`space-y-2 ${className}`}>
      {items.map((_, i) => (
        <Skeleton key={i} className={`h-4 ${i === 0 ? 'w-3/4' : i === items.length - 1 ? 'w-1/2' : 'w-full'}`} />
      ))}
    </div>
  );
}
