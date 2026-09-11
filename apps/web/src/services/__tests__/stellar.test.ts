import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { rpc as SorobanRpc } from '@stellar/stellar-sdk';

/**
 * Tests for the Stellar service helpers.
 *
 * These are the functions every wallet interaction passes through, and the ones
 * whose failure modes a user actually sees: an address that passes validation
 * when it should not, a balance check that reports "sufficient" for an account
 * that cannot pay, a retry loop that gives up silently. The module had 14% line
 * coverage, so the branches below were unverified.
 */
import {
  checkBalance,
  fetchXlmBalance,
  formatAddress,
  getHorizonServer,
  getRpcClient,
  isValidStellarAddress,
  waitForTransaction,
  withRetry,
} from '@/services/stellar';
import {
  buildExplorerUrl,
  getExplorerAccountUrl,
  getExplorerContractUrl,
  getExplorerTxUrl,
} from '@/lib/explorer';

/** A structurally valid Stellar public key: `G` followed by 55 base32 chars. */
const VALID_ADDRESS = 'GAYVKGVGVI7G5L4WPIVRPBJQAQ2GNDDOXA64IGHGJZP65RA2U4XFTEMM';

describe('formatAddress', () => {
  it('truncates a long address to first and last four characters', () => {
    expect(formatAddress(VALID_ADDRESS)).toBe('GAYV...TEMM');
  });

  it('leaves a short value alone rather than producing a misleading stub', () => {
    // A truncated 6-character string would read as a valid-looking address.
    expect(formatAddress('GABC')).toBe('GABC');
    expect(formatAddress('123456789')).toBe('123456789');
  });

  it('truncates at exactly ten characters', () => {
    expect(formatAddress('1234567890')).toBe('1234...7890');
  });
});

describe('isValidStellarAddress', () => {
  it('accepts a well-formed public key', () => {
    expect(isValidStellarAddress(VALID_ADDRESS)).toBe(true);
  });

  it('rejects a secret key, which must never be accepted as an address', () => {
    // Same length and alphabet, wrong prefix: an `S...` key is a private key.
    expect(isValidStellarAddress(`S${VALID_ADDRESS.slice(1)}`)).toBe(false);
  });

  it('rejects a contract id, which is a different strkey type', () => {
    expect(isValidStellarAddress('CCW5JLGZQM25TDC2RKUB7OBYDNXDZSWIUP3AAXPT4F36S3D66RLUL33S')).toBe(
      false,
    );
  });

  it('rejects lower case and non-base32 characters', () => {
    expect(isValidStellarAddress(VALID_ADDRESS.toLowerCase())).toBe(false);
    expect(isValidStellarAddress(`G${VALID_ADDRESS.slice(1, -1)}1`)).toBe(false);
    expect(isValidStellarAddress(`G${VALID_ADDRESS.slice(1, -1)}0`)).toBe(false);
  });

  it('rejects wrong lengths and empty input', () => {
    expect(isValidStellarAddress('')).toBe(false);
    expect(isValidStellarAddress(VALID_ADDRESS.slice(0, -1))).toBe(false);
    expect(isValidStellarAddress(`${VALID_ADDRESS}G`)).toBe(false);
  });

  it('is a format gate, not a checksum check', () => {
    // Documented behaviour worth pinning: the regex cannot detect a mistyped key,
    // because a strkey checksum is not structural. Callers must not treat a pass
    // as proof that the account exists.
    const mistyped = `${VALID_ADDRESS.slice(0, -1)}A`;
    expect(isValidStellarAddress(mistyped)).toBe(true);
  });
});

describe('explorer urls', () => {
  const original = process.env.NEXT_PUBLIC_EXPLORER_URL;

  afterEach(() => {
    if (original === undefined) delete process.env.NEXT_PUBLIC_EXPLORER_URL;
    else process.env.NEXT_PUBLIC_EXPLORER_URL = original;
  });

  it('builds the expected links on the default explorer', () => {
    delete process.env.NEXT_PUBLIC_EXPLORER_URL;
    expect(getExplorerTxUrl('abc123')).toBe('https://stellar.expert/explorer/testnet/tx/abc123');
    expect(getExplorerAccountUrl(VALID_ADDRESS)).toBe(
      `https://stellar.expert/explorer/testnet/account/${VALID_ADDRESS}`,
    );
    expect(getExplorerContractUrl('CABC')).toBe(
      'https://stellar.expert/explorer/testnet/contract/CABC',
    );
  });

  it('reads the environment at call time so a deployment can switch networks', () => {
    process.env.NEXT_PUBLIC_EXPLORER_URL = 'https://stellar.expert/explorer/public';
    expect(getExplorerTxUrl('abc123')).toBe('https://stellar.expert/explorer/public/tx/abc123');
  });

  it('trims trailing slashes instead of producing a double slash', () => {
    process.env.NEXT_PUBLIC_EXPLORER_URL = 'https://example.test/explorer/';
    expect(buildExplorerUrl('ledger', '42')).toBe('https://example.test/explorer/ledger/42');
  });
});

describe('fetchXlmBalance', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the native balance, ignoring issued assets', async () => {
    vi.spyOn(getHorizonServer(), 'loadAccount').mockResolvedValue({
      balances: [
        { asset_type: 'credit_alphanum4', balance: '999.0000000' },
        { asset_type: 'native', balance: '42.5000000' },
      ],
    } as never);

    expect(await fetchXlmBalance(VALID_ADDRESS)).toBe('42.5000000');
  });

  it('returns zero when the account holds no XLM', async () => {
    vi.spyOn(getHorizonServer(), 'loadAccount').mockResolvedValue({ balances: [] } as never);

    expect(await fetchXlmBalance(VALID_ADDRESS)).toBe('0');
  });
});

describe('checkBalance', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reports sufficient for a funded account', async () => {
    vi.spyOn(getHorizonServer(), 'loadAccount').mockResolvedValue({
      balances: [{ asset_type: 'native', balance: '100.0000000' }],
    } as never);

    const result = await checkBalance(VALID_ADDRESS, 0.001);

    expect(result.sufficient).toBe(true);
    expect(result.balance).toBe('100.0000000');
    expect(result.minimumRequired).toBeGreaterThan(0);
  });

  it('reports insufficient when the balance is below the reserve plus fee', async () => {
    vi.spyOn(getHorizonServer(), 'loadAccount').mockResolvedValue({
      balances: [{ asset_type: 'native', balance: '0.0000001' }],
    } as never);

    expect((await checkBalance(VALID_ADDRESS)).sufficient).toBe(false);
  });

  // An unfunded testnet account is the common case, and it is not an error the
  // user should see a stack trace for -- the caller gets a definite "no".
  it('treats an unfunded account as insufficient rather than throwing', async () => {
    vi.spyOn(getHorizonServer(), 'loadAccount').mockRejectedValue(new Error('404 not found'));

    const result = await checkBalance(VALID_ADDRESS);

    expect(result.sufficient).toBe(false);
    expect(result.balance).toBe('0');
  });

  it('treats a Horizon outage as insufficient rather than letting it through', async () => {
    // Failing closed matters here: assuming sufficient on an error would let a
    // transaction be built that cannot pay for itself.
    vi.spyOn(getHorizonServer(), 'loadAccount').mockRejectedValue(new Error('ECONNRESET'));

    expect((await checkBalance(VALID_ADDRESS)).sufficient).toBe(false);
  });
});

describe('withRetry', () => {
  it('returns the first successful result without retrying', async () => {
    const fn = vi.fn().mockResolvedValue('ok');

    // baseDelayMs 0 keeps the test instant; the delay arithmetic is not what is
    // being asserted here.
    await expect(withRetry(fn, { baseDelayMs: 0 })).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries a transient failure and then succeeds', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('transient'))
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValue('ok');

    await expect(withRetry(fn, { maxRetries: 3, baseDelayMs: 0 })).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('makes one initial attempt plus maxRetries retries, then throws the last error', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('still down'));

    await expect(withRetry(fn, { maxRetries: 2, baseDelayMs: 0 })).rejects.toThrow('still down');
    // 1 initial attempt + 2 retries: an off-by-one here would either give up too
    // early or hammer the RPC one extra time.
    expect(fn).toHaveBeenCalledTimes(3);
  });
});

describe('waitForTransaction', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns as soon as the transaction succeeds', async () => {
    const success = { status: SorobanRpc.Api.GetTransactionStatus.SUCCESS, hash: 'h' };
    vi.spyOn(getRpcClient(), 'getTransaction').mockResolvedValue(success as never);

    await expect(waitForTransaction('h', 3, 0)).resolves.toBe(success);
  });

  it('throws when the transaction failed, including the result XDR', async () => {
    vi.spyOn(getRpcClient(), 'getTransaction').mockResolvedValue({
      status: SorobanRpc.Api.GetTransactionStatus.FAILED,
      resultXdr: 'AAAA',
    } as never);

    await expect(waitForTransaction('h', 3, 0)).rejects.toThrow('Transaction failed: AAAA');
  });

  it('does not poll forever when the transaction never finalizes', async () => {
    const pending = { status: SorobanRpc.Api.GetTransactionStatus.NOT_FOUND };
    const spy = vi.spyOn(getRpcClient(), 'getTransaction').mockResolvedValue(pending as never);

    await expect(waitForTransaction('abc', 3, 0)).rejects.toThrow(/not finalized after 3 attempts/);
    expect(spy).toHaveBeenCalledTimes(3);
  });
});
