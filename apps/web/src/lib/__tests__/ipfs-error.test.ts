import { describe, it, expect } from 'vitest';
import { IpfsUploadError } from '@/services/ipfs';

describe('IpfsUploadError', () => {
  it('creates error with status code', () => {
    const e = new IpfsUploadError('test', 502);
    expect(e.message).toBe('test');
    expect(e.name).toBe('IpfsUploadError');
    expect(e.statusCode).toBe(502);
  });
});
