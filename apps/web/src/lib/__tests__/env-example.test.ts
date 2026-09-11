import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guards against environment drift.
 *
 * `.env.example` is the only description of the configuration a deployment
 * needs, and a variable that the code reads but the example never mentions is
 * invisible until something fails in production. This walks the source tree for
 * every `process.env.FOO` reference and requires each one to be either
 * documented in `.env.example` or listed below as provided by the platform.
 */

const APP_DIR = resolve(__dirname, '../../..');
const REPO_ROOT = resolve(APP_DIR, '../..');

/**
 * Variables set by the CI or hosting platform rather than by the operator, so
 * they must not appear in `.env.example`.
 */
const PLATFORM_PROVIDED = new Set([
  'NODE_ENV',
  'COMMIT_SHA',
  'RENDER_GIT_COMMIT',
  'VERCEL_GIT_COMMIT_SHA',
  'NEXT_PUBLIC_VERCEL_ANALYTICS_ID',
]);

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === '__tests__' || entry === 'node_modules') continue;
      out.push(...sourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

function readReferencedVars(): Set<string> {
  const found = new Set<string>();
  const roots = [join(APP_DIR, 'src'), resolve(REPO_ROOT, 'packages/shared/src')];
  for (const root of roots) {
    for (const file of sourceFiles(root)) {
      const contents = readFileSync(file, 'utf8');
      for (const match of contents.matchAll(/process\.env\.([A-Z0-9_]+)/g)) {
        const key = match[1];
        if (key) found.add(key);
      }
    }
  }
  return found;
}

function readDocumentedVars(): Set<string> {
  const contents = readFileSync(join(REPO_ROOT, '.env.example'), 'utf8');
  const found = new Set<string>();
  for (const line of contents.split('\n')) {
    const match = /^([A-Z0-9_]+)=/.exec(line.trim());
    if (match?.[1]) found.add(match[1]);
  }
  return found;
}

describe('.env.example', () => {
  const referenced = readReferencedVars();
  const documented = readDocumentedVars();

  it('documents every environment variable the app reads', () => {
    const undocumented = [...referenced]
      .filter((key) => !documented.has(key) && !PLATFORM_PROVIDED.has(key))
      .sort();

    expect(undocumented).toEqual([]);
  });

  it('does not document variables the app never reads', () => {
    const unused = [...documented].filter((key) => !referenced.has(key)).sort();

    expect(unused).toEqual([]);
  });

  it('lists the platform-provided variables nowhere in the example file', () => {
    const leaked = [...PLATFORM_PROVIDED].filter((key) => documented.has(key)).sort();

    expect(leaked).toEqual([]);
  });
});
