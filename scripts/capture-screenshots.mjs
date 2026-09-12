// Capture the deployed app for the README screenshot set and the pitch video.
//
// Runs against the hosted instance rather than a local build on purpose: the
// claim being demonstrated is that the deployed app works, so the shots have to
// come from the deployed app. It waits for network idle and for the app's own
// skeleton placeholders to clear, because a screenshot of a loading skeleton
// proves nothing.
//
// A Freighter-shaped `window.stellar` is injected before the app boots, along
// with the session the app restores on mount, so the authenticated views render
// real testnet data instead of a "connect your wallet" prompt. Only the wallet
// extension's API is stubbed: every pixel still comes from the deployed app and
// the live chain. The alternative -- a browser with the real extension and a
// funded key -- cannot run headless, and its absence is why an earlier capture
// of the search page was byte-identical to the empty state next to it.
//
// Usage:
//   node scripts/capture-screenshots.mjs
//   BASE_URL=http://localhost:3000 node scripts/capture-screenshots.mjs
//   ONLY=05-mint DEVICES=desktop node scripts/capture-screenshots.mjs   # one page
//
// Playwright is not a project dependency -- it is a ~50 MB download with browser
// binaries that only this script needs, so it is resolved from wherever it is
// installed. Point PLAYWRIGHT_MODULE at a package path if it lives outside the
// project tree:
//   PLAYWRIGHT_MODULE=/tmp/pw/node_modules/playwright/index.js \
//     node scripts/capture-screenshots.mjs
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const playwrightModule = process.env.PLAYWRIGHT_MODULE ?? 'playwright';
const imported = await import(playwrightModule);
// playwright is CommonJS, so a direct import of its entry file lands the
// exports on `default` rather than hoisting `chromium` to the namespace.
const { chromium } = imported.chromium ? imported : imported.default;

const BASE = process.env.BASE_URL ?? 'https://bezamint.vercel.app';
const OUT = process.env.OUT_DIR ?? 'screenshots/latest';

const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };

// A creator address and ids that exist on the live instance, so the detail
// pages render real data instead of a not-found shell. All overridable because
// the testnet set is periodically redeployed.
const CREATOR =
  process.env.SAMPLE_CREATOR ?? 'GDDTJU3ON5QFT7UZIERA4S4OITCDKZUPXS6GI7HC6OPCBDYVVP3UMRQF';
const TOKEN_ID = process.env.SAMPLE_TOKEN ?? '13';
const COLLECTION_ID = process.env.SAMPLE_COLLECTION ?? '3';
// The explore search accepts a full Stellar address or a numeric id, and reads
// nothing else -- it queries the contracts directly rather than the `/api/search`
// route, so an address prefix or a name finds nothing. A full address is what
// returns a mixed set: the creator and every collection they own.
const SEARCH_QUERY = process.env.SAMPLE_SEARCH ?? CREATOR;

// A full run takes several minutes: each page is given time to load its real
// data, and a throttled IPFS gateway can add a wait to every card. Both filters
// exist so a re-shoot after a single page changes does not have to repeat the
// whole set.
const DEVICES = (process.env.DEVICES ?? 'desktop,mobile').split(',').map((d) => d.trim());
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',').map((n) => n.trim())) : null;

/** Pages worth showing, with the name the file gets. */
const PAGES = [
  { path: '/', name: '01-landing' },
  { path: '/dashboard', name: '02-dashboard' },
  { path: '/collections', name: '03-collections' },
  { path: '/collections/:collection', name: '04-collection-detail' },
  { path: '/mint', name: '05-mint' },
  { path: '/explore', name: '06-explore' },
  { path: '/explore', name: '07-explore-search', search: SEARCH_QUERY },
  { path: '/nft/:token', name: '08-nft-detail' },
  { path: '/verify', name: '09-verify' },
  { path: '/creators/:creator', name: '10-creator-profile' },
  { path: '/profile', name: '11-profile' },
  { path: '/settings', name: '12-settings' },
];

function resolvePath(path) {
  return path
    .replace(':collection', encodeURIComponent(COLLECTION_ID))
    .replace(':token', encodeURIComponent(TOKEN_ID))
    .replace(':creator', encodeURIComponent(CREATOR));
}

/**
 * Present the wallet the app expects, before any of its code runs.
 *
 * `lib/freighter.ts` reads `window.stellar`, and `WalletContext` restores a
 * session from localStorage when the extension reports the same address, which
 * is what makes a reload stay connected. Reproducing both is what puts the app
 * in the state a real visitor is in.
 */
async function connectWallet(page) {
  await page.addInitScript(
    ({ address }) => {
      window.stellar = {
        isConnected: () => true,
        requestAccess: async () => true,
        getPublicKey: async () => address,
        getNetwork: async () => 'TESTNET',
        // Nothing in this set mutates, so a signing request is a bug in the
        // capture rather than a step to stub out silently.
        signTransaction: async () => {
          throw new Error('capture attempted to sign a transaction');
        },
        onAccountChanged: () => () => {},
      };
      try {
        localStorage.setItem(
          'bezamint_wallet_session',
          JSON.stringify({ address, network: 'testnet', savedAt: Date.now() }),
        );
      } catch {
        // localStorage may be unavailable; the session is an optimisation.
      }
    },
    { address: CREATOR },
  );
}

async function settle(page) {
  // `networkidle` never fires against this app -- the dashboard polls its summary
  // endpoint, so "no requests for 500ms" is not a state it reaches. `load` plus
  // an explicit wait for the skeleton placeholders to clear is the honest
  // signal that there is real content on screen.
  await page.waitForLoadState('load', { timeout: 30000 }).catch(() => {});
  // Skeletons carry this class in the app; give them a beat to be replaced.
  await page
    .waitForFunction(() => !document.querySelector('[class*="animate-pulse"]'), { timeout: 15000 })
    .catch(() => {});
  await page.waitForTimeout(1200);
  // Freeze animation so no two captures of the same page differ by a spinner.
  await page.addStyleTag({
    content:
      '*,*::before,*::after{animation-play-state:paused!important;transition:none!important}',
  });
}

/**
 * Run a search the way a visitor does: type into the box and submit.
 *
 * The explore page reads no query parameter, so a URL cannot express this, and
 * the results only exist once the component has run the query -- which is why an
 * earlier version of this script produced a search screenshot identical to the
 * page it sat next to.
 */
async function search(page, query) {
  const input = page.locator('input[placeholder^="Search NFTs"]').first();
  await input.waitFor({ state: 'visible', timeout: 15000 });
  await input.click();
  await input.fill(query);
  await input.press('Enter');
}

const browser = await chromium.launch();
const results = [];

for (const device of DEVICES) {
  const context = await browser.newContext({
    viewport: device === 'desktop' ? DESKTOP : MOBILE,
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  await connectWallet(page);

  for (const { path, name, search: query } of PAGES) {
    if (ONLY && !ONLY.has(name)) continue;
    await mkdir(OUT, { recursive: true });
    const url = `${BASE}${resolvePath(path)}`;
    try {
      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      const status = response?.status() ?? 0;
      if (query !== undefined) await search(page, query);
      await settle(page);

      const file = `${OUT}/${name}-${device}.png`;
      const buffer = await page.screenshot({ fullPage: false });
      await writeFile(file, buffer);
      results.push({ file, status, digest: createHash('sha256').update(buffer).digest('hex') });
      console.log(`${status} ${file}`);
    } catch (err) {
      results.push({ file: `${name}-${device}`, status: 0, error: err.message });
      console.log(`FAIL ${url}: ${err.message}`);
    }
  }

  await context.close();
}

await browser.close();

const problems = [];

const failed = results.filter((r) => r.status >= 400 || r.error);
if (failed.length) {
  problems.push(
    `${failed.length} capture(s) did not return a 2xx:\n` +
      failed.map((f) => `  ${f.status} ${f.file}${f.error ? ` — ${f.error}` : ''}`).join('\n'),
  );
}

// Two captures with identical bytes are one capture, whatever the filenames say.
// The search shot was silently a copy of the explore shot for exactly this
// reason, and a README that shows the same picture twice claims a feature it
// cannot demonstrate.
const byDigest = new Map();
for (const { file, digest } of results) {
  if (!digest) continue;
  const first = byDigest.get(digest);
  if (first) problems.push(`duplicate capture: ${file} is byte-identical to ${first}`);
  else byDigest.set(digest, file);
}

if (problems.length) {
  console.error(`\n${problems.join('\n')}`);
  process.exitCode = 1;
} else {
  console.log(`\n${results.length} distinct screenshots written to ${OUT}`);
}
