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

  it('falls back to defaults for garbage input', () => {
    expect(parsePagination(new URLSearchParams('limit=abc&offset=-3'))).toEqual({
      limit: 20,
      offset: 0,
    });
    expect(parsePagination(new URLSearchParams('limit=0'))).toEqual({ limit: 20, offset: 0 });
  });
});
