#!/usr/bin/env node
/**
 * Generate the demo metadata and artwork used to seed a testnet deployment.
 *
 * Why this exists
 * ---------------
 * A testnet deployment with zero mints is indistinguishable from a broken one.
 * Seeding real activity needs tokens whose `metadata_uri` actually resolves, and
 * pinning to IPFS needs a Pinata credential that a fresh clone or a reviewer does
 * not have. So the demo tokens point at files committed to this repository, served
 * by `raw.githubusercontent.com`, which needs no key and no third party.
 *
 * Those files are generated rather than hand-written so that eighteen token
 * documents and eighteen pieces of art stay internally consistent: every token's
 * `imageUri` is derived from its own name, so a rename cannot leave a token
 * pointing at another token's art.
 *
 * Inputs are a fixed table and a seeded PRNG, so output is byte-for-byte
 * reproducible. Running this twice produces no diff, which is what lets CI (and a
 * reviewer) treat the committed output as generated-but-verified rather than
 * opaque.
 *
 *   node scripts/generate-demo-metadata.mjs          # write
 *   node scripts/generate-demo-metadata.mjs --check  # verify committed output is current
 */

import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Where the seeded `metadata_uri` values point. Committed files, no CDN, no key.
 * Changing the branch or the repository name invalidates every already-seeded
 * on-chain URI, and on-chain URIs cannot be rewritten.
 */
const RAW_BASE = 'https://raw.githubusercontent.com/BezaMint/BezaMint/main';

const NETWORK_LABEL = 'Stellar Testnet';

/**
 * The seeding plan. `royalties` is basis points and is written into both the
 * collection document and the on-chain `configure_royalty` call, so the displayed
 * figure and the enforced figure cannot drift.
 */
const COLLECTIONS = [
  {
    slug: '01-stellar-drift',
    name: 'Stellar Drift',
    pieces: 6,
    royalties: 250,
    palette: ['#04121f', '#0f3b63', '#2a7fb8', '#7fd4f0', '#e8fbff'],
    motif: 'drift',
    description:
      'A six-piece generative set in cool blues, seeded on Stellar testnet so the deployed platform carries real, verifiable on-chain activity instead of an empty index.',
  },
  {
    slug: '02-soroban-signals',
    name: 'Soroban Signals',
    pieces: 6,
    royalties: 500,
    palette: ['#150826', '#3d1361', '#7a2bb5', '#c169f0', '#f6e6ff'],
    motif: 'signal',
    description:
      'Six signals broadcast by the BezaMint factory, one per token, minted through the atomic batch path to exercise it end to end on Stellar testnet.',
  },
  {
    slug: '03-testnet-terrain',
    name: 'Testnet Terrain',
    pieces: 6,
    royalties: 750,
    palette: ['#06170f', '#0d4530', '#1a8a5c', '#5fd6a0', '#e8fff5'],
    motif: 'terrain',
    description:
      'Six contour studies minted in a single invocation, demonstrating that a drop is one transaction rather than six. Seeded on Stellar testnet with a 7.5% royalty.',
  },
];

/** Deterministic PRNG (mulberry32). No `Math.random`, so output is reproducible. */
function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable string hash, so a token's art seed depends only on its own name. */
function hashString(value) {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function escapeXml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const SIZE = 512;
const round = (n) => Math.round(n * 100) / 100;

/**
 * Draw one deterministic piece. Same `(collection, piece)` always yields the same
 * bytes: the committed SVG is the artwork, not a cached render of random input.
 */
function renderArt(collection, piece) {
  const next = prng(hashString(`${collection.slug}#${piece}`));
  const [c0, c1, c2, c3, c4] = collection.palette;
  const layers = [];

  layers.push(
    `<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">` +
      `<stop offset="0" stop-color="${c0}"/><stop offset="1" stop-color="${c1}"/>` +
      `</linearGradient></defs>`,
    `<rect width="${SIZE}" height="${SIZE}" fill="url(#bg)"/>`,
  );

  if (collection.motif === 'drift') {
    // Horizontal bands of varying height settle like sediment.
    let y = 40 + next() * 60;
    while (y < SIZE) {
      const height = 6 + next() * 46;
      const alpha = round(0.12 + next() * 0.5);
      const fill = next() > 0.5 ? c2 : c3;
      layers.push(
        `<rect x="0" y="${round(y)}" width="${SIZE}" height="${round(height)}" ` +
          `fill="${fill}" opacity="${alpha}"/>`,
      );
      y += height + 8 + next() * 26;
    }
    for (let i = 0; i < 9; i += 1) {
      layers.push(
        `<circle cx="${round(next() * SIZE)}" cy="${round(next() * SIZE)}" r="${round(2 + next() * 14)}" fill="${c4}" opacity="${round(
          0.12 + next() * 0.45,
        )}"/>`,
      );
    }
  } else if (collection.motif === 'signal') {
    // Concentric rings radiating from a slightly off-centre emitter.
    const cx = round(SIZE * (0.35 + next() * 0.3));
    const cy = round(SIZE * (0.35 + next() * 0.3));
    for (let i = 12; i > 0; i -= 1) {
      layers.push(
        `<circle cx="${cx}" cy="${cy}" r="${round(i * (10 + next() * 18))}" fill="none" ` +
          `stroke="${i % 2 ? c2 : c3}" stroke-width="${round(1 + next() * 4)}" ` +
          `opacity="${round(0.15 + next() * 0.5)}"/>`,
      );
    }
    for (let i = 0; i < 5; i += 1) {
      const x = round(next() * SIZE);
      const y = round(next() * SIZE);
      layers.push(
        `<rect x="${x}" y="${y}" width="${round(20 + next() * 90)}" height="${round(
          1 + next() * 3,
        )}" fill="${c4}" opacity="${round(0.2 + next() * 0.5)}"/>`,
      );
    }
  } else {
    // Contour lines: a stepped diagonal field.
    let offset = -SIZE + next() * 80;
    while (offset < SIZE) {
      const step = round(18 + next() * 40);
      const depth = round(SIZE * (0.2 + next() * 0.5));
      layers.push(
        `<path d="M${round(offset)} 0 L${round(offset + depth)} ${SIZE}" ` +
          `stroke="${next() > 0.5 ? c2 : c3}" stroke-width="${round(1 + next() * 6)}" ` +
          `fill="none" opacity="${round(0.15 + next() * 0.55)}"/>`,
      );
      offset += step;
    }
    for (let i = 0; i < 4; i += 1) {
      layers.push(
        `<circle cx="${round(next() * SIZE)}" cy="${round(next() * SIZE)}" r="${round(6 + next() * 30)}" ` +
          `fill="none" stroke="${c4}" stroke-width="${round(1 + next() * 2)}" opacity="${round(
            0.2 + next() * 0.4,
          )}"/>`,
      );
    }
  }

  const label = `${collection.name} #${String(piece).padStart(2, '0')}`;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}" role="img" aria-label="${escapeXml(
      label,
    )}">`,
    `  <title>${escapeXml(label)}</title>`,
    ...layers.map((layer) => `  ${layer}`),
    `  <rect x="0" y="${SIZE - 3}" width="${SIZE}" height="3" fill="${c4}" opacity="0.7"/>`,
    `</svg>`,
    '',
  ].join('\n');
}

/** Build every output file as `[relativePath, contents]`, in a stable order. */
function buildAll() {
  const files = [];

  for (const collection of COLLECTIONS) {
    files.push([
      `demo/metadata/collections/${collection.slug}.json`,
      `${JSON.stringify(
        {
          name: collection.name,
          description: collection.description,
          imageUri: `${RAW_BASE}/demo/art/${collection.slug}-01.svg`,
          externalUrl: 'https://github.com/BezaMint/BezaMint',
          royalties: collection.royalties,
          attributes: [
            { traitType: 'Collection', value: collection.name },
            { traitType: 'Network', value: NETWORK_LABEL },
            { traitType: 'Royalty', value: `${collection.royalties / 100}%` },
            { traitType: 'Pieces', value: String(collection.pieces), displayType: 'number' },
          ],
        },
        null,
        2,
      )}\n`,
    ]);

    for (let piece = 1; piece <= collection.pieces; piece += 1) {
      const id = String(piece).padStart(2, '0');
      const artPath = `demo/art/${collection.slug}-${id}.svg`;

      files.push([artPath, renderArt(collection, piece)]);
      files.push([
        `demo/metadata/tokens/${collection.slug}-${id}.json`,
        `${JSON.stringify(
          {
            name: `${collection.name} #${id}`,
            description: `${collection.description} Piece ${piece} of ${collection.pieces}.`,
            imageUri: `${RAW_BASE}/${artPath}`,
            externalUrl: 'https://github.com/BezaMint/BezaMint',
            collectionId: collection.slug,
            royalties: collection.royalties,
            attributes: [
              { traitType: 'Collection', value: collection.name },
              { traitType: 'Piece', value: String(piece), displayType: 'number' },
              { traitType: 'Motif', value: collection.motif },
              { traitType: 'Network', value: NETWORK_LABEL },
            ],
          },
          null,
          2,
        )}\n`,
      ]);
    }
  }

  return files;
}

function main() {
  const check = process.argv.includes('--check');
  const files = buildAll();
  const stale = [];

  for (const [relativePath, contents] of files) {
    const absolute = join(ROOT, relativePath);
    if (check) {
      const current = existsSync(absolute) ? readFileSync(absolute, 'utf8') : null;
      if (current !== contents) {
        stale.push(relativePath);
      }
      continue;
    }
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, contents);
  }

  if (check) {
    if (stale.length > 0) {
      console.error('Demo metadata is out of date; run `pnpm demo:metadata`:\n');
      for (const path of stale) {
        console.error(`  ${path}`);
      }
      process.exit(1);
    }
    console.log(`Demo metadata is current (${files.length} files).`);
    return;
  }

  console.log(`Wrote ${files.length} demo files.`);
}

// Keep the generated tree free of files this script no longer produces, so a
// rename does not leave an orphaned URI behind that a reviewer might click.
function pruneOrphans() {
  const expected = new Set(buildAll().map(([path]) => path));
  for (const dir of ['demo/metadata/collections', 'demo/metadata/tokens', 'demo/art']) {
    const absolute = join(ROOT, dir);
    if (!existsSync(absolute)) continue;
    for (const entry of readdirSync(absolute)) {
      const relative = `${dir}/${entry}`;
      if (!expected.has(relative)) {
        rmSync(join(ROOT, relative));
        console.log(`Removed orphaned ${relative}`);
      }
    }
  }
}

if (!process.argv.includes('--check')) {
  pruneOrphans();
}

main();
