'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { HiOutlineSearch, HiOutlineX } from 'react-icons/hi';

interface SearchBarProps {
  placeholder?: string;
  onSearch?: (query: string) => void;
  initialQuery?: string;
  compact?: boolean;
}

export default function SearchBar({
  placeholder = 'Search NFTs, collections, creators...',
  onSearch,
  initialQuery = '',
  compact = false,
}: SearchBarProps) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    if (onSearch) {
      onSearch(query.trim());
    } else {
      router.push(`/explore?q=${encodeURIComponent(query.trim())}`);
    }
  };

  const clear = () => {
    setQuery('');
    inputRef.current?.focus();
  };

  // Keyboard shortcut: "/" to focus
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '/' && !compact && document.activeElement !== inputRef.current) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [compact]);

  return (
    <form onSubmit={handleSubmit} className="relative w-full">
      <HiOutlineSearch className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        title="Press / to search" placeholder={placeholder}
        className={`input-field pl-12 ${query ? 'pr-10' : ''} ${compact ? 'text-sm py-2' : ''}`}
      />
      {query && (
        <button
          type="button"
          onClick={clear}
          className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-lg text-gray-500 hover:text-gray-300"
        >
          <HiOutlineX className="w-4 h-4" />
        </button>
      )}
      {!compact && !query && (
        <kbd className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-600 border border-gray-700 rounded px-1.5 py-0.5 pointer-events-none">
          /
        </kbd>
      )}
    </form>
  );
}
