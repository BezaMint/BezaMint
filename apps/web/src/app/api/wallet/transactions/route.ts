/**
 * GET /api/wallet/transactions?address=G...&limit=10
 *
 * Returns a wallet's recent on-chain history (operations affecting the
 * address) from Horizon, mapped to a stable client shape. Supports
 * `limit` (max 50) and `cursor` for pagination.
 */
import { NextRequest, NextResponse } from 'next/server';
import { Horizon } from '@stellar/stellar-sdk';
import { getHorizonServer } from '@/services/stellar';
import { apiError, normalizeError } from '@/lib/server/errors';
import { newRequestId, timeRequest, logger } from '@/lib/server/logger';
import { withTimeout } from '@/lib/server/http';
import { isAccountMissing } from '@/lib/server/horizon';
import { TtlCache, SHORT_CACHE_CONTROL } from '@/lib/server/cache';
import { requireStellarAddress } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

const historyCache = new TtlCache<TransactionPayload>(15_000);

interface TransactionPayload {
  operations: WalletOperation[];
  cursor: string | null;
}

interface WalletOperation {
  id: string;
  type: string;
  asset: string | null;
  amount: string | null;
  counterparty: string | null;
  memo: string | null;
  successful: boolean;
  createdAt: string;
}

export async function GET(request: NextRequest) {
  const requestId = newRequestId();
  const timer = timeRequest(requestId, 'GET', '/api/wallet/transactions');
  try {
    const address = requireStellarAddress(request.nextUrl.searchParams);
    const cursor = request.nextUrl.searchParams.get('cursor')?.trim() || undefined;
    const rawLimit = Number(request.nextUrl.searchParams.get('limit'));
    const limit = Number.isInteger(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 50) : 10;

    const key = `history:${address}:${limit}:${cursor ?? ''}`;
    const data = await historyCache.getOrSet(key, () => loadHistory(address, limit, cursor));

    timer.done(200, { operations: data.operations.length });
    return NextResponse.json(
      { data, pagination: { cursor: data.cursor } },
      { headers: { 'Cache-Control': SHORT_CACHE_CONTROL } },
    );
  } catch (err) {
    const apiError = normalizeError(err);
    logger.warn('GET /api/wallet/transactions failed', { requestId, error: apiError.message });
    timer.done(apiError.status, { error: apiError.code });
    return NextResponse.json(apiError.toJson(), { status: apiError.status });
  }
}

async function loadHistory(
  address: string,
  limit: number,
  cursor?: string,
): Promise<TransactionPayload> {
  const server = getHorizonServer();

  // A 404 from Horizon means the account has never been funded, which is a
  // normal state for a wallet that has not received anything yet, so it answers
  // with an empty history. Any other failure -- an outage, a timeout, a rejected
  // request -- is not that, and used to be treated as one: every Horizon failure
  // produced "no transactions", so an outage was indistinguishable from an
  // empty account.
  try {
    await withTimeout(server.loadAccount(address), 8_000, 'Horizon account lookup timed out');
  } catch (err) {
    if (isAccountMissing(err)) {
      return { operations: [], cursor: null };
    }
    logger.warn('Horizon account lookup failed', {
      error: err instanceof Error ? err.message : String(err),
      address,
    });
    throw apiError('HISTORY_UNAVAILABLE', 'Could not load this account from Horizon');
  }
  try {
    const request = server.operations().forAccount(address).order('desc').limit(limit);
    if (cursor) request.cursor(cursor);
    const page = await withTimeout(request.call(), 8_000, 'Horizon operations query timed out');
    return mapOperations(page.records);
  } catch (err) {
    logger.warn('Horizon operations query failed', {
      error: err instanceof Error ? err.message : String(err),
      address,
    });
    throw apiError('NETWORK_ERROR', 'Failed to load transaction history');
  }
}

function mapOperations(records: Horizon.ServerApi.OperationRecord[]): TransactionPayload {
  const operations: WalletOperation[] = records.map((op) => {
    const anyOp = op as unknown as Record<string, unknown>;
    const assetType = typeof anyOp.asset_type === 'string' ? anyOp.asset_type : '';
    const assetCode = typeof anyOp.asset_code === 'string' ? anyOp.asset_code : null;
    return {
      id: op.id,
      type: op.type,
      asset:
        assetType === 'native'
          ? 'XLM'
          : assetType === 'credit_alphanum4' || assetType === 'credit_alphanum12'
            ? assetCode
            : null,
      amount: typeof anyOp.amount === 'string' ? anyOp.amount : null,
      counterparty:
        ['from', 'to', 'account']
          .map((key) => anyOp[key])
          .find((value): value is string => typeof value === 'string') ?? null,
      memo: typeof anyOp.memo === 'string' ? anyOp.memo : null,
      successful:
        typeof anyOp.transaction_successful === 'boolean' ? anyOp.transaction_successful : true,
      createdAt: op.created_at,
    };
  });

  const last = records.at(-1);
  return {
    operations,
    cursor: last ? last.paging_token : null,
  };
}
