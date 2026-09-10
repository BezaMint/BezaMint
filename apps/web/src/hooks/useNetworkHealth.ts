'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  checkNetworkHealth,
  probeContract,
  type ContractHealthResult,
  type NetworkHealthResult,
} from '@/services/health';
import { CONTRACT_IDS } from '@/services';

export interface ContractHealthEntry {
  key: keyof typeof CONTRACT_IDS;
  label: string;
  contractId: string;
  result?: ContractHealthResult;
}

export interface NetworkHealthState {
  checking: boolean;
  result?: NetworkHealthResult;
}

const CONTRACT_META: { key: keyof typeof CONTRACT_IDS; label: string }[] = [
  { key: 'nft', label: 'NFT Contract' },
  { key: 'collection', label: 'Collection Contract' },
  { key: 'royalty', label: 'Royalty Contract' },
  { key: 'creator', label: 'Creator Contract' },
  { key: 'factory', label: 'Factory Contract' },
];

/**
 * Runs real RPC + contract probes for the Settings page, with a manual
 * re-check trigger.
 */
export function useNetworkHealth() {
  const [network, setNetwork] = useState<NetworkHealthState>({ checking: true });
  const [contracts, setContracts] = useState<ContractHealthEntry[]>(() =>
    CONTRACT_META.map(({ key, label }) => ({
      key,
      label,
      contractId: CONTRACT_IDS[key],
    })),
  );

  const runChecks = useCallback(async () => {
    setNetwork((prev) => ({ ...prev, checking: true }));

    // Reset contract results (keep deployed/unconfigured state).
    setContracts((prev) => prev.map((entry) => ({ ...entry, result: undefined })));

    const netResult = await checkNetworkHealth();
    setNetwork({ checking: false, result: netResult });

    await Promise.all(
      CONTRACT_META.map(async ({ key }) => {
        const contractId = CONTRACT_IDS[key];
        if (!contractId) return;
        const result = await probeContract(contractId, key);
        setContracts((prev) =>
          prev.map((entry) => (entry.key === key ? { ...entry, result } : entry)),
        );
      }),
    );
  }, []);

  useEffect(() => {
    void runChecks();
  }, [runChecks]);

  return { network, contracts, recheck: runChecks };
}
