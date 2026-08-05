import { describe, it, expect, vi } from 'vitest';
import { formatRelativeTime } from '@/lib/formatTime';

describe('formatRelativeTime', () => {
  it('returns just now for recent times', () => {
    expect(formatRelativeTime(Date.now())).toBe('just now');
  });
  it('returns minutes ago', () => {
    const d = Date.now() - 5 * 60 * 1000;
    expect(formatRelativeTime(d)).toBe('5m ago');
  });
  it('returns hours ago', () => {
    const d = Date.now() - 3 * 60 * 60 * 1000;
    expect(formatRelativeTime(d)).toBe('3h ago');
  });
});
