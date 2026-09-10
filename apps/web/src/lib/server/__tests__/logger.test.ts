import { describe, expect, it } from 'vitest';
import { redactFields } from '../logger';

describe('redactFields', () => {
  it('redacts known secret keys', () => {
    const result = redactFields({ apiKey: 'abc123', jwt: 'xxx', token: 'yyy' });
    expect(result).toEqual({ apiKey: '[REDACTED]', jwt: '[REDACTED]', token: '[REDACTED]' });
  });

  it('redacts camelCase and kebab-case variants', () => {
    const result = redactFields({ xApiKey: 'k', authorization: 'Bearer x', api_key: 'k2' });
    expect(result).toEqual({
      xApiKey: '[REDACTED]',
      authorization: '[REDACTED]',
      api_key: '[REDACTED]',
    });
  });

  it('passes through non-secret fields', () => {
    const result = redactFields({ requestId: 'r1', status: 200, path: '/api/x' });
    expect(result).toEqual({ requestId: 'r1', status: 200, path: '/api/x' });
  });

  it('redacts secrets nested inside objects', () => {
    const result = redactFields({
      headers: { authorization: 'Bearer secret', 'x-request-id': 'rid' },
    });
    expect(result).toEqual({ headers: { authorization: '[REDACTED]', 'x-request-id': 'rid' } });
  });

  it('redacts secrets inside arrays', () => {
    const result = redactFields({ list: [{ password: 'p' }, { name: 'ok' }] });
    expect(result).toEqual({ list: [{ password: '[REDACTED]' }, { name: 'ok' }] });
  });

  it('handles undefined fields', () => {
    expect(redactFields(undefined)).toBeUndefined();
  });
});
