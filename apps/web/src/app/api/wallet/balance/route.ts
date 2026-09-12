/**
 * GET /api/wallet/balance?address=G...
 *
 * Returns the native XLM balance (via Horizon) plus the NFT balance
 * (via the NFT contract's `balance_of` read). Useful for wallet widgets,
 * fee checks, and "insufficient balance" pre-flight warnings.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getHorizonServer } from '@/services/stellar';
import { CONTRACT_IDS } from '@/services';
import { apiError, normalizeError } from '@/lib/server/errors';
import { newRequestId, timeRequest, logger } from '@/lib/server/logger';
import { simulateRead, addressScVal } from '@/lib/server/contractReader';
import { withTimeout } from '@/lib/server/http';
import { isAccountMissing } from '@/lib/server/horizon';
import { TtlCache, SHORT_CACHE_CONTROL } from '@/lib/server/cache';
import { requireStellarAddress } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

// Balances change rarely relative to how often wallets poll; cache briefly.
const balanceCache = new TtlCache<BalancePayload>(10_000);

interface BalancePayload {
  address: string;
  xlm: { balance: string; isFunded: boolean };
  nfts: { balance: number } | null;
}

export async function GET(request: NextRequest) {
  const requestId = newRequestId();
  const timer = timeRequest(requestId, 'GET', '/api/wallet/balance');
  try {
    const address = requireStellarAddress(request.nextUrl.searchParams);

    return NextResponse.json(
      { data: await balanceCache.getOrSet(`balance:${address}`, () => loadBalance(address)) },
      { headers: { 'Cache-Control': SHORT_CACHE_CONTROL } },
    );
  } catch (err) {
    const apiError = normalizeError(err);
    logger.warn('GET /api/wallet/balance failed', { requestId, error: apiError.message });
    timer.done(apiError.status, { error: apiError.code });
    return NextResponse.json(apiError.toJson(), { status: apiError.status });
  }
}

async function loadBalance(address: string): Promise<BalancePayload> {
  // XLM balance via Horizon. A missing account is a normal state, not an error:
  // the address has never been funded. A Horizon failure is not that, and
  // answering `0 XLM` for it told the user their wallet was empty.
  let xlm: BalancePayload['xlm'] = { balance: '0', isFunded: false };
  try {
    const account = await withTimeout(
      getHorizonServer().loadAccount(address),
      8_000,
      'Horizon account lookup timed out',
    );
    const native = account.balances.find((b) => b.asset_type === 'native');
    xlm = {
      balance: native?.balance ?? '0',
      isFunded: true,
    };
  } catch (err) {
    if (!isAccountMissing(err)) {
      logger.warn('Horizon balance lookup failed', {
        error: err instanceof Error ? err.message : String(err),
        address,
      });
      throw apiError('WALLET_BALANCE_UNAVAILABLE', 'Could not read this account from Horizon');
    }
  }

  // NFT balance via the contract. Null when the NFT contract is unconfigured.
  let nfts: BalancePayload['nfts'] = null;
  if (CONTRACT_IDS.nft) {
    try {
      const nftBalance = await simulateRead<number | bigint>(CONTRACT_IDS.nft, 'balance_of', [
        addressScVal(address),
      ]);
      nfts = { balance: Number(nftBalance ?? 0) };
    } catch (err) {
      logger.warn('NFT balance read failed', {
        error: err instanceof Error ? err.message : String(err),
        address,
      });
    }
  }

  return { address, xlm, nfts };
}
