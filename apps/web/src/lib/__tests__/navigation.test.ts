import { describe, it, expect } from 'vitest';
import { NAV_ITEMS } from '@/lib/navigation';

describe('NAV_ITEMS', () => {
  it('has expected number of items', () => {
    expect(NAV_ITEMS.length).toBeGreaterThanOrEqual(5);
  });
  it('each item has required fields', () => {
    for (const item of NAV_ITEMS) {
      expect(item.href).toBeTruthy();
      expect(item.label).toBeTruthy();
      expect(item.icon).toBeTruthy();
    }
  });
  it('all hrefs start with /', () => {
    for (const item of NAV_ITEMS) {
      expect(item.href.startsWith('/')).toBe(true);
    }
  });
});
