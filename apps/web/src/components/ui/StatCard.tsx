'use client';

import { IconType } from 'react-icons';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: IconType;
  trend?: string;
  href?: string;
}

export default function StatCard({ label, value, icon: Icon, trend, href }: StatCardProps) {
  const CardWrapper = href ? 'a' : 'div';
  const cardProps = href ? { href } : {};

  return (
    <CardWrapper {...(cardProps as any)} className="card flex items-start gap-4 group">
      <div className="p-3 rounded-xl bg-bezamint-primary/10 border border-bezamint-primary/20 group-hover:bg-bezamint-primary/20 transition-colors">
        <Icon className="w-5 h-5 text-bezamint-secondary" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-2xl font-bold text-white">{value}</div>
        <div className="text-sm text-gray-400 mt-0.5">{label}</div>
        {trend && <div className="text-xs text-bezamint-secondary mt-1 font-medium">{trend}</div>}
      </div>
    </CardWrapper>
  );
}
