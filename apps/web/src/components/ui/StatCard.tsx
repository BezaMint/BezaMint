'use client';

import { IconType } from 'react-icons';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: IconType;
  trend?: string;
  href?: string;
  loading?: boolean;
}

export default function StatCard({
  label,
  value,
  icon: Icon,
  trend,
  href,
  loading = false,
}: StatCardProps) {
  const CardWrapper = href ? 'a' : 'div';
  const cardProps = href ? { href } : {};

  return (
    <CardWrapper
      {...(cardProps as any)}
      aria-label={label}
      className="card flex items-start gap-4 group"
    >
      <div className="p-3 rounded-xl bg-bezamint-primary/10 border border-bezamint-primary/20 group-hover:bg-bezamint-primary/20 transition-colors">
        <Icon className="w-5 h-5 text-bezamint-secondary" />
      </div>
      <div className="flex-1 min-w-0">
        {loading ? (
          <>
            <div className="h-7 w-16 bg-bezamint-muted/40 rounded animate-pulse mb-1.5" />
            <div className="h-4 w-24 bg-bezamint-muted/30 rounded animate-pulse" />
          </>
        ) : (
          <>
            <div className="text-2xl font-bold text-white">{value}</div>
            <div className="text-sm text-gray-400 mt-0.5">{label}</div>
          </>
        )}
        {trend && <div className="text-xs text-bezamint-secondary mt-1 font-medium">{trend}</div>}
      </div>
    </CardWrapper>
  );
}
