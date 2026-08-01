'use client';

import { HiOutlineCurrencyDollar, HiOutlinePlus, HiOutlineTrash } from 'react-icons/hi';
import type { RoyaltyConfig as RoyaltyConfigType } from '@bezamint/shared';

interface RoyaltyConfigProps {
  config: RoyaltyConfigType | null;
  onChange: (config: RoyaltyConfigType | null) => void;
  userAddress?: string;
}

export default function RoyaltyConfig({
  config,
  onChange,
  userAddress,
}: RoyaltyConfigProps) {
  const isEnabled = config !== null;
  const basisPoints = config?.basisPoints ?? 0;
  const recipients = config?.recipients ?? [];
  const percentage = (basisPoints / 100).toFixed(2);

  const toggleEnabled = () => {
    if (isEnabled) {
      onChange(null);
    } else {
      onChange({
        basisPoints: 250, // default 2.5%
        recipients: userAddress ? [{ address: userAddress, share: 100 }] : [],
      });
    }
  };

  const setBasisPoints = (bps: number) => {
    if (!config) return;
    onChange({ ...config, basisPoints: Math.min(10000, Math.max(0, bps)) });
  };

  const addRecipient = () => {
    if (!config) return;
    if (config.recipients.length >= 5) return;
    onChange({
      ...config,
      recipients: [...config.recipients, { address: '', share: 0 }],
    });
  };

  const removeRecipient = (idx: number) => {
    if (!config) return;
    onChange({
      ...config,
      recipients: config.recipients.filter((_, i) => i !== idx),
    });
  };

  const updateRecipient = (idx: number, field: 'address' | 'share', value: string | number) => {
    if (!config) return;
    const updated = config.recipients.map((r, i) =>
      i === idx ? { ...r, [field]: value } : r,
    );
    onChange({ ...config, recipients: updated });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <HiOutlineCurrencyDollar className="w-5 h-5 text-yellow-400" />
          <label className="text-sm font-medium text-gray-300">Royalties</label>
        </div>
        <button
          onClick={toggleEnabled}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            isEnabled ? 'bg-bezamint-primary' : 'bg-bezamint-muted'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              isEnabled ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      {isEnabled && (
        <div className="space-y-3 p-4 rounded-xl bg-bezamint-muted/20 border border-bezamint-border">
          {/* Basis Points */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-400">Royalty Percentage</span>
              <span className="text-sm font-mono text-bezamint-secondary">
                {percentage}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="10000"
              step="10"
              value={basisPoints}
              onChange={(e) => setBasisPoints(Number(e.target.value))}
              className="w-full h-2 rounded-lg appearance-none bg-bezamint-muted accent-bezamint-primary cursor-pointer"
            />
            <div className="flex justify-between text-xs text-gray-600 mt-1">
              <span>0%</span>
              <span>100%</span>
            </div>
          </div>

          {/* Recipients */}
          <div className="space-y-2">
            <p className="text-xs text-gray-400">Royalty Recipients</p>
            {recipients.map((recipient, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="GABC...DEFG"
                  value={recipient.address}
                  onChange={(e) => updateRecipient(idx, 'address', e.target.value)}
                  className="input-field text-sm py-2 flex-1 font-mono"
                />
                <div className="relative w-20">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    placeholder="Share"
                    value={recipient.share || ''}
                    onChange={(e) => updateRecipient(idx, 'share', Number(e.target.value))}
                    className="input-field text-sm py-2 pr-7"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500">%</span>
                </div>
                <button
                  onClick={() => removeRecipient(idx)}
                  className="p-2 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-all flex-shrink-0"
                >
                  <HiOutlineTrash className="w-4 h-4" />
                </button>
              </div>
            ))}
            <button
              onClick={addRecipient}
              disabled={recipients.length >= 5}
              className="flex items-center gap-1 text-xs text-bezamint-secondary hover:text-bezamint-primary disabled:opacity-30"
            >
              <HiOutlinePlus className="w-3 h-3" />
              Add Recipient
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
