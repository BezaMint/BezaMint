'use client';

import {
  HiOutlineCheckCircle,
  HiOutlineExclamationCircle,
  HiOutlineClock,
  HiOutlineExternalLink,
  HiOutlineX,
} from 'react-icons/hi';
import type { MintStatus } from '@bezamint/shared';
import { getExplorerTxUrl } from '@/services';

interface TransactionStatusProps {
  status: MintStatus;
  txHash: string | null;
  error: string | null;
  tokenId: number | null;
  onClose: () => void;
}

const STEPS: { key: MintStatus; label: string; icon: typeof HiOutlineClock }[] = [
  { key: 'preparing', label: 'Preparing transaction', icon: HiOutlineClock },
  { key: 'signing', label: 'Signing with Freighter', icon: HiOutlineClock },
  { key: 'submitting', label: 'Submitting to network', icon: HiOutlineClock },
  { key: 'confirming', label: 'Confirming on Stellar', icon: HiOutlineClock },
];

export default function TransactionStatus({
  status,
  txHash,
  error,
  tokenId,
  onClose,
}: TransactionStatusProps) {
  if (status === 'idle') return null;

  const isPending = ['preparing', 'signing', 'submitting', 'confirming'].includes(status);
  const isSuccess = status === 'success';
  const isError = status === 'error';

  const currentStepIndex = isPending
    ? STEPS.findIndex((s) => s.key === status)
    : isSuccess
      ? STEPS.length
      : -1;

  return (
    <div className="card max-w-md mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-white">
          {isPending && 'Minting NFT...'}
          {isSuccess && 'NFT Minted!'}
          {isError && 'Minting Failed'}
        </h3>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-bezamint-muted transition-all"
        >
          <HiOutlineX className="w-4 h-4" />
        </button>
      </div>

      {/* Progress Steps */}
      {isPending && (
        <div className="space-y-3 mb-6">
          {STEPS.map((step, idx) => {
            const isDone = idx < currentStepIndex;
            const isCurrent = idx === currentStepIndex;

            return (
              <div key={step.key} className="flex items-center gap-3">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                    isDone
                      ? 'bg-bezamint-primary/20 text-bezamint-secondary'
                      : isCurrent
                        ? 'bg-bezamint-primary/20 text-bezamint-secondary animate-pulse'
                        : 'bg-bezamint-muted/50 text-gray-600'
                  }`}
                >
                  {isDone ? (
                    <HiOutlineCheckCircle className="w-5 h-5" />
                  ) : isCurrent ? (
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle
                        className="opacity-25"
                        cx="12" cy="12" r="10"
                        stroke="currentColor" strokeWidth="4" fill="none"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                  ) : (
                    <step.icon className="w-4 h-4" />
                  )}
                </div>
                <span
                  className={`text-sm ${
                    isDone || isCurrent ? 'text-gray-200' : 'text-gray-600'
                  }`}
                >
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Success */}
      {isSuccess && (
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-bezamint-primary/10 border border-bezamint-primary/20 mb-3">
            <HiOutlineCheckCircle className="w-8 h-8 text-bezamint-secondary" />
          </div>
          {tokenId && (
            <p className="text-2xl font-bold text-white mb-1">
              Token #{tokenId}
            </p>
          )}
          <p className="text-sm text-gray-400">
            Your NFT has been successfully minted on the Stellar testnet.
          </p>
        </div>
      )}

      {/* Error */}
      {isError && (
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 mb-3">
            <HiOutlineExclamationCircle className="w-8 h-8 text-red-400" />
          </div>
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Transaction Hash */}
      {txHash && (
        <a
          href={getExplorerTxUrl(txHash)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 py-2 px-4 rounded-lg bg-bezamint-muted/50 border border-bezamint-border text-sm text-gray-300 hover:bg-bezamint-muted transition-all group"
        >
          <span className="font-mono text-xs">{txHash.slice(0, 12)}...{txHash.slice(-6)}</span>
          <HiOutlineExternalLink className="w-4 h-4 text-gray-500 group-hover:text-gray-300" />
        </a>
      )}
    </div>
  );
}
