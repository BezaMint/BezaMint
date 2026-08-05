'use client';

import { useEffect } from 'react';
import { HiOutlineRefresh, HiOutlineExclamationCircle } from 'react-icons/hi';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to the console for debugging (client-side only)
    console.error('Application error:', error);
  }, [error]);

  return (
    <div className="page-container flex flex-col items-center justify-center text-center min-h-[60vh]">
      <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 mb-6">
        <HiOutlineExclamationCircle className="w-10 h-10 text-red-400" />
      </div>
      <h1 className="text-2xl font-bold text-white mb-2">Something went wrong</h1>
      <p className="text-gray-400 mb-8 max-w-md">
        An unexpected error occurred. Try refreshing the page, or return to the dashboard.
      </p>
      <div className="flex gap-3">
        <button onClick={reset} className="btn-primary flex items-center gap-2">
          <HiOutlineRefresh className="w-4 h-4" />
          Try Again
        </button>
      </div>
    </div>
  );
}
