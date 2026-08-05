import { LoadingSkeleton } from '@/components/ui';

export default function Loading() {
  return (
    <div className="page-container max-w-6xl">
      <div className="mb-8">
        <div className="h-9 w-64 bg-bezamint-muted/40 rounded-lg animate-pulse mb-3" />
        <div className="h-4 w-96 max-w-full bg-bezamint-muted/30 rounded animate-pulse" />
      </div>
      <LoadingSkeleton rows={6} />
    </div>
  );
}
