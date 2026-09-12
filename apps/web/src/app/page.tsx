import Link from 'next/link';
import { HiOutlineExternalLink } from 'react-icons/hi';
import { t } from '@/lib/i18n';
import { EXPLORER_URL } from '@/lib/constants';

// Public marketing page: safe to pre-render and revalidate periodically
// instead of rendering on every request (see docs/caching-strategy.md).
export const revalidate = 60;

// The public repository, used only to link the deployed commit to its diff.
const REPOSITORY_URL = 'https://github.com/BezaMint/BezaMint';

/**
 * The network the frontend is configured for, capitalised for display.
 */
function networkLabel(): string {
  const network = process.env.NEXT_PUBLIC_STELLAR_NETWORK || 'testnet';
  return network.charAt(0).toUpperCase() + network.slice(1);
}

/**
 * The commit this deployment was built from, so a visitor can see which revision
 * is live rather than having to take it on trust. Vercel exposes it to runtime
 * code as `VERCEL_GIT_COMMIT_SHA`; the fallbacks cover hosts that set nothing.
 *
 * Returns an empty string when no usable sha is set, and the caller renders
 * nothing rather than a link to a commit that does not exist.
 */
function deployedCommit(): string {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA || process.env.COMMIT_SHA || '';
  return /^[0-9a-f]{7,40}$/i.test(sha) ? sha : '';
}

export default function HomePage() {
  // Read at render time so the strip reflects the deployment serving it.
  const factoryContractId = process.env.NEXT_PUBLIC_FACTORY_CONTRACT_ID || '';
  const commit = deployedCommit();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="text-center animate-fade-in">
        {/* Logo */}
        <div className="mb-8 inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-bezamint-primary/10 border border-bezamint-primary/20">
          <svg
            width="40"
            height="40"
            viewBox="0 0 40 40"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <rect width="40" height="40" rx="12" fill="url(#logo-gradient)" />
            <path d="M12 28L20 10L28 28H12Z" fill="white" fillOpacity="0.9" />
            <defs>
              <linearGradient id="logo-gradient" x1="0" y1="0" x2="40" y2="40">
                <stop stopColor="#24a563" />
                <stop offset="1" stopColor="#7cd9a3" />
              </linearGradient>
            </defs>
          </svg>
        </div>

        <h1 className="text-5xl sm:text-6xl font-bold tracking-tight mb-4">
          <span className="text-gradient">BezaMint</span>
        </h1>

        <p className="text-lg text-gray-400 max-w-xl mx-auto mb-8 leading-relaxed">
          {t('landing.tagline')}
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link href="/explore" className="btn-primary">
            {t('landing.explore')}
          </Link>
          <Link href="/mint" className="btn-secondary">
            {t('landing.connect')}
          </Link>
        </div>

        {/*
          Which deployment is being served. A visitor on a hosted instance has no
          other way to tell: the address bar says nothing about the network or the
          contract set, and `/api/health` is an endpoint rather than a page.
        */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-gray-500">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400" aria-hidden="true" />
            {t('landing.deployment.status')} {networkLabel()}
          </span>
          {factoryContractId && (
            <a
              href={`${EXPLORER_URL}/contract/${factoryContractId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-bezamint-secondary hover:text-bezamint-primary transition-colors"
            >
              {t('landing.deployment.contracts')}
              <HiOutlineExternalLink className="w-3 h-3" aria-hidden="true" />
            </a>
          )}
          {commit && (
            <a
              href={`${REPOSITORY_URL}/commit/${commit}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 font-mono text-bezamint-secondary hover:text-bezamint-primary transition-colors"
            >
              {t('landing.deployment.commit')} {commit.slice(0, 7)}
              <HiOutlineExternalLink className="w-3 h-3" aria-hidden="true" />
            </a>
          )}
        </div>

        <div className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-2xl mx-auto">
          <div className="card text-center">
            <div className="text-2xl font-bold text-gradient mb-1">{t('landing.create.title')}</div>
            <p className="text-sm text-gray-400">{t('landing.create.body')}</p>
          </div>
          <div className="card text-center">
            <div className="text-2xl font-bold text-gradient mb-1">
              {t('landing.organize.title')}
            </div>
            <p className="text-sm text-gray-400">{t('landing.organize.body')}</p>
          </div>
          <div className="card text-center">
            <div className="text-2xl font-bold text-gradient mb-1">{t('landing.share.title')}</div>
            <p className="text-sm text-gray-400">{t('landing.share.body')}</p>
          </div>
        </div>
      </div>
    </main>
  );
}
