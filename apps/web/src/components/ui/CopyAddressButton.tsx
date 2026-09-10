'use client';

import { useState, useCallback } from 'react';
import { HiOutlineClipboardCopy, HiOutlineCheck } from 'react-icons/hi';
import { copyToClipboard } from '@/lib/clipboard';

interface CopyAddressButtonProps {
  address: string;
  label?: string;
  className?: string;
}

/**
 * Copy an address to the clipboard with "copied" feedback.
 * Falls back silently when the Clipboard API is unavailable.
 */
export default function CopyAddressButton({
  address,
  label = 'Copy address',
  className = '',
}: CopyAddressButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    const ok = await copyToClipboard(address);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [address]);

  return (
    <button
      onClick={handleCopy}
      className={`inline-flex items-center gap-1.5 text-xs transition-colors ${
        copied ? 'text-bezamint-secondary' : 'text-gray-500 hover:text-gray-300'
      } ${className}`}
      title={label}
      aria-label={copied ? 'Address copied' : label}
    >
      {copied ? (
        <HiOutlineCheck className="w-3.5 h-3.5" />
      ) : (
        <HiOutlineClipboardCopy className="w-3.5 h-3.5" />
      )}
      {copied ? 'Copied!' : label}
    </button>
  );
}
