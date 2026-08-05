import Link from 'next/link';
import { HiOutlineHome, HiOutlineSearch } from 'react-icons/hi';

export default function NotFound() {
  return (
    <div className="page-container flex flex-col items-center justify-center text-center min-h-[60vh]">
      <p className="text-7xl font-bold text-gradient mb-4">404</p>
      <h1 className="text-2xl font-bold text-white mb-2">Page not found</h1>
      <p className="text-gray-400 mb-8 max-w-md">
        The page you are looking for doesn&apos;t exist or has been moved.
      </p>
      <div className="flex gap-3">
        <Link href="/" className="btn-primary flex items-center gap-2">
          <HiOutlineHome className="w-4 h-4" />
          Back to Home
        </Link>
        <Link href="/explore" className="btn-secondary flex items-center gap-2">
          <HiOutlineSearch className="w-4 h-4" />
          Explore NFTs
        </Link>
      </div>
    </div>
  );
}
