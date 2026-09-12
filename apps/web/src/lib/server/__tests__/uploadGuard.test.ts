import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import {
  validateFile,
  rateLimitUpload,
  clientIp,
  MAX_FILE_SIZE,
  ALLOWED_MIME_TYPES,
} from '@/lib/server/uploadGuard';

function makeRequest(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost/api/ipfs/upload-file', { headers });
}

function makeFile(name: string, type: string, size: number): File {
  return new File([new Uint8Array(size)], name, { type });
}

/**
 * A rejection has to name the rule it broke, in the same envelope every other
 * route returns. These three answered with `{ error: "prose" }` and no code.
 */
async function errorCode(response: Response | null): Promise<string | undefined> {
  if (!response) return undefined;
  const body = (await response.json()) as { error?: { code?: string } };
  return body.error?.code;
}

describe('validateFile', () => {
  it('rejects empty files', async () => {
    const res = validateFile(makeFile('a.png', 'image/png', 0));
    expect(res?.status).toBe(400);
    expect(await errorCode(res)).toBe('UPLOAD_EMPTY_FILE');
  });

  it('rejects oversized files with 413', async () => {
    const res = validateFile(makeFile('a.png', 'image/png', MAX_FILE_SIZE + 1));
    expect(res?.status).toBe(413);
    expect(await errorCode(res)).toBe('UPLOAD_FILE_TOO_LARGE');
  });

  it('rejects disallowed mime types with 415', async () => {
    const res = validateFile(makeFile('a.exe', 'application/x-msdownload', 100));
    expect(res?.status).toBe(415);
    expect(await errorCode(res)).toBe('UPLOAD_MEDIA_TYPE_NOT_ALLOWED');
  });

  it('accepts valid image files within the limit', () => {
    expect(validateFile(makeFile('a.webp', 'image/webp', 1024))).toBeNull();
    for (const mime of ALLOWED_MIME_TYPES) {
      expect(validateFile(makeFile('a', mime, 10))).toBeNull();
    }
  });
});

describe('rateLimitUpload', () => {
  it('allows requests up to the window limit', () => {
    for (let i = 0; i < 10; i += 1) {
      expect(rateLimitUpload(makeRequest())).toBeNull();
    }
  });

  it('rejects the 11th request from the same IP with 429', () => {
    const request = makeRequest({ 'x-forwarded-for': '203.0.113.7' });
    for (let i = 0; i < 10; i += 1) {
      rateLimitUpload(request);
    }
    const res = rateLimitUpload(request);
    expect(res?.status).toBe(429);
    expect(res?.headers.get('Retry-After')).toBeTruthy();
  });

  it('tracks different IPs independently', () => {
    const a = makeRequest({ 'x-forwarded-for': '203.0.113.1' });
    const b = makeRequest({ 'x-forwarded-for': '203.0.113.2' });
    for (let i = 0; i < 10; i += 1) rateLimitUpload(a);
    expect(rateLimitUpload(a)?.status).toBe(429);
    expect(rateLimitUpload(b)).toBeNull();
  });
});

describe('clientIp', () => {
  it('extracts the first hop from x-forwarded-for', () => {
    const request = makeRequest({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' });
    expect(clientIp(request)).toBe('1.2.3.4');
  });

  it('falls back to cf-connecting-ip', () => {
    const request = makeRequest({ 'cf-connecting-ip': '9.9.9.9' });
    expect(clientIp(request)).toBe('9.9.9.9');
  });

  it('falls back to unknown', () => {
    expect(clientIp(makeRequest())).toBe('unknown');
  });
});
