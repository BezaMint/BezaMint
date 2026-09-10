'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { HiOutlineRefresh, HiOutlineExclamationCircle, HiOutlineHome } from 'react-icons/hi';

/**
 * Route-scoped error boundary for the authenticated (app) section.
 * A crash inside the mint, explore, or dashboard area is contained here
 * instead of blanking the whole application, and offers reset + navigation.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    // Log for debugging (client-side only)
    console.error('App section error:', error);
  }, [error]);

  return (
    <div className="page-container flex flex-col items-center justify-center text-center min-h-[60vh]">
      <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 mb-6">
        <HiOutlineExclamationCircle className="w-10 h-10 text-red-400" />
      </div>
      <h1 className="text-2xl font-bold mb-2">Something went wrong in this view</h1>
      <p className="text-gray-500 mb-8 max-w-md">
        The error is contained to this page. Try again, or head back to your dashboard.
      </p>
      <div className="flex gap-3">
        <button onClick={reset} className="btn-primary flex items-center gap-2">
          <HiOutlineRefresh className="w-4 h-4" />
          Try Again
        </button>
        <button
          onClick={() => router.push('/dashboard')}
          className="btn-secondary flex items-center gap-2"
        >
          <HiOutlineHome className="w-4 h-4" />
          Go to Dashboard
        </button>
      </div>
    </div>
  );
}
