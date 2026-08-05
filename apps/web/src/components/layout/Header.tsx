'use client';

import React, { useState } from 'react';
import {
  HiOutlineLogout,
  HiOutlineExternalLink,
  HiOutlineSearch,
  HiOutlineRefresh,
  HiOutlinePaperAirplane,
  HiOutlineX,
} from 'react-icons/hi';
import Link from 'next/link';
import { useWallet } from '@/context';
import { useToast } from '@/context';
import {
  formatAddress,
  getExplorerAccountUrl,
  isValidStellarAddress,
  buildXlmPayment,
  checkBalance,
  signAndSubmit,
} from '@/services';

export default function Header() {
  const { address, isConnected, isConnecting, connect, disconnect, balance, refreshBalance } =
    useWallet();
  const { showSuccess, showError } = useToast();

  const [showSend, setShowSend] = useState(false);
  const [sendTo, setSendTo] = useState('');
  const [sendAmount, setSendAmount] = useState('');
  const [sendMemo, setSendMemo] = useState('');
  const [isSending, setIsSending] = useState(false);

  const handleSend = async () => {
    if (!address || !isValidStellarAddress(sendTo)) {
      showError('Invalid destination address');
      return;
    }
    if (!sendAmount || parseFloat(sendAmount) <= 0) {
      showError('Amount must be greater than 0 XLM');
      return;
    }

    // Pre-flight balance check
    try {
      const balanceCheck = await checkBalance(address, 0.001);
      if (!balanceCheck.sufficient) {
        showError(
          `Insufficient balance. You have ${balanceCheck.balance} XLM but need at least ${balanceCheck.minimumRequired} XLM.`,
        );
        return;
      }
    } catch {
      // Continue if balance check fails
    }

    setIsSending(true);
    try {
      const { tx } = await buildXlmPayment(address, sendTo, sendAmount, sendMemo || undefined);
      const result = await signAndSubmit(tx);
      showSuccess(`Sent ${sendAmount} XLM — tx: ${result.txHash.slice(0, 10)}...`);
      setShowSend(false);
      setSendTo('');
      setSendAmount('');
      setSendMemo('');
      refreshBalance();
    } catch (err: unknown) {
      showError(err?.message || 'Failed to send XLM');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-bezamint-primary focus:text-white focus:rounded-lg"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-30 h-16 bg-bezamint-surface/80 backdrop-blur-lg border-b border-bezamint-border flex items-center justify-between px-4 lg:px-6">
        {/* Left spacer (sidebar offset — hidden on mobile) */}
        <div className="hidden lg:block w-64" />

        {/* Center — page title area */}
        <div className="flex-1 flex items-center justify-between max-w-6xl">
          <div className="flex items-center gap-3 lg:gap-4">
            <Link
              href="/explore"
              className="flex items-center gap-1 lg:gap-2 text-sm text-gray-400 hover:text-gray-200 transition-colors"
              title="Search (/)"
              aria-label="Search NFTs and collections"
            >
              <HiOutlineSearch className="w-4 h-4" />
              <span className="hidden sm:inline">Search</span>
              <kbd className="hidden lg:inline text-xs text-gray-600 border border-gray-700 rounded px-1.5 py-0.5">
                /
              </kbd>
            </Link>
            <div className="text-sm text-gray-400 hidden sm:block">
              {isConnected ? (
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-bezamint-secondary animate-pulse" />
                  Connected
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-gray-500" />
                  Not Connected
                </span>
              )}
            </div>
          </div>

          {/* Wallet button */}
          {isConnected && address ? (
            <div className="flex items-center gap-1.5 lg:gap-2">
              {/* Balance badge */}
              <div className="flex items-center gap-2 px-2 lg:px-3 py-1.5 rounded-lg bg-bezamint-muted/50 border border-bezamint-border text-sm">
                {balance.isLoading ? (
                  <svg className="animate-spin h-3 w-3 text-gray-400" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                      fill="none"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                ) : (
                  <span className="text-bezamint-secondary font-mono text-xs">
                    {balance.balance ? parseFloat(balance.balance).toFixed(2) : '—'} XLM
                  </span>
                )}
                <button
                  onClick={refreshBalance}
                  className="p-0.5 text-gray-500 hover:text-gray-300"
                  title="Refresh balance"
                  aria-label="Refresh balance"
                >
                  <HiOutlineRefresh className="w-3 h-3" />
                </button>
              </div>

              {/* Send button */}
              <button
                onClick={() => setShowSend(true)}
                className="p-1.5 lg:p-2 rounded-lg text-gray-400 hover:text-bezamint-secondary hover:bg-bezamint-primary/10 transition-all"
                title="Send XLM"
                aria-label="Send XLM"
              >
                <HiOutlinePaperAirplane className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
              </button>

              {/* Address badge */}
              <a
                href={getExplorerAccountUrl(address)}
                target="_blank"
                rel="noopener noreferrer"
                className="hidden md:flex items-center gap-2 px-2 lg:px-3 py-1.5 rounded-lg bg-bezamint-muted/50 border border-bezamint-border text-sm text-gray-300 hover:bg-bezamint-muted transition-all group"
                aria-label="View on Stellar Explorer"
              >
                <span className="font-mono text-xs">{formatAddress(address)}</span>
                <HiOutlineExternalLink className="w-3 h-3 text-gray-500 group-hover:text-gray-300" />
              </a>

              {/* Disconnect */}
              <button
                onClick={disconnect}
                className="p-1.5 lg:p-2 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-all"
                title="Disconnect wallet"
                aria-label="Disconnect wallet"
              >
                <HiOutlineLogout className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={connect}
              disabled={isConnecting}
              className="btn-primary text-sm py-2 px-4 lg:px-5 flex items-center gap-2"
              aria-label="Connect wallet"
            >
              {isConnecting ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                      fill="none"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Connecting...
                </>
              ) : (
                <>Connect Wallet</>
              )}
            </button>
          )}
        </div>

        {/* Send XLM Modal */}
        {showSend && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
            <div className="fixed inset-0" onClick={() => setShowSend(false)} role="presentation" />
            <div className="card max-w-md w-full relative animate-fade-in">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold text-white">Send XLM</h2>
                <button
                  onClick={() => setShowSend(false)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-gray-200"
                  aria-label="Close send dialog"
                >
                  <HiOutlineX className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="input-label" htmlFor="send-destination">
                    Destination Address
                  </label>
                  <input
                    id="send-destination"
                    autoFocus
                    type="text"
                    value={sendTo}
                    onChange={(e) => setSendTo(e.target.value)}
                    placeholder="GABC..."
                    className="input-field font-mono text-sm"
                  />
                </div>
                <div>
                  <label className="input-label" htmlFor="send-amount">
                    Amount (XLM)
                  </label>
                  <input
                    id="send-amount"
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={sendAmount}
                    onChange={(e) => setSendAmount(e.target.value)}
                    placeholder="10.00"
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="input-label" htmlFor="send-memo">
                    Memo (optional)
                  </label>
                  <input
                    id="send-memo"
                    type="text"
                    value={sendMemo}
                    onChange={(e) => setSendMemo(e.target.value)}
                    placeholder="Payment for..."
                    maxLength={28}
                    className="input-field"
                  />
                </div>

                <button
                  onClick={handleSend}
                  disabled={isSending || !sendTo || !sendAmount}
                  className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <HiOutlinePaperAirplane className="w-4 h-4" />
                  {isSending ? 'Sending...' : 'Send XLM'}
                </button>
              </div>
            </div>
          </div>
        )}
      </header>
    </>
  );
}

Header.displayName = 'Header';
