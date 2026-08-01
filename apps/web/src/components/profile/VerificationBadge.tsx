'use client';

import { HiOutlineBadgeCheck, HiOutlineShieldCheck } from 'react-icons/hi';

interface VerificationBadgeProps {
  isVerified: boolean;
  isAdmin?: boolean;
  onVerify?: () => void;
  size?: 'sm' | 'md' | 'lg';
}

export default function VerificationBadge({
  isVerified,
  isAdmin = false,
  onVerify,
  size = 'md',
}: VerificationBadgeProps) {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-7 h-7',
  };

  if (isVerified) {
    return (
      <span className="inline-flex items-center gap-1" title="Verified Creator">
        <HiOutlineBadgeCheck className={`${sizeClasses[size]} text-blue-400`} />
        {size === 'lg' && <span className="text-xs text-blue-400 font-medium">Verified</span>}
      </span>
    );
  }

  if (isAdmin && onVerify) {
    return (
      <button
        onClick={onVerify}
        className="inline-flex items-center gap-1 text-yellow-400 hover:text-yellow-300 transition-colors"
        title="Verify this creator (admin)"
      >
        <HiOutlineShieldCheck className={`${sizeClasses[size]}`} />
        {size === 'lg' && <span className="text-xs font-medium">Pending Verification</span>}
      </button>
    );
  }

  return null;
}
