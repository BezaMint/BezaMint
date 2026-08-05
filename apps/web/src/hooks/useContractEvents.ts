'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { getRpcClient } from '@/services/stellar';

// ─────────────────────── Types ───────────────────────

export interface ContractEvent {
  contractId: string;
  topics: string[];
  data: string;
  ledger: number;
  ledgerClosedAt: string;
  pagingToken: string;
  txHash: string;
  type: string;
  inSuccessfulContractCall: boolean;
}

interface UseContractEventsOptions {
  contractIds?: string[];
  /** Polling interval in ms. Defaults to 5000. */
  pollIntervalMs?: number;
  /** Maximum events to show. Defaults to 50. */
  maxEvents?: number;
  /** Only fetch events from this start ledger */
  startLedger?: number;
  /** Pause polling */
  paused?: boolean;
}

interface UseContractEventsResult {
  events: ContractEvent[];
  isLoading: boolean;
  isSubscribed: boolean;
  error: string | null;
  lastLedger: number | null;
  refresh: () => Promise<void>;
  pause: () => void;
  resume: () => void;
}

// ─────────────────────── Hook ───────────────────────

export function useContractEvents(options: UseContractEventsOptions = {}): UseContractEventsResult {
  const {
    contractIds,
    pollIntervalMs = 5000,
    maxEvents = 50,
    startLedger,
    paused: initialPaused = false,
  } = options;

  const [events, setEvents] = useState<ContractEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastLedger, setLastLedger] = useState<number | null>(null);
  const [isPaused, setIsPaused] = useState(initialPaused);

  const latestCursor = useRef<string | null>(null);
  const isMounted = useRef(true);

  const fetchEvents = useCallback(async () => {
    if (!contractIds || contractIds.length === 0) return;

    const rpc = getRpcClient();
    setIsLoading(true);
    setError(null);

    try {
      // Fetch events for each contract
      const responses = await Promise.allSettled(
        contractIds.map((contractId) =>
          rpc.getEvents({
            startLedger: startLedger || 1,
            filters: [
              {
                type: 'contract',
                contractIds: [contractId],
              },
            ],
            limit: maxEvents,
            ...(latestCursor.current ? { cursor: latestCursor.current } : {}),
          }),
        ),
      );

      const newEvents: ContractEvent[] = [];

      for (const response of responses) {
        if (response.status === 'fulfilled') {
          const eventsList = (response.value as any)?.events || [];
          for (const evt of eventsList) {
            newEvents.push({
              contractId: (evt as any).contractId || '',
              topics: (evt as any).topic || [],
              data: (evt as any).value?.xdr || '',
              ledger: (evt as any).ledger as number,
              ledgerClosedAt: (evt as any).ledgerClosedAt || '',
              pagingToken: (evt as any).pagingToken || '',
              txHash: (evt as any).txHash || '',
              type: (evt as any).type || 'contract',
              inSuccessfulContractCall: (evt as any).inSuccessfulContractCall ?? true,
            });
          }
        }
      }

      if (isMounted.current) {
        setEvents((prev) => {
          const existing = new Map(prev.map((e) => [e.pagingToken, e]));
          for (const evt of newEvents) {
            if (!existing.has(evt.pagingToken)) {
              existing.set(evt.pagingToken, evt);
            }
          }
          const merged = Array.from(existing.values());
          merged.sort((a, b) => b.ledger - a.ledger);
          return merged.slice(0, maxEvents);
        });

        if (newEvents.length > 0) {
          setLastLedger(newEvents[0].ledger);
        }
      }
    } catch (err: any) {
      if (isMounted.current) {
        setError(err?.message || 'Failed to fetch contract events');
      }
    } finally {
      if (isMounted.current) {
        setIsLoading(false);
      }
    }
  }, [contractIds, startLedger, maxEvents]);

  // Polling effect
  useEffect(() => {
    isMounted.current = true;
    if (isPaused) return;

    fetchEvents();
    const interval = setInterval(fetchEvents, pollIntervalMs);

    return () => {
      isMounted.current = false;
      clearInterval(interval);
    };
  }, [fetchEvents, pollIntervalMs, isPaused]);

  const pause = useCallback(() => setIsPaused(true), []);
  const resume = useCallback(() => setIsPaused(false), []);
  const refresh = useCallback(async () => {
    latestCursor.current = null;
    setEvents([]);
    await fetchEvents();
  }, [fetchEvents]);

  return {
    events,
    isLoading,
    isSubscribed: !isPaused && !!contractIds?.length,
    error,
    lastLedger,
    refresh,
    pause,
    resume,
  };
}

// ─────────────────────── Default export ───────────────────────

export default useContractEvents;
