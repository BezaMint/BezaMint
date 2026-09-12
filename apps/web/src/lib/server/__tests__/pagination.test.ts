import { describe, it, expect } from 'vitest';
import { parsePagination } from '@/lib/server/pagination';

describe('parsePagination', () => {
  it('applies defaults', () => {
    expect(parsePagination(new URLSearchParams(''))).toEqual({ limit: 20, offset: 0 });
  });

  it('parses valid values', () => {
    expect(parsePagination(new URLSearchParams('limit=10&offset=5'))).toEqual({
      limit: 10,
      offset: 5,
    });
  });

  it('clamps limit to a maximum of 50', () => {
    expect(parsePagination(new URLSearchParams('limit=9999'))).toEqual({
      limit: 50,
      offset: 0,
    });
  });

  it('leaves an offset above the limit untouched', () => {
    expect(parsePagination(new URLSearchParams('offset=500'))).toEqual({ limit: 20, offset: 500 });
  });

  it('falls back to the default for a non-positive value', () => {
    // Documented, and the reason is the RPC fan-out argument above: a caller
    // asking for `limit=0` gets a normal page rather than an empty one.
    expect(parsePagination(new URLSearchParams('limit=0'))).toEqual({ limit: 20, offset: 0 });
  });

  it('names a limit that is not an integer instead of defaulting it', () => {
    // `limit=abc` is a client that built the query wrong. It used to be
    // answered with a default page, so the mistake was invisible.
    expect(() => parsePagination(new URLSearchParams('limit=abc'))).toThrowError(
      /limit must be an integer/,
    );
    expect(() => parsePagination(new URLSearchParams('limit=2.5'))).toThrowError(
      /limit must be an integer/,
    );
  });

  it('names a negative offset', () => {
    expect(() => parsePagination(new URLSearchParams('offset=-3'))).toThrowError(
      /offset must not be negative/,
    );
  });

  it('carries the catalogue code for each rejection', () => {
    const codeOf = (query: string) => {
      try {
        parsePagination(new URLSearchParams(query));
      } catch (err) {
        return (err as { code?: string }).code;
      }
      return undefined;
    };

    expect(codeOf('limit=abc')).toBe('PARAMETER_NOT_INTEGER');
    expect(codeOf('offset=-3')).toBe('PARAMETER_NEGATIVE');
  });

  it('honours custom defaults', () => {
    expect(parsePagination(new URLSearchParams(''), { limit: 10, offset: 0 })).toEqual({
      limit: 10,
      offset: 0,
    });
  });
});
