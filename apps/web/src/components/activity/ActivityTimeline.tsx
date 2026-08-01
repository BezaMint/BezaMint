'use client';

import {
  HiOutlineSparkles,
  HiOutlineCollection,
  HiOutlineUser,
  HiOutlineCurrencyDollar,
  HiOutlineSwitchHorizontal,
  HiOutlineExternalLink,
  HiOutlinePencil,
} from 'react-icons/hi';
import { useRouter } from 'next/navigation';

export type { ActivityEventType } from '@bezamint/shared';

export interface ActivityItem {
  id: string;
  eventType: string;
  description: string;
  timestamp: string;
  txHash: string;
  href?: string;
}

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  nft_minted: HiOutlineSparkles,
  nft_transferred: HiOutlineSwitchHorizontal,
  collection_created: HiOutlineCollection,
  collection_updated: HiOutlinePencil,
  royalty_configured: HiOutlineCurrencyDollar,
  profile_created: HiOutlineUser,
  profile_updated: HiOutlinePencil,
};

interface ActivityTimelineProps {
  activities: ActivityItem[];
  maxItems?: number;
}

export default function ActivityTimeline({ activities, maxItems }: ActivityTimelineProps) {
  const router = useRouter();
  const displayed = maxItems ? activities.slice(0, maxItems) : activities;

  return (
    <div className="space-y-1">
      {displayed.map((activity, idx) => {
        const Icon = ICON_MAP[activity.eventType] || HiOutlineSparkles;

        return (
          <div
            key={activity.id}
            onClick={() => activity.href && router.push(activity.href)}
            className={`flex items-start gap-3 py-3 px-3 rounded-lg hover:bg-bezamint-muted/30 transition-colors group ${
              activity.href ? 'cursor-pointer' : ''
            }`}
          >
            {/* Timeline dot + line */}
            <div className="flex flex-col items-center flex-shrink-0">
              <div className="p-1.5 rounded-lg bg-bezamint-muted/50 border border-bezamint-border group-hover:border-gray-600 transition-colors">
                <Icon className="w-4 h-4 text-gray-400 group-hover:text-gray-200" />
              </div>
              {idx < displayed.length - 1 && (
                <div className="w-px flex-1 min-h-[12px] bg-bezamint-border mt-1" />
              )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="text-sm font-medium text-gray-200">{activity.eventType}</span>
                  <p className="text-sm text-gray-400 mt-0.5">{activity.description}</p>
                </div>
                <span className="text-xs text-gray-600 flex-shrink-0">{activity.timestamp}</span>
              </div>

              {/* Tx hash link */}
              <a
                href={`https://stellar.expert/explorer/testnet/tx/${activity.txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 text-xs text-gray-600 hover:text-gray-400 mt-1 font-mono"
              >
                {activity.txHash.slice(0, 10)}...
                <HiOutlineExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        );
      })}

      {displayed.length === 0 && (
        <div className="text-center py-8 text-sm text-gray-500">No activity yet.</div>
      )}
    </div>
  );
}
