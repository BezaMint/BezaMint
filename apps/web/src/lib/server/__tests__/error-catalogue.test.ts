import { describe, expect, it } from 'vitest';
import { xdr } from '@stellar/stellar-sdk';
import {
  classifyProtocolError,
  ERROR_CODES,
  ERROR_CODES_BY_DOMAIN,
  ERROR_CODE_BY_NAME,
  getErrorCode,
  IGNORED_PROTOCOL_MEMBERS,
  isErrorCode,
  PROTOCOL_ENUM_MEMBERS,
  PROTOCOL_ROWS,
  type ErrorDomain,
  type ProtocolRow,
} from '@bezamint/shared';
import {
  AUTH_FAILURE_CODES,
  CLIENT_FAILURE_CODES,
  CONFIG_FAILURE_CODES,
  DOCUMENT_FAILURE_CODES,
  GATEWAY_FAILURE_CODES,
  INDEXER_FAILURE_CODES,
  PIN_FAILURE_CODES,
} from '@/lib/errors/classify';

const DOMAINS: readonly ErrorDomain[] = [
  'contract',
  'protocol',
  'api',
  'auth',
  'validation',
  'wallet',
  'transaction',
  'ipfs',
  'metadata',
  'indexer',
  'config',
  'ui',
];

describe('the catalogue is internally consistent', () => {
  it('gives every code a unique id and a unique name', () => {
    const ids = ERROR_CODES.map((code) => code.id);
    const names = ERROR_CODES.map((code) => code.name);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(names).size).toBe(names.length);
  });

  it('uses a well-formed identifier per domain', () => {
    for (const code of ERROR_CODES) {
      if (code.domain === 'protocol') continue; // ids are assigned by the table below
      expect(code.id).toMatch(/^BM-[A-Z]+-\d{4}$/);
    }
    for (const [index, code] of ERROR_CODES.filter((c) => c.domain === 'protocol').entries()) {
      expect(code.id).toBe(`BM-PROTOCOL-${String(index + 1).padStart(4, '0')}`);
    }
  });

  it('only carries HTTP statuses that are meaningful', () => {
    for (const code of ERROR_CODES) {
      // 0 means "not an HTTP outcome" — a wallet refusal, a build failure. Any
      // other value must be a real status, or a handler would answer with it.
      expect(code.status === 0 || (code.status >= 400 && code.status < 600)).toBe(true);
    }
  });

  it('declares every code in exactly one domain', () => {
    const seen = ERROR_CODES.map((code) => code.domain);
    for (const domain of seen) expect(DOMAINS).toContain(domain);
    const grouped = Object.values(ERROR_CODES_BY_DOMAIN).flat();
    expect(grouped).toHaveLength(ERROR_CODES.length);
  });

  it('resolves a code by name and rejects an unknown one', () => {
    expect(getErrorCode('BAD_REQUEST')?.status).toBe(400);
    expect(getErrorCode('NOT_A_REAL_CODE')).toBeUndefined();
    expect(isErrorCode('BAD_REQUEST')).toBe(true);
    expect(isErrorCode('NOT_A_REAL_CODE')).toBe(false);
    expect(ERROR_CODE_BY_NAME['BAD_REQUEST']?.domain).toBe('api');
  });
});

describe('the protocol table covers the protocol', () => {
  // This is the check that makes the mapping maintainable: protocol 21 added a
  // transaction result code, and a table written for protocol 20 would have
  // classified it as unknown forever with no signal.
  it.each(Object.entries(PROTOCOL_ENUM_MEMBERS))(
    'classifies or explicitly ignores every %s member',
    (enumName, members) => {
      const sdkMembers = Object.keys(
        (xdr as unknown as Record<string, Record<string, unknown>>)[enumName] ?? {},
      ).filter((key) => !key.startsWith('_') && key !== 'enumName');

      // Guard against the SDK renaming an enum and this test silently passing.
      expect(sdkMembers.length).toBeGreaterThan(0);
      expect([...sdkMembers].sort()).toEqual([...members].sort());

      // Widened: the rows are `as const`, so the union does not expose the
      // optional fields that distinguish a member row from a pattern row.
      const classified = new Set(
        (PROTOCOL_ROWS as readonly ProtocolRow[]).flatMap((row) => [...(row.members ?? [])]),
      );
      for (const member of members) {
        expect(
          classified.has(member) || member in IGNORED_PROTOCOL_MEMBERS,
          `${enumName}.${member} is neither classified nor ignored`,
        ).toBe(true);
      }
    },
  );

  it('maps a result code to the same row in both spellings', () => {
    // Horizon emits snake_case (`tx_bad_seq`); the SDK enums are camelCase
    // (`txBadSeq`). A user can meet either.
    const camel = classifyProtocolError({ transaction: 'txBadSeq' });
    const snake = classifyProtocolError({ transaction: 'tx_bad_seq' });
    expect(camel?.definition.name).toBe('TX_SEQUENCE_STALE');
    expect(snake?.definition.name).toBe('TX_SEQUENCE_STALE');
  });

  it('prefers the operation result over the generic transaction result', () => {
    const classified = classifyProtocolError({
      transaction: 'tx_failed',
      operations: ['op_underfunded'],
    });
    expect(classified?.definition.name).toBe('PAYMENT_UNDERFUNDED');
  });

  it('matches a host error family from the message', () => {
    expect(
      classifyProtocolError({ message: 'Error(Budget, ExceededLimit)' })?.definition.name,
    ).toBe('HOST_BUDGET_EXCEEDED');
  });

  it('returns null rather than guessing when nothing matches', () => {
    expect(classifyProtocolError({ message: 'something else entirely' })).toBeNull();
    expect(classifyProtocolError({})).toBeNull();
  });
});

describe('the condition tables only name codes that exist', () => {
  const tables: readonly [string, Record<string, string>][] = [
    ['gateway', GATEWAY_FAILURE_CODES],
    ['pin', PIN_FAILURE_CODES],
    ['document', DOCUMENT_FAILURE_CODES],
    ['indexer', INDEXER_FAILURE_CODES],
    ['auth', AUTH_FAILURE_CODES],
    ['config', CONFIG_FAILURE_CODES],
    ['client', CLIENT_FAILURE_CODES],
  ];

  it.each(tables)('%s maps every condition to a catalogued code', (_name, table) => {
    for (const [condition, code] of Object.entries(table)) {
      expect(isErrorCode(code), `${condition} -> ${code} is not in the catalogue`).toBe(true);
    }
  });

  it('has no condition mapped to a code in an unrelated domain', () => {
    // A gateway failure answered with `INTERNAL` tells an operator nothing, and
    // that is exactly what these tables exist to prevent.
    for (const code of Object.values(GATEWAY_FAILURE_CODES)) {
      expect(ERROR_CODE_BY_NAME[code]?.domain).toBe('ipfs');
    }
    for (const code of Object.values(INDEXER_FAILURE_CODES)) {
      expect(ERROR_CODE_BY_NAME[code]?.domain).toBe('indexer');
    }
  });
});
