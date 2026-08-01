'use client';

interface ActivityItemProps {
  eventType: string;
  description: string;
  timestamp: string;
  txHash?: string;
  icon: React.ReactNode;
}

export default function ActivityItem({ eventType, description, timestamp, txHash, icon }: ActivityItemProps) {
  return (
    <div className="flex items-start gap-3 py-3 px-2 rounded-lg hover:bg-bezamint-muted/30 transition-colors">
      <div className="p-2 rounded-lg bg-bezamint-muted/50 border border-bezamint-border flex-shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-200">{eventType}</span>
          {txHash && (
            <span className="text-xs font-mono text-gray-500 truncate">{txHash.slice(0, 10)}...</span>
          )}
        </div>
        <p className="text-sm text-gray-400 mt-0.5">{description}</p>
        <span className="text-xs text-gray-500 mt-1 block">{timestamp}</span>
      </div>
    </div>
  );
}
