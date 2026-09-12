import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import HomePage from '../page';

/**
 * The landing page carries a deployment strip: which network this instance is
 * pointed at, which contract set, and which commit it was built from. It is the
 * only place a visitor can see those facts without reading `/api/health`, so the
 * interesting cases are the ones where a value is missing — the strip has to
 * disappear a piece at a time rather than render a link to a commit that does not
 * exist or a contract address that is empty.
 */
describe('HomePage deployment strip', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_STELLAR_NETWORK', 'testnet');
    vi.stubEnv('NEXT_PUBLIC_FACTORY_CONTRACT_ID', '');
    vi.stubEnv('VERCEL_GIT_COMMIT_SHA', '');
    vi.stubEnv('COMMIT_SHA', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('names the network the deployment is configured for', () => {
    render(<HomePage />);

    expect(screen.getByText(/Live on Stellar Testnet/)).toBeInTheDocument();
  });

  it('capitalises a non-default network rather than echoing the raw value', () => {
    vi.stubEnv('NEXT_PUBLIC_STELLAR_NETWORK', 'mainnet');

    render(<HomePage />);

    expect(screen.getByText(/Live on Stellar Mainnet/)).toBeInTheDocument();
  });

  it('links the configured contract set to Stellar Explorer', () => {
    vi.stubEnv(
      'NEXT_PUBLIC_FACTORY_CONTRACT_ID',
      'CCDPJDAXU467HI7SJ7PJWXSMCWUFEGS47DD4PELTRJCCTM6FTBDTU2HJ',
    );

    render(<HomePage />);

    expect(screen.getByText('Contract set').closest('a')).toHaveAttribute(
      'href',
      'https://stellar.expert/explorer/testnet/contract/CCDPJDAXU467HI7SJ7PJWXSMCWUFEGS47DD4PELTRJCCTM6FTBDTU2HJ',
    );
  });

  it('omits the contract link when no contract set is configured', () => {
    render(<HomePage />);

    expect(screen.queryByText('Contract set')).not.toBeInTheDocument();
  });

  it('shortens the deployed commit and links it to its diff', () => {
    vi.stubEnv('VERCEL_GIT_COMMIT_SHA', '8b9cddd7556f90c81e8f1df4d8f175a426de0826');

    render(<HomePage />);

    const link = screen.getByText(/Deployed from/).closest('a');
    expect(link).toHaveAttribute(
      'href',
      'https://github.com/BezaMint/BezaMint/commit/8b9cddd7556f90c81e8f1df4d8f175a426de0826',
    );
    // Abbreviated for display, the full sha stays in the href.
    expect(link).toHaveTextContent('8b9cddd');
    expect(link).not.toHaveTextContent('f175a426de0826');
  });

  it('falls back to COMMIT_SHA when the host does not set the Vercel variable', () => {
    vi.stubEnv('COMMIT_SHA', '193fd1b963b3e667926602ac9ab893082c1d624a');

    render(<HomePage />);

    expect(screen.getByText(/193fd1b/)).toBeInTheDocument();
  });

  it('omits the commit link when no sha is available', () => {
    render(<HomePage />);

    expect(screen.queryByText(/Deployed from/)).not.toBeInTheDocument();
  });

  it('ignores a value that is not a commit sha instead of building a broken link', () => {
    vi.stubEnv('VERCEL_GIT_COMMIT_SHA', 'not-a-sha');

    render(<HomePage />);

    expect(screen.queryByText(/Deployed from/)).not.toBeInTheDocument();
  });

  it('ignores an over-long value, which would produce a link to nothing', () => {
    // A 41-character value is not a sha: a guard that only checked for presence
    // would build a /commit/<garbage> link and render it as live deployment
    // information. The full sha here is one character too many.
    vi.stubEnv('VERCEL_GIT_COMMIT_SHA', '193fd1b963b3e667926602ac9ab893082c1d624a0');

    render(<HomePage />);

    expect(screen.queryByText(/Deployed from/)).not.toBeInTheDocument();
  });
});
