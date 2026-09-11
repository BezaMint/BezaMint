import { describe, expect, it } from 'vitest';

import { toJsonSafe } from '../contractReader';

/**
 * Guards the conversion that keeps on-chain values serializable.
 *
 * `scValToNative` returns a `bigint` for 64- and 128-bit integers, and
 * `JSON.stringify` throws on a `bigint` rather than degrading, so any route that
 * returned a contract struct containing a u64 answered `500 INTERNAL` -- but
 * only once the chain had data, because an empty indexer took an early branch
 * and never called the reader. The route tests mock the reader, so nothing
 * caught it until the endpoints were exercised against a seeded deployment.
 */

/**
 * `tsc` rejects BigInt literal syntax (`6n`) at this project's target, so the
 * fixtures build their bigints explicitly. That constraint is also why the
 * implementation uses `BigInt(...)` rather than literals.
 */
const bi = (value: number | string): bigint => BigInt(value);

describe('toJsonSafe', () => {
  it('leaves primitives alone', () => {
    expect(toJsonSafe('x')).toBe('x');
    expect(toJsonSafe(7)).toBe(7);
    expect(toJsonSafe(true)).toBe(true);
    expect(toJsonSafe(null)).toBeNull();
    expect(toJsonSafe(undefined)).toBeUndefined();
  });

  // The exact failure: `JSON.stringify({ nft_count: 6n })` throws
  // "Do not know how to serialize a BigInt".
  it('converts a safe bigint to a number so the result serializes', () => {
    const value = toJsonSafe({ nft_count: bi(6), created_at: bi(1789143512) });
    expect(value).toEqual({ nft_count: 6, created_at: 1789143512 });
    expect(() => JSON.stringify(value)).not.toThrow();
  });

  it('keeps a bigint beyond the safe range as a decimal string instead of rounding it', () => {
    const beyond = bi(Number.MAX_SAFE_INTEGER) + bi(2);
    const result = toJsonSafe({ total: beyond });
    expect(result).toEqual({ total: beyond.toString() });
    // The point of the string: no digits are lost.
    expect((result as { total: string }).total).toBe('9007199254740993');
  });

  it('converts negative bigints symmetrically', () => {
    expect(toJsonSafe(bi(-5))).toBe(-5);
    expect(toJsonSafe(-(bi(Number.MAX_SAFE_INTEGER) + bi(1)))).toBe('-9007199254740992');
  });

  it('walks nested objects and arrays', () => {
    const value = toJsonSafe({
      id: bi(3),
      tokens: [{ token_id: bi(1) }, { token_id: bi(2) }],
      nested: { deep: { minted_at: bi(9) } },
    });
    expect(value).toEqual({
      id: 3,
      tokens: [{ token_id: 1 }, { token_id: 2 }],
      nested: { deep: { minted_at: 9 } },
    });
    expect(() => JSON.stringify(value)).not.toThrow();
  });

  // A royalty config's `recipients` decodes to a Map, which also does not
  // survive JSON.stringify.
  it('converts a Map to a plain object and a Set to an array', () => {
    const recipients = new Map<string, unknown>([
      ['GAAA', { share: bi(60) }],
      ['GBBB', { share: bi(40) }],
    ]);
    expect(toJsonSafe(recipients)).toEqual({ GAAA: { share: 60 }, GBBB: { share: 40 } });
    expect(toJsonSafe(new Set([bi(1), bi(2)]))).toEqual([1, 2]);
    expect(() => JSON.stringify(toJsonSafe(recipients))).not.toThrow();
  });

  it('produces output that round-trips through JSON unchanged', () => {
    const value = toJsonSafe({ id: bi(1), uri: 'ipfs://x', flags: [bi(1), true] });
    expect(JSON.parse(JSON.stringify(value))).toEqual(value);
  });
});
