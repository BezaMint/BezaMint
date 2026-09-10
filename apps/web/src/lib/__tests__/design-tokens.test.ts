import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Enforces the design-tokens rule: components must reference the theme tokens
 * (bg-bezamint-*, text-bezamint-*, border-bezamint-*) rather than arbitrary
 * raw hex values in className. Arbitrary values like bg-[#123456] make the
 * palette drift and break the light theme.
 */
const SRC_ROOT = join(__dirname, '..', '..');

function collectTsxFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === '__tests__' || entry === 'node_modules' || entry === '.next') continue;
      collectTsxFiles(full, acc);
    } else if (entry.endsWith('.tsx')) {
      acc.push(full);
    }
  }
  return acc;
}

const HEX_ARBITRARY_VALUE = /(?:bg|text|border|fill|stroke|ring|from|to|via)-\[#/;

describe('design tokens', () => {
  const files = collectTsxFiles(SRC_ROOT);

  it('finds component files to scan', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('bans raw hex arbitrary values in component classNames', () => {
    const violations: string[] = [];

    for (const file of files) {
      const content = readFileSync(file, 'utf8');
      if (content.includes('className') && HEX_ARBITRARY_VALUE.test(content)) {
        violations.push(file);
      }
    }

    expect(violations).toEqual([]);
  });
});
