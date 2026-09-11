import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guards the dependency security pins.
 *
 * The root package.json declares `pnpm.overrides` that raise five transitive
 * packages above their first patched release. pnpm 9 emits a deprecation warning
 * for that field ("no longer read by pnpm") even though it still honours it;
 * pnpm 10 drops it entirely. Without a guard, a routine pnpm or Node upgrade
 * would silently remove the pins on the next lockfile regeneration and no test
 * would notice — the install would simply start resolving vulnerable versions
 * again.
 *
 * So this asserts both halves of the guarantee: the overrides are declared, and
 * the lockfile actually resolves every occurrence at or above the patched floor.
 */

const APP_DIR = resolve(__dirname, '../../..');
const REPO_ROOT = resolve(APP_DIR, '../..');

/** Package -> first patched release. Mirrors `pnpm.overrides` in package.json. */
const PATCHED_FLOOR: Record<string, string> = {
  nanoid: '3.3.18',
  'js-yaml': '4.3.2',
  postcss: '8.5.23',
  sharp: '0.35.4',
  toml: '4.3.0',
};

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function rootPackageJson(): Record<string, unknown> {
  return JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'));
}

function lockfile(): string {
  return readFileSync(join(REPO_ROOT, 'pnpm-lock.yaml'), 'utf8');
}

/** Every version of `name` that the lockfile resolves, from `name@x.y.z:` keys. */
function resolvedVersions(lock: string, name: string): string[] {
  const pattern = new RegExp(`^  ${name}@(\\d+\\.\\d+\\.\\d+):`, 'gm');
  return [...lock.matchAll(pattern)].map((m) => m[1]!);
}

describe('dependency security pins', () => {
  it('declares an override for every pinned package', () => {
    const overrides = (rootPackageJson().pnpm as { overrides?: Record<string, string> })?.overrides;
    expect(overrides, 'package.json must declare pnpm.overrides').toBeDefined();

    for (const [name, floor] of Object.entries(PATCHED_FLOOR)) {
      const spec = Object.entries(overrides ?? {}).find(([key]) => key.startsWith(`${name}@`));
      expect(spec, `no override pins ${name}`).toBeDefined();
      expect(
        spec![1].replace(/[\^~]/, ''),
        `override for ${name} must be at least ${floor}`,
      ).toMatch(/\d+\.\d+\.\d+/);
    }
  });

  it('resolves every pinned package at or above its patched release', () => {
    const lock = lockfile();
    for (const [name, floor] of Object.entries(PATCHED_FLOOR)) {
      const versions = resolvedVersions(lock, name);
      expect(versions.length, `${name} is not present in the lockfile`).toBeGreaterThan(0);
      for (const version of versions) {
        expect(
          compareVersions(version, floor),
          `${name}@${version} is below the patched floor ${floor}`,
        ).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('keeps the overrides recorded in the lockfile so installs stay reproducible', () => {
    // A top-level `overrides:` block in the lockfile is what tells pnpm that the
    // resolutions were forced rather than accidentally picked. Its absence means
    // the pins were dropped from whichever file pnpm currently reads.
    expect(lockfile()).toMatch(/^overrides:\n(?: {2}\S.*\n)+/m);
  });
});
