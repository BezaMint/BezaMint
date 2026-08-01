export default function HomePage() {
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
            <path
              d="M12 28L20 10L28 28H12Z"
              fill="white"
              fillOpacity="0.9"
            />
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
          A comprehensive NFT creation and digital asset management platform
          built on the <span className="text-bezamint-secondary font-medium">Stellar</span>{' '}
          network using{' '}
          <span className="text-bezamint-secondary font-medium">Soroban</span> smart contracts.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <button className="btn-primary">
            Connect Wallet
          </button>
          <button className="btn-secondary">
            Explore Collections
          </button>
        </div>

        <div className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-2xl mx-auto">
          <div className="card text-center">
            <div className="text-2xl font-bold text-gradient mb-1">Create</div>
            <p className="text-sm text-gray-400">
              Mint unique NFTs with custom metadata and royalties
            </p>
          </div>
          <div className="card text-center">
            <div className="text-2xl font-bold text-gradient mb-1">Organize</div>
            <p className="text-sm text-gray-400">
              Manage collections with powerful search and filtering
            </p>
          </div>
          <div className="card text-center">
            <div className="text-2xl font-bold text-gradient mb-1">Share</div>
            <p className="text-sm text-gray-400">
              Prepare assets for marketplace integration on Stellar
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
