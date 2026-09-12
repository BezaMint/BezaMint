import { describe, expect, it } from 'vitest';

import {
  CONTRACT_ERRORS,
  CONTRACT_ERROR_CODE_COUNT,
  CONTRACT_NAMES,
  describeContractError,
} from '@/lib/contractErrors';
import { parseContractError, normalizeError, type ContractErrorDetails } from '@/lib/server/errors';
import { contractNameForId } from '@/lib/server/contractReader';

/**
 * The contracts raise typed numeric codes, and the host reports them as
 * `Error(Contract, #12)` — an integer with no name attached. These tests pin the
 * decode that turns that integer back into something a caller can branch on, and
 * the catalog it decodes against.
 *
 * The regression they guard is not hypothetical: `normalizeError` matched its
 * contract heuristics case-sensitively against `'host error'`, so the real host
 * spelling `HostError: Error(Contract, #N)` matched nothing and a contract
 * failure was reported to users as an opaque `500 INTERNAL`.
 */

/** Pull `details.contractError` out of a normalized error, typed. */
function decoded(err: unknown, contract?: (typeof CONTRACT_NAMES)[number]): ContractErrorDetails {
  const result = normalizeError(err, contract ? { contract } : {});
  const details = result.details as { contractError?: ContractErrorDetails } | undefined;
  if (!details?.contractError) throw new Error('expected a decoded contract error');
  return details.contractError;
}

describe('the generated error catalog', () => {
  it('covers every contract', () => {
    expect(Object.keys(CONTRACT_ERRORS).sort()).toEqual([...CONTRACT_NAMES].sort());
  });

  it('reports the same total it contains', () => {
    const counted = CONTRACT_NAMES.reduce(
      (sum, name) => sum + Object.keys(CONTRACT_ERRORS[name]).length,
      0,
    );
    expect(counted).toBe(CONTRACT_ERROR_CODE_COUNT);
  });

  it('numbers codes contiguously from 1 in every contract', () => {
    for (const name of CONTRACT_NAMES) {
      const codes = Object.keys(CONTRACT_ERRORS[name])
        .map(Number)
        .sort((a, b) => a - b);
      expect(codes, `${name} should start at 1`).toEqual(codes.map((_, index) => index + 1));
    }
  });

  it('gives every code a variant name, a meaning and a raise site', () => {
    for (const name of CONTRACT_NAMES) {
      for (const [code, descriptor] of Object.entries(CONTRACT_ERRORS[name])) {
        expect(descriptor.variant, `${name} #${code} variant`).toBeTruthy();
        expect(descriptor.meaning, `${name} #${code} meaning`).toBeTruthy();
        // A code with no raise site would be unreachable, which is the padding
        // this catalog is meant to make impossible.
        expect(descriptor.raisedBy.length, `${name} #${code} raisedBy`).toBeGreaterThan(0);
      }
    }
  });

  it('describes a known code and degrades on an unknown one', () => {
    const known = describeContractError('royalty', 12);
    expect(known?.variant).toBe('SharesMustSumToTotal');

    // Deployed ahead of the web app, or a code that never existed. The lookup
    // returns null rather than throwing; the caller still has the number.
    expect(describeContractError('royalty', 999)).toBeNull();
  });
});

describe('parseContractError', () => {
  it('decodes the canonical host shape against the owning contract', () => {
    const parsed = parseContractError('HostError: Error(Contract, #12)', { contract: 'royalty' });
    expect(parsed).toMatchObject({
      code: 12,
      contract: 'royalty',
      variant: 'SharesMustSumToTotal',
    });
    expect(parsed?.meaning).toContain('sum');
  });

  it('numbers are contract-specific, so the same integer decodes differently', () => {
    const nft = parseContractError('Error(Contract, #12)', { contract: 'nft' });
    const royalty = parseContractError('Error(Contract, #12)', { contract: 'royalty' });
    expect(nft?.variant).toBe('FromIsNotOwner');
    expect(royalty?.variant).toBe('SharesMustSumToTotal');
  });

  it('reports the code but no name when the contract is unknown', () => {
    const parsed = parseContractError('HostError: Error(Contract, #10)');
    expect(parsed).toEqual({
      code: 10,
      contract: null,
      variant: null,
      meaning: null,
      descriptor: null,
    });
  });

  it('degrades on a code the catalog does not know, rather than throwing', () => {
    expect(() => parseContractError('Error(Contract, #4242)', { contract: 'nft' })).not.toThrow();
    const parsed = parseContractError('Error(Contract, #4242)', { contract: 'nft' });
    expect(parsed?.code).toBe(4242);
    expect(parsed?.variant).toBeNull();
  });

  it('reads the error out of an SDK-style envelope and a wrapped Error', () => {
    expect(
      parseContractError(
        { code: -32000, message: 'HostError: Error(Contract, #5)' },
        {
          contract: 'nft',
        },
      )?.variant,
    ).toBe('MetadataUriEmpty');

    expect(
      parseContractError(new Error('Error(Contract, #1)'), { contract: 'collection' })?.variant,
    ).toBe('NotInitialized');
  });

  it('returns null when there is no numeric contract code', () => {
    expect(parseContractError(new Error('something else entirely'))).toBeNull();
    expect(parseContractError(new Error('Error(Contract, #)'))).toBeNull();
    // A host error that is not a contract error carries no code to decode.
    expect(parseContractError(new Error('HostError: Error(WasmVm, InvalidAction)'))).toBeNull();
  });
});

describe('normalizeError with contract context', () => {
  it('classifies a real host contract error as CONTRACT_ERROR, not INTERNAL', () => {
    // Case-sensitivity bug: `HostError` never matched `'host error'`, so this
    // exact string used to normalize to 500 INTERNAL.
    const result = normalizeError(new Error('HostError: Error(Contract, #10)'), {
      contract: 'nft',
    });
    expect(result.code).toBe('CONTRACT_ERROR');
    expect(result.status).toBe(422);
    expect(decoded(new Error('HostError: Error(Contract, #10)'), 'nft')).toMatchObject({
      code: 10,
      variant: 'TokenNotFound',
    });
  });

  it('still classifies a contract panic that carries no numeric code', () => {
    const result = normalizeError(new Error('host error: contract panicked'));
    expect(result.code).toBe('CONTRACT_ERROR');
    expect(result.status).toBe(422);
    const details = result.details as { contractError?: unknown };
    expect(details.contractError).toBeUndefined();
  });

  it('keeps the serialized envelope shape stable', () => {
    const json = normalizeError(new Error('Error(Contract, #9)'), { contract: 'nft' }).toJson();
    expect(json.error.code).toBe('CONTRACT_ERROR');
    expect(json.error.message).toBe('Contract call failed');
    expect(
      (json.error.details as { contractError: ContractErrorDetails }).contractError,
    ).toMatchObject({ code: 9, contract: 'nft', variant: 'MaxSupplyReached' });
  });

  it('leaves unrelated failures untouched', () => {
    expect(normalizeError(new Error('boom')).code).toBe('INTERNAL');
  });
});

describe('contractNameForId', () => {
  it('returns null for an unset or unknown id', () => {
    expect(contractNameForId('')).toBeNull();
    expect(
      contractNameForId('CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM'),
    ).toBeNull();
  });
});
