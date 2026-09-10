import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '../route';

vi.mock('@/lib/server/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  newRequestId: () => 'test-request',
  timeRequest: () => ({ done: vi.fn() }),
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('GET /api/ipfs/metadata', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects a missing uri', async () => {
    const response = await GET(new NextRequest('http://localhost/api/ipfs/metadata'));
    expect(response.status).toBe(400);
  });

  it('rejects a non-ipfs non-http uri', async () => {
    const response = await GET(new NextRequest('http://localhost/api/ipfs/metadata?uri=ftp://x'));
    expect(response.status).toBe(400);
  });

  it('returns validated metadata for a gateway url', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ name: 'Token 1', description: 'd' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
    const response = await GET(
      new NextRequest('http://localhost/api/ipfs/metadata?uri=https://gateway/ipfs/QmA'),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.name).toBe('Token 1');
  });

  it('proxies ipfs:// uris through the gateway', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ name: 'Token 2' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const response = await GET(
      new NextRequest('http://localhost/api/ipfs/metadata?uri=ipfs://QmB'),
    );
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/ipfs/QmB'), expect.anything());
  });

  it('returns 404 when the gateway reports not found', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nope', { status: 404 })));
    const response = await GET(
      new NextRequest('http://localhost/api/ipfs/metadata?uri=ipfs://QmC'),
    );
    expect(response.status).toBe(404);
  });

  it('returns 422 for a document that fails schema validation', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ description: 'missing name' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
    const response = await GET(
      new NextRequest('http://localhost/api/ipfs/metadata?uri=ipfs://QmD'),
    );
    expect(response.status).toBe(422);
  });

  it('returns 422 for a non-json document', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('<html>not json</html>', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        }),
      ),
    );
    const response = await GET(
      new NextRequest('http://localhost/api/ipfs/metadata?uri=ipfs://QmE'),
    );
    expect(response.status).toBe(422);
  });
});
