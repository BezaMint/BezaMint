import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The search route is the one place the app hands a user a link it did not
 * construct from a page component, and it got both of them wrong: results
 * linked to `/profile/<address>` and `/collection/<id>` while the pages are
 * `/creators/<address>` and `/collections/<id>`, so every result a user clicked
 * landed on a 404. The route had no test at all, so nothing noticed.
 *
 * The last test here is the one that generalises it: every href the route can
 * emit has to match a page that actually exists on disk. That fails on a
 * renamed route, a typo, and this bug, without anyone having to remember the
 * right string in two places.
 */

const ADDRESS = 'GDDTJU3ON5QFT7UZIERA4S4OITCDKZUPXS6GI7HC6OPCBDYVVP3UMRQF';

const CONTRACTS = { nft: 'N', collection: 'C', royalty: 'R', creator: 'CR', factory: 'F' };

const mockRefreshIndexer = vi.fn().mockResolvedValue([]);
const mockGetIndexedEvents = vi.fn().mockReturnValue([]);
const mockSimulateRead = vi.fn();

vi.mock('@/lib/server/indexer', () => ({
  refreshIndexer: () => mockRefreshIndexer(),
  getIndexedEvents: () => mockGetIndexedEvents(),
}));

vi.mock('@/lib/server/contractReader', () => ({
  simulateRead: (...args: unknown[]) => mockSimulateRead(...args),
  addressScVal: (value: string) => value,
  u64ScVal: (value: number) => value,
}));

vi.mock('@/services', () => ({ CONTRACT_IDS: { ...CONTRACTS } }));

const { GET } = await import('../route');

/**
 * Events for a creator with two collections and one minted token.
 *
 * The ids are two digits on purpose: the route refuses a query shorter than
 * two characters, so a one-digit id cannot be found by a search that would
 * legitimately want it.
 */
function indexedActivity() {
  return [
    { type: 'creator_registered', actor: ADDRESS, id: undefined },
    { type: 'collection_created', actor: ADDRESS, id: 12 },
    { type: 'collection_created', actor: ADDRESS, id: 3 },
    { type: 'nft_minted', actor: ADDRESS, id: 74 },
  ];
}

/**
 * Every page route the app serves, as a matcher: `src/app/(app)/collections/[id]`
 * becomes `/collections/:segment`.
 */
function pageRouteMatchers(): RegExp[] {
  const root = join(process.cwd(), 'src', 'app');
  const matchers: RegExp[] = [];

  const walk = (dir: string, segments: string[]) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        // `(app)` and friends are route groups: they organise files, they are
        // not part of the URL.
        const next = entry.name.startsWith('(') ? segments : [...segments, entry.name];
        walk(join(dir, entry.name), next);
      } else if (entry.name === 'page.tsx') {
        const pattern = segments
          .map((segment) =>
            segment.startsWith('[') ? '[^/]+' : segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
          )
          .join('/');
        matchers.push(new RegExp(`^/${pattern}$`));
      }
    }
  };

  walk(root, []);
  return matchers;
}

interface SearchResult {
  type: string;
  title: string;
  subtitle: string;
  category?: string;
  href: string;
}

async function search(query: string, type = 'all'): Promise<SearchResult[]> {
  const response = await GET(
    new NextRequest(`http://localhost/api/search?q=${query}&type=${type}`),
  );
  expect(response.status).toBe(200);
  return (await response.json()).data as SearchResult[];
}

describe('GET /api/search', () => {
  beforeEach(() => {
    mockGetIndexedEvents.mockReturnValue(indexedActivity());
    mockSimulateRead.mockImplementation((_contract: string, method: string) => {
      if (method === 'get_profile') {
        return Promise.resolve({ display_name: 'Stellar Drift Studio', bio: '', avatar_uri: '' });
      }
      if (method === 'get_collection') {
        return Promise.resolve({ metadata_uri: 'ipfs://QmExample', creator: ADDRESS });
      }
      return Promise.reject(new Error(`unexpected read: ${method}`));
    });
  });

  it('finds a creator by display name and links to the creator page', async () => {
    const results = await search('drift');
    expect(results).toEqual([
      {
        type: 'creator',
        title: 'Stellar Drift Studio',
        subtitle: ADDRESS,
        href: `/creators/${ADDRESS}`,
      },
    ]);
  });

  it('links a collection result to the collection page, not to a 404', async () => {
    const results = await search('12', 'collections');

    expect(results).toEqual([
      {
        type: 'collection',
        title: 'Collection #12',
        subtitle: ADDRESS,
        category: 'ipfs://QmExample',
        href: '/collections/12',
      },
    ]);
  });

  it('links an nft result to the token page', async () => {
    const results = await search('74', 'nfts');

    expect(results).toEqual([
      { type: 'nft', title: 'Token #74', subtitle: 'Recently minted', href: '/nft/74' },
    ]);
  });

  it('refuses a query too short to be a search, including a bare id', async () => {
    expect(await search('a')).toEqual([]);
    // A one-digit query is the tempting way to look up token #7, and the route
    // answers with an empty list rather than a validation error. Asserted so
    // the floor is a documented contract rather than a surprise.
    expect(await search('7')).toEqual([]);
  });

  it('survives a target whose record no longer resolves', async () => {
    mockSimulateRead.mockRejectedValue(new Error('contract error'));

    expect(await search('studio')).toEqual([]);
  });

  it('only ever emits hrefs that match a page this app serves', async () => {
    const matchers = pageRouteMatchers();
    // A creator query surfaces creators and their collections; a numeric one
    // surfaces tokens, so between them every branch of the route is exercised.
    const hrefs = [...(await search(ADDRESS)), ...(await search('74', 'nfts'))].map((r) => r.href);

    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      expect(
        matchers.some((m) => m.test(href)),
        `${href} matches no page route`,
      ).toBe(true);
    }
  });

  it('builds a creator link from the address it displays', async () => {
    // Guards the shape of the bug itself: the href was built from the same
    // address as the subtitle, but against a path the app does not serve, so
    // the two agreed and the link was still wrong.
    const [creator] = await search('drift');

    expect(creator?.href).toBe(`/creators/${creator?.subtitle}`);
  });
});
