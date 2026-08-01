'use client';

import { useId } from 'react';

interface LogoProps {
  size?: number;
  className?: string;
}

export function BezaMintLogo({ size = 40, className = '' }: LogoProps) {
  const gradientId = useId();

  return (
    <div
      className={`inline-flex items-center justify-center rounded-xl bg-bezamint-primary/10 border border-bezamint-primary/20 ${className}`}
      style={{ width: size, height: size }}
    >
      <svg
        width={size * 0.65}
        height={size * 0.65}
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect width="40" height="40" rx="12" fill={`url(#${gradientId})`} />
        <path d="M12 28L20 10L28 28H12Z" fill="white" fillOpacity="0.9" />
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="40" y2="40">
            <stop stopColor="#24a563" />
            <stop offset="1" stopColor="#7cd9a3" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}
