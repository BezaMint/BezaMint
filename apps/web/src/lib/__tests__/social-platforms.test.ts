import { describe, it, expect } from 'vitest';
import { SOCIAL_PLATFORMS } from '@/lib/socialPlatforms';

describe('SOCIAL_PLATFORMS', () => {
  it('returns array of platforms', () => {
    expect(Array.isArray(SOCIAL_PLATFORMS)).toBe(true);
    expect(SOCIAL_PLATFORMS.length).toBeGreaterThan(0);
  });
  it('each platform has value and label', () => {
    for (const p of SOCIAL_PLATFORMS) {
      expect(p.value).toBeTruthy();
      expect(p.label).toBeTruthy();
    }
  });
});
